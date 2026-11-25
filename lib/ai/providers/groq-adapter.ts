import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { sanitizeToolError } from '../error-sanitizer';
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

export class GroqAdapter implements AIProviderAdapter {
  readonly name = 'groq' as const;
  readonly defaultChatModel = 'llama-3.3-70b-versatile';
  readonly defaultGenerateModel = 'llama-3.3-70b-versatile';

  private get client(): OpenAI {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('groq: GROQ_API_KEY not set');
    return new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: key });
  }

  async chat(params: ChatParams): Promise<ChatResult> {
    const modelName = this.defaultChatModel;
    const tools = params.tools.length > 0 ? params.tools.map(toOpenAITool) : undefined;
    const toolChoice = 'auto';
    const reqOpts: OpenAI.RequestOptions = {
      ...(params.signal ? { signal: params.signal } : {}),
      ...(params.timeout ? { timeout: params.timeout } : {}),
    };

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: params.systemPrompt },
      ...params.history.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user', content: params.userMessage },
    ];

    const toolsCalled: ChatResult['toolsCalled'] = [];
    let totalInput = 0;
    let totalOutput = 0;
    let iterations = 0;

    let response = await this.client.chat.completions.create(
      {
        model: modelName,
        messages,
        ...(tools ? { tools, tool_choice: toolChoice } : {}),
        ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
      },
      reqOpts,
    );

    totalInput += response.usage?.prompt_tokens ?? 0;
    totalOutput += response.usage?.completion_tokens ?? 0;

    while (iterations < params.maxIterations) {
      iterations++;
      const choice = response.choices[0];
      const toolCalls = choice.message.tool_calls?.filter((tc) => tc.type === 'function');

      if (!toolCalls || toolCalls.length === 0) break;

      messages.push(choice.message as ChatCompletionMessageParam);

      const toolResults: ChatCompletionMessageParam[] = await Promise.all(
        toolCalls.map(async (tc) => {
          const fn = tc.type === 'function' ? tc.function : { name: '', arguments: '{}' };
          let result: unknown;
          try {
            const parsedArgs = JSON.parse(fn.arguments || '{}') as Record<string, unknown>;
            result = await params.toolHandler(fn.name, parsedArgs);
          } catch (err: unknown) {
            result = { error: sanitizeToolError(err) };
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
        }),
      );

      messages.push(...toolResults);

      response = await this.client.chat.completions.create(
        {
          model: modelName,
          messages,
          ...(tools ? { tools, tool_choice: 'auto' } : {}),
          ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
        },
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
    const reqOpts: OpenAI.RequestOptions = {
      ...(params.signal ? { signal: params.signal } : {}),
      ...(params.timeout ? { timeout: params.timeout } : {}),
    };
    const response = await this.client.chat.completions.create(
      {
        model: modelName,
        messages: [{ role: 'user', content: params.prompt }],
        ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      },
      reqOpts,
    );
    return response.choices[0].message.content || '';
  }
}
