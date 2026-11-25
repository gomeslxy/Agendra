import { GoogleGenerativeAI } from '@google/generative-ai';
import type { createAdminClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logging';

type Admin = ReturnType<typeof createAdminClient>;

let _embeddingGenAI: GoogleGenerativeAI | null = null;
function getEmbeddingClient(): GoogleGenerativeAI {
  if (!_embeddingGenAI) {
    _embeddingGenAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
  }
  return _embeddingGenAI;
}

export interface SemanticKnowledgeResult {
  text: string;
  status: 'ok' | 'empty' | 'failed' | 'timeout';
}

/**
 * Busca conhecimento vetorial relevante no Supabase usando embeddings 768D (text-embedding-005).
 * Usa AbortController com clearTimeout garantido (budget 2.5s).
 */
export async function getSemanticKnowledge(
  companyId: string,
  query: string,
  admin: Admin,
): Promise<SemanticKnowledgeResult> {
  try {
    if (!process.env.GOOGLE_AI_API_KEY) return { text: '', status: 'empty' };
    const embedModel = getEmbeddingClient().getGenerativeModel({ model: 'text-embedding-005' });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    let result: Awaited<ReturnType<typeof embedModel.embedContent>>;
    try {
      result = await embedModel.embedContent(query, {
        signal: controller.signal,
      } as Parameters<typeof embedModel.embedContent>[1]);
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        logError('[RAG] Semantic search timed out after 2500ms');
        return { text: '', status: 'timeout' };
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const values = result.embedding?.values;
    if (!values || values.length === 0) return { text: '', status: 'empty' };

    const { data: matches, error } = await admin.rpc('match_knowledge', {
      p_company_id: companyId,
      p_embedding: values,
      p_match_threshold: 0.7,
      p_match_count: 3,
    });

    if (error) {
      logError('[RAG] match_knowledge RPC error:', error.message);
      return { text: '', status: 'failed' };
    }

    const typedMatches = (matches ?? []) as Array<{ content: string }>;
    if (typedMatches.length > 0) {
      const formatted = typedMatches.map((m) => `- ${m.content}`).join('\n');
      return {
        text: `\n## Informações de Suporte Encontradas (RAG)\nUse estes dados de FAQ e base de conhecimento se forem relevantes à dúvida do lead:\n${formatted}\n`,
        status: 'ok',
      };
    }

    return { text: '', status: 'empty' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'Timeout') {
      logError('[RAG] Semantic search timed out after 2500ms');
      return { text: '', status: 'timeout' };
    }
    logError('[RAG] Semantic search failed, fallback to none:', msg);
    return { text: '', status: 'failed' };
  }
}
