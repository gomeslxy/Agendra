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

export class GroqAdapter implements AIProviderAdapter {
  readonly name = 'groq' as const;
  readonly defaultChatModel = 'llama-3.3-70b-versatile';
  readonly defaultGenerateModel = 'llama-3.3-70b-versatile';

  private get client() {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('groq: GROQ_API_KEY not set');
    return new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: key });
  }

  async chat(params: ChatParams): Promise<ChatResult> {
    const modelName = this.defaultChatModel;
    const tools = params.tools.length > 0 ? params.tools.map(toOpenAITool) : undefined;
    // Groq returns 400 "Failed to call a function" when tool_choice='required' on complex
    // prompts. Always use 'auto' — Groq's 70b is reliable enough for tool calling.
    const toolChoice = 'auto';
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

    let response = await this.client.chat.completions.create(
      { model: modelName, messages, ...(tools ? { tools, tool_choice: toolChoice } : {}) },
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
            result = { error: err instanceof Error ? err.message : String(err) };
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
        { model: modelName, messages, ...(tools ? { tools, tool_choice: 'auto' } : {}) },
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
    const response = await this.client.chat.completions.create({
      model: modelName,
      messages: [{ role: 'user', content: params.prompt }],
      ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    });
    return response.choices[0].message.content || '';
  }
}
