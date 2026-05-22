export type ProviderName = 'cerebras' | 'groq' | 'sambanova' | 'gemini';
export type ChainKind = 'conv' | 'tools' | 'bg';

export interface RouteOptions {
  chain?: ChainKind;
  traceId?: string;
}

export interface NeutralProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  format?: string;
  items?: NeutralProperty;
  properties?: Record<string, NeutralProperty>;
}

export interface NeutralToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, NeutralProperty>;
    required?: string[];
  };
}

export interface NormalizedMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolCallRecord {
  name: string;
  args_summary: string;
}

export interface ChatParams {
  systemPrompt: string;
  history: NormalizedMessage[];
  userMessage: string;
  tools: NeutralToolDefinition[];
  toolHandler: (name: string, args: Record<string, any>) => Promise<any>;
  maxIterations: number;
  preferredModel?: string;
}

export interface ChatResult {
  text: string;
  toolsCalled: ToolCallRecord[];
  tokensInput: number;
  tokensOutput: number;
  modelUsed: string;
}

export interface GenerateParams {
  prompt: string;
  jsonMode?: boolean;
  preferredModel?: string;
}

export interface AIProviderAdapter {
  readonly name: ProviderName;
  readonly defaultChatModel: string;
  readonly defaultGenerateModel: string;
  chat(params: ChatParams): Promise<ChatResult>;
  generateText(params: GenerateParams): Promise<string>;
}

export type ErrorKind =
  | 'rate_limit'
  | 'quota_exceeded'
  | 'server_error'
  | 'timeout'
  | 'auth_error'
  | 'unknown';

export interface ProviderRouteResult extends ChatResult {
  provider: ProviderName;
  fallbackUsed: boolean;
}

export interface ProviderGenerateResult {
  text: string;
  provider: ProviderName;
  fallbackUsed: boolean;
}
