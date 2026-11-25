/**
 * API Route: /api/knowledge
 *
 * POST   — Recebe arquivos via FormData, extrai texto, gera embeddings em lote (768D)
 *          via `batchEmbedContents` com `AbortController` e salva chunks na tabela `company_knowledge`.
 * GET    — Lista documentos da empresa (source_name únicos + contagem de chunks).
 * DELETE — Remove todos os chunks de um source_name.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@/lib/supabase/server';
import { requireTenantContext, TenantContextError } from '@/lib/tenant/context';
import { getCompanyUsage } from '@/lib/billing/limits';
import { logError, logInfo } from '@/lib/logging';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const MAX_CHUNKS = 200;
const EMBED_BATCH_SIZE = 50;
const EMBED_TIMEOUT_MS = 20_000;
const ALLOWED_TYPES = [
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAGIC_BYTES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    [0x50, 0x4b, 0x03, 0x04], // PK (ZIP-based OOXML)
  ],
};

let genAISingleton: GoogleGenerativeAI | null = null;
let cachedApiKey: string | undefined;

function getGenAI(): GoogleGenerativeAI {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error('GOOGLE_AI_API_KEY ausente — configure a variável de ambiente.');
  if (!genAISingleton || cachedApiKey !== key) {
    genAISingleton = new GoogleGenerativeAI(key);
    cachedApiKey = key;
  }
  return genAISingleton;
}

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const sigs = MAGIC_BYTES[mimeType];
  if (!sigs) return true;
  return sigs.some((sig) => sig.every((byte, i) => buffer[i] === byte));
}

function resolveMimeType(file: File): string {
  if (file.type && ALLOWED_TYPES.includes(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'txt') return 'text/plain';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return file.type || 'application/octet-stream';
}

function sanitizeSourceName(raw: string): string {
  const base = raw.replace(/[\\/\0]/g, '_').replace(/\.\./g, '_');
  const noHtml = base.replace(/<[^>]*>/g, '');
  return noHtml.trim().slice(0, 255) || 'documento';
}

function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) chunks.push(chunk);
    start += size - overlap;
  }
  return chunks;
}

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'text/plain') {
    return buffer.toString('utf-8');
  }

  if (mimeType === 'application/pdf') {
    const pdfModule = (await import('pdf-parse')) as unknown as {
      default?: (buf: Buffer) => Promise<{ text: string }>;
    };
    const pdfParse = pdfModule.default ?? (pdfModule as unknown as (buf: Buffer) => Promise<{ text: string }>);
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammothModule = (await import('mammoth')) as unknown as {
      default?: { extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }> };
      extractRawText?: (input: { buffer: Buffer }) => Promise<{ value: string }>;
    };
    const mammoth = mammothModule.default ?? mammothModule;
    if (!mammoth.extractRawText) {
      throw new Error('Falha ao carregar extrator DOCX');
    }
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Tipo de arquivo não suportado: ${mimeType}`);
}

/**
 * Generates embeddings for a batch of chunks (up to 50) using `batchEmbedContents`
 * with an `AbortController` and guaranteed `clearTimeout` cleanup.
 */
