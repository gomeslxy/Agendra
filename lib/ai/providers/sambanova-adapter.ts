import type {
  AIProviderAdapter, ChatParams, ChatResult, GenerateParams,
  NeutralToolDefinition,
} from './types';

const BASE = 'https://api.sambanova.ai/v1';
const FETCH_TIMEOUT_MS = 30_000;

function toOpenAITool(t: NeutralToolDefinition) {
  return {
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  };
}

export class SambaNovaAdapter implements AIProviderAdapter {
  readonly name = 'sambanova' as const;
  readonly defaultChatModel = 'Meta-Llama-3.3-70B-Instruct';
  readonly defaultGenerateModel = 'Meta-Llama-3.3-70B-Instruct';

  private async post<T = any>(body: Record<string, any>, signal?: AbortSignal): Promise<T> {
    const key = process.env.SAMBANOVA_API_KEY;
    if (!key) throw new Error('sambanova: SAMBANOVA_API_KEY not set');
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ thinking: false, ...body }),
      signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`SambaNova ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json() as Promise<T>;
  }

  async chat(params: ChatParams): Promise<ChatResult> {
    const modelName = this.defaultChatModel;
    const tools = params.tools.length ? params.tools.map(toOpenAITool) : undefined;
    const toolChoice = params.toolMode === 'ANY' ? 'required' : 'auto';

    const messages: any[] = [
      { role: 'system', content: params.systemPrompt },
      ...params.history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: params.userMessage },
    ];

    const toolsCalled: ChatResult['toolsCalled'] = [];
    let totalIn = 0, totalOut = 0, iterations = 0;

    let resp = await this.post(
      {
        model: modelName,
        messages,
        ...(tools ? { tools, tool_choice: toolChoice } : {}),
        ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
      },
      params.signal,
    );
    totalIn += resp.usage?.prompt_tokens ?? 0;
    totalOut += resp.usage?.completion_tokens ?? 0;

    while (iterations < params.maxIterations) {
      iterations++;
      const choice = resp.choices?.[0];
      const tcs = choice?.message?.tool_calls?.filter((tc: any) => tc.type === 'function');
      if (!tcs?.length) break;

      messages.push(choice.message);
      const results = await Promise.all(tcs.map(async (tc: any) => {
        const fn = tc.function as { name: string; arguments: string };
        let result: any;
        try { result = await params.toolHandler(fn.name, JSON.parse(fn.arguments)); }
        catch (e) {
          const rawMessage = e instanceof Error ? e.message : String(e);
          const lowercase = rawMessage.toLowerCase();
          const technicalIndicators = [
            'select', 'insert', 'update', 'delete', 'postgres', 'supabase', 'database', 'db',
            'gcal', 'google', 'calendar', 'token', 'auth', 'unauthorized', 'jwt', 'secret',
            'network', 'fetch', 'http', 'status', 'timeout', 'connection', 'null', 'undefined',
            'reference', 'typeerror', 'syntaxerror', 'parse', 'json', 'xml', 'api', 'internal',
            'server error', 'row', 'column', 'foreign key', 'unique constraint', 'violates'
          ];
          const hasTechnicalIndicator = technicalIndicators.some(indicator => lowercase.includes(indicator));
          const safeMessage = hasTechnicalIndicator 
            ? 'Não foi possível completar esta ação no momento devido a uma instabilidade temporária. Por favor, tente novamente em instantes ou fale com um de nossos atendentes.'
            : rawMessage;
          result = { error: safeMessage };
        }
        toolsCalled.push({ name: fn.name, args_summary: fn.arguments.slice(0, 500) });
        return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) };
      }));
      messages.push(...results);

      resp = await this.post(
        {
          model: modelName,
          messages,
          ...(tools ? { tools, tool_choice: 'auto' } : {}),
          ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
        },
        params.signal,
      );
      totalIn += resp.usage?.prompt_tokens ?? 0;
      totalOut += resp.usage?.completion_tokens ?? 0;
    }

    return {
      text: resp.choices?.[0]?.message?.content ?? '',
      toolsCalled, tokensInput: totalIn, tokensOutput: totalOut, modelUsed: modelName,
    };
  }

  async generateText(params: GenerateParams): Promise<string> {
    const resp = await this.post({
      model: this.defaultGenerateModel,
      messages: [{ role: 'user', content: params.prompt }],
      ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }, params.signal);
    return resp.choices?.[0]?.message?.content ?? '';
  }
}
