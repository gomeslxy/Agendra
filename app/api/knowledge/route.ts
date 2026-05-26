/**
 * API Route: /api/knowledge
 *
 * POST — Recebe arquivos via FormData, extrai texto, gera embeddings (768D)
 *        e salva chunks na tabela company_knowledge.
 * GET  — Lista documentos da empresa (source_name únicos + contagem de chunks).
 * DELETE — Remove todos os chunks de um source_name.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, getUserProfile } from '@/lib/supabase/server';
import { genAI } from '@/lib/ai/client';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const MAX_CHUNKS = 200; // cap embedding API calls per upload
const ALLOWED_TYPES = [
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// Magic-byte signatures for allowed formats
const MAGIC_BYTES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    [0x50, 0x4b, 0x03, 0x04], // PK (ZIP-based OOXML)
  ],
  // text/plain: no magic bytes — validated by UTF-8 decode below
};

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const sigs = MAGIC_BYTES[mimeType];
  if (!sigs) return true; // text/plain — no binary magic check
  return sigs.some((sig) => sig.every((byte, i) => buffer[i] === byte));
}

/**
 * Strips path separators and HTML from a filename, keeps only the last component.
 * Returns a safe, displayable name up to 255 chars.
 */
function sanitizeSourceName(raw: string): string {
  // Strip directory traversal characters and null bytes
  const base = raw.replace(/[\\/\0]/g, '_').replace(/\.\./g, '_');
  // Strip HTML tags
  const noHtml = base.replace(/<[^>]*>/g, '');
  // Trim and cap length
  return noHtml.trim().slice(0, 255) || 'documento';
}

/** Divide texto em chunks com overlap */
function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) chunks.push(chunk); // ignora chunks muito curtos
    start += size - overlap;
  }
  return chunks;
}

/** Extrai texto de buffer de acordo com MIME type */
async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'text/plain') {
    return buffer.toString('utf-8');
  }

  if (mimeType === 'application/pdf') {
    // Dynamic import para evitar problemas de SSR com pdf-parse
    const pdfModule = await import('pdf-parse');
    const pdfParse = (pdfModule as any).default || pdfModule;
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    // Para DOCX: extração robusta usando a biblioteca mammoth (pure JS, segura e rápida para serverless)
    const mammothModule = await import('mammoth');
    const mammoth = mammothModule.default || mammothModule;
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Tipo de arquivo não suportado: ${mimeType}`);
}

/** Gera embedding para um chunk de texto usando text-embedding-005 (768D) */
async function generateEmbedding(text: string): Promise<number[]> {
  const embedModel = genAI.getGenerativeModel({ model: 'text-embedding-005' });
  const result = await embedModel.embedContent(text);
  const values = result.embedding?.values;
  if (!values?.length) throw new Error('Embedding vazio retornado pelo modelo');
  return values;
}

// ── POST /api/knowledge ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const profile = await getUserProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const companyId = profile.memberships?.[0]?.company_id;
    if (!companyId) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Arquivo excede o limite de ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Validate declared MIME against allowlist (client-supplied header)
    const mimeType = file.type || 'text/plain';
    if (!ALLOWED_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: 'Tipo de arquivo não permitido. Use PDF, TXT ou DOCX.' },
        { status: 400 }
      );
    }

    // 1. Extrair texto
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate actual file content via magic bytes — prevents disguised executables
    if (!validateMagicBytes(buffer, mimeType)) {
      return NextResponse.json(
        { error: 'Conteúdo do arquivo não corresponde ao tipo declarado.' },
        { status: 400 }
      );
    }

    let text: string;

    try {
      text = await extractText(buffer, mimeType);
    } catch (err: any) {
      return NextResponse.json(
        { error: `Falha ao extrair texto: ${err.message}` },
        { status: 422 }
      );
    }

    if (!text || text.trim().length < 50) {
      return NextResponse.json(
        { error: 'Documento sem conteúdo suficiente para indexar' },
        { status: 422 }
      );
    }

    // 2. Chunking — cap to MAX_CHUNKS to bound embedding API calls
    const allChunks = chunkText(text);
    const chunks = allChunks.slice(0, MAX_CHUNKS);
    if (chunks.length === 0) {
      return NextResponse.json({ error: 'Nenhum chunk válido gerado' }, { status: 422 });
    }

    // 3. Gerar embeddings em série (evita rate limit)
    // Sanitize filename to prevent path traversal and stored XSS
    const sourceName = sanitizeSourceName(file.name);
    const rows: Array<{
      company_id: string;
      source_name: string;
      content: string;
      embedding: number[];
    }> = [];

    const EMBED_BATCH = 10;
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const results = await Promise.allSettled(batch.map((chunk) => generateEmbedding(chunk)));
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          rows.push({ company_id: companyId, source_name: sourceName, content: batch[idx], embedding: result.value });
        } else {
          console.error('[Knowledge API] Falha ao gerar embedding para chunk:', result.reason);
        }
      });
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Falha ao gerar embeddings. Tente novamente.' },
        { status: 500 }
      );
    }

    // 4. Salvar no banco
    const supabase = await createClient();

    // Remove chunks antigos do mesmo arquivo antes de inserir (upsert by source_name)
    await supabase
      .from('company_knowledge')
      .delete()
      .eq('company_id', companyId)
      .eq('source_name', sourceName);

    const { error: insertError } = await supabase
      .from('company_knowledge')
      .insert(rows);

    if (insertError) {
      console.error('[Knowledge API] Erro ao inserir chunks:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      source_name: sourceName,
      chunks_created: rows.length,
    });
  } catch (err: any) {
    console.error('[Knowledge API] Erro inesperado:', err);
    return NextResponse.json({ error: err.message ?? 'Erro interno' }, { status: 500 });
  }
}

// ── GET /api/knowledge ──────────────────────────────────────────────────────
export async function GET() {
  try {
    const profile = await getUserProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const companyId = profile.memberships?.[0]?.company_id;
    if (!companyId) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 });
    }

    const supabase = await createClient();

    // Agregar por source_name para retornar lista de documentos com contagem de chunks
    const { data, error } = await supabase
      .from('company_knowledge')
      .select('source_name, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Deduplicar por source_name mantendo a data mais recente e contando chunks
    const map = new Map<string, { source_name: string; created_at: string; chunks: number }>();
    for (const row of data ?? []) {
      if (!map.has(row.source_name)) {
        map.set(row.source_name, { source_name: row.source_name, created_at: row.created_at, chunks: 1 });
      } else {
        map.get(row.source_name)!.chunks++;
      }
    }

    return NextResponse.json({ documents: Array.from(map.values()) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── DELETE /api/knowledge ───────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const profile = await getUserProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const companyId = profile.memberships?.[0]?.company_id;
    if (!companyId) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const sourceName = searchParams.get('source_name');

    if (!sourceName) {
      return NextResponse.json({ error: 'source_name é obrigatório' }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('company_knowledge')
      .delete()
      .eq('company_id', companyId)
      .eq('source_name', sourceName);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
