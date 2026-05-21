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
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const ALLOWED_TYPES = [
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

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
    const pdfParse = (await import('pdf-parse')).default;
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    // Para DOCX: extrair texto simples removendo XML tags
    // Uma abordagem leve sem dependência extra
    const content = buffer.toString('utf-8');
    // Extrair texto dos elementos w:t do XML do docx
    const textMatches = content.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [];
    const text = textMatches
      .map((m) => m.replace(/<[^>]+>/g, ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text || buffer.toString('utf-8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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

    // 2. Chunking
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      return NextResponse.json({ error: 'Nenhum chunk válido gerado' }, { status: 422 });
    }

    // 3. Gerar embeddings em série (evita rate limit)
    const sourceName = file.name;
    const rows: Array<{
      company_id: string;
      source_name: string;
      content: string;
      embedding: number[];
    }> = [];

    for (const chunk of chunks) {
      try {
        const embedding = await generateEmbedding(chunk);
        rows.push({ company_id: companyId, source_name: sourceName, content: chunk, embedding });
      } catch (err) {
        console.error('[Knowledge API] Falha ao gerar embedding para chunk:', err);
        // Continua com os outros chunks
      }
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