async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  const embedModel = getGenAI().getGenerativeModel({ model: 'text-embedding-005' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

  try {
    const response = await embedModel.batchEmbedContents(
      {
        requests: texts.map((text) => ({
          content: { role: 'user', parts: [{ text }] },
        })),
      },
      { signal: controller.signal },
    );

    const embeddings = response.embeddings ?? [];
    if (embeddings.length !== texts.length) {
      throw new Error(`Contagem de embeddings divergente (${embeddings.length}/${texts.length})`);
    }

    return embeddings.map((item) => {
      if (!item.values?.length) {
        throw new Error('Embedding vazio retornado pelo modelo');
      }
      return item.values;
    });
  } finally {
    clearTimeout(timer);
  }
}

// ── POST /api/knowledge ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    if (!process.env.GOOGLE_AI_API_KEY) {
      logError('[Knowledge API] GOOGLE_AI_API_KEY não configurada');
      return NextResponse.json(
        { error: 'Serviço de embeddings não configurado. Contate o suporte.' },
        { status: 503 },
      );
    }

    const { companyId } = await requireTenantContext({ requireAdmin: true });
    const usage = await getCompanyUsage(companyId);
    if (!usage.limits.hasRAG) {
      return NextResponse.json(
        { error: 'Seu plano atual não inclui Base de Conhecimento (RAG).' },
        { status: 403 },
      );
    }

    const formData = await req.formData();
    const fileEntry = formData.get('file');
    const file = fileEntry instanceof File ? fileEntry : null;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Arquivo excede o limite de ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 },
      );
    }

    const mimeType = resolveMimeType(file);
    if (!ALLOWED_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: 'Tipo de arquivo não permitido. Use PDF, TXT ou DOCX.' },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!validateMagicBytes(buffer, mimeType)) {
      return NextResponse.json(
        { error: 'Conteúdo do arquivo não corresponde ao tipo declarado.' },
        { status: 400 },
      );
    }

    let text: string;
    try {
      text = await extractText(buffer, mimeType);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logError('[Knowledge API] Falha ao extrair texto:', msg);
      return NextResponse.json({ error: `Falha ao extrair texto: ${msg}` }, { status: 422 });
    }

    if (!text || text.trim().length < 50) {
      return NextResponse.json(
        { error: 'Documento sem conteúdo suficiente para indexar (mínimo 50 caracteres)' },
        { status: 422 },
      );
    }

    const allChunks = chunkText(text);
    const chunks = allChunks.slice(0, MAX_CHUNKS);
    if (chunks.length === 0) {
      return NextResponse.json({ error: 'Nenhum chunk válido gerado' }, { status: 422 });
    }

    const sourceName = sanitizeSourceName(file.name);
    const rows: Array<{
      company_id: string;
      source_name: string;
      content: string;
      embedding: number[];
    }> = [];

    let failedChunks = 0;
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      try {
        const vectors = await generateBatchEmbeddings(batch);
        vectors.forEach((embedding, idx) => {
          rows.push({
            company_id: companyId,
            source_name: sourceName,
            content: batch[idx],
            embedding,
          });
        });
      } catch (batchErr: unknown) {
        failedChunks += batch.length;
        const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
        logError('[Knowledge API] Falha no lote de embeddings:', msg);
      }
    }

    if (rows.length === 0) {
      const reason =
        failedChunks > 0
          ? `Todos os ${failedChunks} chunks falharam ao gerar embeddings. Verifique a chave da API do Gemini ou tente novamente.`
          : 'Falha ao gerar embeddings. Tente novamente.';
      logError('[Knowledge API] Nenhum embedding gerado —', reason);
      return NextResponse.json({ error: reason }, { status: 500 });
    }

    if (failedChunks > 0) {
      logInfo(
        `[Knowledge API] ${failedChunks}/${chunks.length} chunks falharam — continuando com ${rows.length} vetores válidos`,
      );
    }

    const supabase = await createClient();
    await supabase
      .from('company_knowledge')
      .delete()
      .eq('company_id', companyId)
      .eq('source_name', sourceName);

    const { error: insertError } = await supabase.from('company_knowledge').insert(rows);

    if (insertError) {
      logError('[Knowledge API] Erro ao inserir chunks:', insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      source_name: sourceName,
      chunks_created: rows.length,
      chunks_failed: failedChunks,
    });
  } catch (err: unknown) {
    if (err instanceof TenantContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : 'Erro interno';
    logError('[Knowledge API] Erro inesperado:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── GET /api/knowledge ──────────────────────────────────────────────────────
export async function GET() {
  try {
    const { companyId } = await requireTenantContext();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('company_knowledge')
      .select('source_name, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const map = new Map<string, { source_name: string; created_at: string; chunks: number }>();
    for (const row of data ?? []) {
      const existing = map.get(row.source_name);
      if (!existing) {
        map.set(row.source_name, {
          source_name: row.source_name,
          created_at: row.created_at,
          chunks: 1,
        });
      } else {
        existing.chunks++;
      }
    }

    return NextResponse.json({ documents: Array.from(map.values()) });
  } catch (err: unknown) {
    if (err instanceof TenantContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : 'Erro interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── DELETE /api/knowledge ───────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { companyId } = await requireTenantContext({ requireAdmin: true });

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
  } catch (err: unknown) {
    if (err instanceof TenantContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : 'Erro interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
