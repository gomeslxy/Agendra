import {
  GoogleGenerativeAI,
  type Content,
  type FunctionDeclaration,
  type FunctionDeclarationSchema,
  FunctionCallingMode,
  SchemaType,
} from '@google/generative-ai';
import type {
  AIProviderAdapter,
  ChatParams,
  ChatResult,
  GenerateParams,
  NeutralProperty,
  NeutralToolDefinition,
} from './types';

function mapType(t: string): SchemaType {
  const m: Record<string, SchemaType> = {
    string: SchemaType.STRING,
    number: SchemaType.NUMBER,
    boolean: SchemaType.BOOLEAN,
    array: SchemaType.ARRAY,
    object: SchemaType.OBJECT,
  };
  return m[t] ?? SchemaType.STRING;
}

function toGeminiProperty(p: NeutralProperty): any {
  const base: any = { type: mapType(p.type) };
  if (p.description) base.description = p.description;
  if (p.enum) base.enum = p.enum;
  if (p.format) base.format = p.format;
  if (p.items) base.items = toGeminiProperty(p.items);
  if (p.properties) {
    base.properties = Object.fromEntries(
      Object.entries(p.properties).map(([k, v]) => [k, toGeminiProperty(v)])
    );
  }
  return base;
}

function toGeminiDeclaration(t: NeutralToolDefinition): FunctionDeclaration {
  return {
    name: t.name,
    description: t.description,
    parameters: {
      type: SchemaType.OBJECT,
      properties: Object.fromEntries(
        Object.entries(t.parameters.properties).map(([k, v]) => [k, toGeminiProperty(v)])
      ),
      required: t.parameters.required ?? [],
    } as FunctionDeclarationSchema,
  };
}

function toGeminiHistory(history: { role: 'user' | 'assistant'; content: string }[]): Content[] {
  const contents = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));
  // Gemini requires history to start with a 'user' turn
  const firstUser = contents.findIndex((c) => c.role === 'user');
  return firstUser !== -1 ? contents.slice(firstUser) : [];
}

export class GeminiAdapter implements AIProviderAdapter {
  readonly name = 'gemini' as const;
  readonly defaultChatModel = 'gemini-2.5-flash';
  readonly defaultGenerateModel = 'gemini-2.5-flash-lite';

  private get genAI() {
    const key = process.env.GOOGLE_AI_API_KEY;
    if (!key) throw new Error('gemini: GOOGLE_AI_API_KEY not set');
    return new GoogleGenerativeAI(key);
  }

  async chat(params: ChatParams): Promise<ChatResult> {
    const modelName = params.preferredModel ?? this.defaultChatModel;
    const declarations = params.tools.map(toGeminiDeclaration);
    const callingMode = params.toolMode === 'ANY' ? FunctionCallingMode.ANY : FunctionCallingMode.AUTO;

    const model = this.genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: params.systemPrompt,
      tools: declarations.length > 0 ? [{ functionDeclarations: declarations }] : undefined,
      toolConfig: declarations.length > 0
        ? { functionCallingConfig: { mode: callingMode } }
        : undefined,
    });

    const chat = model.startChat({ history: toGeminiHistory(params.history) });
    let response = await chat.sendMessage(params.userMessage);

    const toolsCalled: ChatResult['toolsCalled'] = [];
    let totalInput = response.response.usageMetadata?.promptTokenCount ?? 0;
    let totalOutput = response.response.usageMetadata?.candidatesTokenCount ?? 0;
    let iterations = 0;

    while (iterations < params.maxIterations) {
      iterations++;
      const candidate = response.response.candidates?.[0];
      if (!candidate) break;

      const functionCalls = candidate.content.parts
        .filter((p: any) => p.functionCall)
        .map((p: any) => p.functionCall!);

      if (functionCalls.length === 0) break;

      const toolResults = await Promise.all(
        functionCalls.map(async (fc: any) => {
          toolsCalled.push({
            name: fc.name,
            args_summary: JSON.stringify(fc.args ?? {}).substring(0, 100),
          });
          try {
            const result = await params.toolHandler(fc.name, fc.args ?? {});
            return { functionResponse: { name: fc.name, response: result } };
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

            return {
              functionResponse: {
                name: fc.name,
                response: { error: safeMessage },
              },
            };
          }
        })
      );

      response = await chat.sendMessage(toolResults);
      totalInput += response.response.usageMetadata?.promptTokenCount ?? 0;
      totalOutput += response.response.usageMetadata?.candidatesTokenCount ?? 0;
    }

    return {
      text: response.response.text() || '',
      toolsCalled,
      tokensInput: totalInput,
      tokensOutput: totalOutput,
      modelUsed: modelName,
    };
  }

  async generateText(params: GenerateParams): Promise<string> {
    const modelName = params.preferredModel ?? this.defaultGenerateModel;
    const model = this.genAI.getGenerativeModel({
      model: modelName,
      ...(params.jsonMode
        ? { generationConfig: { responseMimeType: 'application/json' } }
        : {}),
    });
    const result = await model.generateContent(params.prompt);
    return result.response.text();
  }
}
