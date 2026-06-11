import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import type {
  AIProviderAdapter,
  ChatParams,
  ChatResult,
  GenerateParams,
  NeutralToolDefinition,
} from './types';

function toOpenAITool(t: NeutralToolDefinition): ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as Record<string, unknown>,
    },
  };
}

export class CerebrasAdapter implements AIProviderAdapter {
  readonly name = 'cerebras' as const;
  // llama3.1-8b foi descomissionado pela Cerebras (404 model_not_found em jun/2026),
  // o que fazia TODO turn conversacional queimar uma tentativa falha no 1º hop da
  // chain. gpt-oss-120b é o substituto atual: tool calling confiável e reasoning
  // retornado em campo separado (message.reasoning), nunca vazando no content.
  readonly defaultChatModel = 'gpt-oss-120b';
  readonly defaultGenerateModel = 'gpt-oss-120b';

  private get client() {
    const key = process.env.CEREBRAS_API_KEY;
    if (!key) throw new Error('cerebras: CEREBRAS_API_KEY not set');
    return new OpenAI({ baseURL: 'https://api.cerebras.ai/v1', apiKey: key });
  }

  async chat(params: ChatParams): Promise<ChatResult> {
    const modelName = this.defaultChatModel;
    const tools = params.tools.length > 0 ? params.tools.map(toOpenAITool) : undefined;
    const toolChoice = params.toolMode === 'ANY' ? 'required' : 'auto';
    const reqOpts = params.signal ? { signal: params.signal } : undefined;

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: params.systemPrompt },
      ...params.history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: params.userMessage },
    ];

    const toolsCalled: ChatResult['toolsCalled'] = [];
    let totalInput = 0;
    let totalOutput = 0;
    let iterations = 0;

    // gpt-oss-120b é reasoning model: effort 'low' corta os tokens de raciocínio
    // (~12 vs centenas) sem perder qualidade no atendimento — testado a 622ms RTT.
    const reasoningOpts = { reasoning_effort: 'low' } as Record<string, unknown>;

    let response = await this.client.chat.completions.create(
      { model: modelName, messages, ...reasoningOpts, ...(tools ? { tools, tool_choice: toolChoice } : {}) },
      reqOpts,
    );

    totalInput += response.usage?.prompt_tokens ?? 0;
    totalOutput += response.usage?.completion_tokens ?? 0;

    while (iterations < params.maxIterations) {
      iterations++;
      const choice = response.choices[0];
      const toolCalls = choice.message.tool_calls?.filter(tc => tc.type === 'function');

      if (!toolCalls || toolCalls.length === 0) break;

      messages.push(choice.message as ChatCompletionMessageParam);

      const toolResults: ChatCompletionMessageParam[] = await Promise.all(
        toolCalls.map(async (tc) => {
          let result: any;
          const fn = (tc as any).function as { name: string; arguments: string };
          try {
            const args = JSON.parse(fn.arguments);
            result = await params.toolHandler(fn.name, args);
          } catch (err) {
            const rawMessage = err instanceof Error ? err.message : String(err);
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
          toolsCalled.push({
            name: fn.name,
            args_summary: fn.arguments.substring(0, 500),
          });
          return {
            role: 'tool' as const,
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          };
        })
      );

      messages.push(...toolResults);

      response = await this.client.chat.completions.create(
        { model: modelName, messages, ...reasoningOpts, ...(tools ? { tools, tool_choice: 'auto' } : {}) },
        reqOpts,
      );

      totalInput += response.usage?.prompt_tokens ?? 0;
      totalOutput += response.usage?.completion_tokens ?? 0;
    }

    return {
      text: response.choices[0].message.content || '',
      toolsCalled,
      tokensInput: totalInput,
      tokensOutput: totalOutput,
      modelUsed: modelName,
    };
  }

  async generateText(params: GenerateParams): Promise<string> {
    const modelName = this.defaultGenerateModel;
    const reqOpts = params.signal ? { signal: params.signal } : undefined;
    const response = await this.client.chat.completions.create({
      model: modelName,
      messages: [{ role: 'user', content: params.prompt }],
      ...({ reasoning_effort: 'low' } as Record<string, unknown>),
      ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }, reqOpts);
    return response.choices[0].message.content || '';
  }
}
