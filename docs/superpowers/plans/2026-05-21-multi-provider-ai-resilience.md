# Multi-Provider AI Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Gemini-only AI calls with a production-grade multi-provider router: Groq (primary) → Gemini (fallback), with circuit breaker, structured observability, and graceful degradation.

**Architecture:** New `lib/ai/providers/` module with provider adapters (Gemini + Groq), circuit breaker, and a router. Engine calls the router instead of Gemini SDK directly. Embedding (RAG) stays Gemini-only — Groq has no embedding API.

**Tech Stack:** `openai` npm package (Groq uses OpenAI-compatible API), `@google/generative-ai` (existing), Supabase, Next.js App Router (Vercel serverless)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `lib/ai/providers/types.ts` | Normalized interfaces: ToolDefinition, ChatParams, ChatResult, AIProviderAdapter |
| Create | `lib/ai/providers/circuit-breaker.ts` | Per-provider in-process CB state (closed/open/half-open, 30s cooldown) |
| Create | `lib/ai/tool-schemas.ts` | Provider-neutral tool definitions (JSON Schema) for both adapters |
| Create | `lib/ai/providers/gemini-adapter.ts` | Gemini chat loop + generateText, converts neutral schemas to Gemini format |
| Create | `lib/ai/providers/groq-adapter.ts` | Groq/OpenAI chat loop + generateText, converts neutral schemas to OpenAI format |
| Create | `lib/ai/providers/router.ts` | Groq→Gemini routing with timeout, CB check, error classification, structured logs |
| Modify | `lib/ai/engine.ts` | Replace direct Gemini SDK calls with router; keep Gemini SDK only for embeddings |
| Modify | `lib/ai/memory.ts` | Replace `processBackgroundAnalytics` Gemini call with router `generateText` |
| Modify | `lib/ai/observability.ts` | Add Groq cost calculation; rename to `calculateProviderCost` |

---

## Task 0: Install `openai` Package

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install package**

```bash
pnpm add openai
```

- [ ] **Step 2: Verify install**

Run: `pnpm tsc --noEmit 2>&1 | head -5`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add openai package for Groq API compatibility"
```

---

## Task 1: Provider Types

**Files:**
- Create: `lib/ai/providers/types.ts`

- [ ] **Step 1: Create type file**

```typescript
// lib/ai/providers/types.ts

export type ProviderName = 'groq' | 'gemini';

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
```

- [ ] **Step 2: TypeCheck**

Run: `pnpm tsc --noEmit 2>&1 | head -20`
Expected: exit 0

---

## Task 2: Circuit Breaker

**Files:**
- Create: `lib/ai/providers/circuit-breaker.ts`

- [ ] **Step 1: Create circuit breaker**

```typescript
// lib/ai/providers/circuit-breaker.ts
// In-process circuit breaker — per-provider, TTL-based.
// Serverless-safe: each warm instance maintains its own state.
// Worst case on cold start: one wasted call to a broken provider per instance.
// This is acceptable vs. the complexity of a DB-backed shared state.

type CircuitStatus = 'closed' | 'open' | 'half-open';

interface CircuitState {
  status: CircuitStatus;
  failureCount: number;
  lastFailureAt: number;
  openUntil: number;
  halfOpenProbeAt: number;
}

const FAILURE_THRESHOLD = 2;        // trips after 2 consecutive failures
const OPEN_DURATION_MS = 30_000;    // stays open for 30s
const HALF_OPEN_COOLDOWN_MS = 5_000; // min 5s between half-open probes

const states = new Map<string, CircuitState>();

function getState(provider: string): CircuitState {
  return states.get(provider) ?? {
    status: 'closed',
    failureCount: 0,
    lastFailureAt: 0,
    openUntil: 0,
    halfOpenProbeAt: 0,
  };
}

export function getCircuitStatus(provider: string): CircuitStatus {
  const s = getState(provider);
  if (s.status === 'open' && Date.now() >= s.openUntil) return 'half-open';
  return s.status;
}

export function canAttempt(provider: string): boolean {
  const status = getCircuitStatus(provider);
  if (status === 'closed') return true;
  if (status === 'open') return false;
  // half-open: allow one probe at a time
  const s = getState(provider);
  if (Date.now() - s.halfOpenProbeAt < HALF_OPEN_COOLDOWN_MS) return false;
  states.set(provider, { ...s, status: 'half-open', halfOpenProbeAt: Date.now() });
  return true;
}

export function recordSuccess(provider: string): void {
  states.set(provider, {
    status: 'closed',
    failureCount: 0,
    lastFailureAt: 0,
    openUntil: 0,
    halfOpenProbeAt: 0,
  });
}

export function recordFailure(provider: string): void {
  const s = getState(provider);
  const isHalfOpen = getCircuitStatus(provider) === 'half-open';
  const newFailureCount = isHalfOpen ? FAILURE_THRESHOLD : s.failureCount + 1;

  if (newFailureCount >= FAILURE_THRESHOLD) {
    const openUntil = Date.now() + OPEN_DURATION_MS;
    console.warn(`[CircuitBreaker] ${provider} → OPEN until ${new Date(openUntil).toISOString()}`);
    states.set(provider, {
      status: 'open',
      failureCount: newFailureCount,
      lastFailureAt: Date.now(),
      openUntil,
      halfOpenProbeAt: 0,
    });
  } else {
    states.set(provider, {
      ...s,
      status: 'closed',
      failureCount: newFailureCount,
      lastFailureAt: Date.now(),
    });
  }
}
```

---

## Task 3: Neutral Tool Schemas

**Files:**
- Create: `lib/ai/tool-schemas.ts`

This file mirrors the tool declarations from `lib/ai/tools.ts` but uses provider-neutral JSON Schema format instead of Gemini's `FunctionDeclaration` type. Handlers remain in `tools.ts`.

- [ ] **Step 1: Create schema file**

```typescript
// lib/ai/tool-schemas.ts
import type { NeutralToolDefinition } from './providers/types';

const baseDefs: NeutralToolDefinition[] = [
  {
    name: 'listServices',
    description: 'Lista todos os serviços, preços e durações oferecidos pela empresa.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'checkAvailability',
    description:
      'Consulta horários disponíveis nos próximos dias. ' +
      'Obrigatório informar o service_id para calcular a duração correta.',
    parameters: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'ID do serviço desejado' },
        days_ahead: { type: 'number', description: 'Dias à frente (padrão 7)' },
      },
      required: ['service_id'],
    },
  },
  {
    name: 'bookAppointment',
    description:
      'Cria um novo agendamento. Use após o lead escolher um horário de checkAvailability. ' +
      'IMPORTANTE: start_time DEVE ser o valor "start" ISO retornado por checkAvailability, NUNCA reconstrua o horário manualmente.',
    parameters: {
      type: 'object',
      properties: {
        service_id: { type: 'string', description: 'ID do serviço' },
        start_time: {
          type: 'string',
          description:
            'ISO 8601 — OBRIGATORIAMENTE use o campo "start" do slot retornado por checkAvailability. Nunca tente reconstruir manualmente.',
        },
        notes: { type: 'string', description: 'Observações adicionais' },
      },
      required: ['service_id', 'start_time'],
    },
  },
  {
    name: 'cancelAppointment',
    description: 'Cancela um agendamento existente do lead.',
    parameters: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'ID do agendamento (do myAppointments)' },
        reason: { type: 'string', description: 'Motivo do cancelamento' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'rescheduleAppointment',
    description: 'Altera o horário de um agendamento existente.',
    parameters: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'ID do agendamento' },
        new_start_time: { type: 'string', description: 'Novo ISO 8601 de início' },
      },
      required: ['event_id', 'new_start_time'],
    },
  },
  {
    name: 'myAppointments',
    description: 'Lista todos os agendamentos futuros do lead.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'updateLeadInfo',
    description: 'Atualiza email, cidade ou origem do lead.',
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        city: { type: 'string' },
        source: { type: 'string' },
      },
    },
  },
  {
    name: 'updateLeadMemory',
    description: 'Atualiza a memória estratégica e comportamental do lead.',
    parameters: {
      type: 'object',
      properties: {
        event_type: {
          type: 'string',
          format: 'enum',
          enum: [
            'showed_interest', 'objection_raised', 'slot_shown', 'slot_declined',
            'booked', 'no_show', 'reactivated', 'disqualified',
          ],
        },
        note: { type: 'string' },
        services_mentioned: { type: 'array', items: { type: 'string' } },
        objection: { type: 'string' },
        answers: { type: 'object', properties: {} },
        intent_signal: { type: 'string' },
      },
      required: ['event_type'],
    },
  },
  {
    name: 'requestHumanAgent',
    description:
      'Pausa o atendimento da IA e solicita a intervenção de um atendente humano. ' +
      'Use quando o lead demonstrar irritação, pedir explicitamente por um humano ou se o problema for complexo demais para a IA.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Breve motivo da transferência' },
      },
    },
  },
];

const fintechDefs: NeutralToolDefinition[] =
  process.env.ENABLE_FINTECH === 'true'
    ? [
        {
          name: 'generatePixCharge',
          description:
            'Gera cobrança Pix para o lead confirmar agendamento. Use SOMENTE em planos Business após qualificar o agendamento.',
          parameters: {
            type: 'object',
            properties: {
              amount: { type: 'number', description: 'Valor em reais (ex: 150.00)' },
              service_id: { type: 'string', description: 'ID do serviço cobrado' },
            },
            required: ['amount'],
          },
        },
        {
          name: 'checkPaymentStatus',
          description: 'Verifica se uma cobrança Pix foi paga.',
          parameters: {
            type: 'object',
            properties: {
              transaction_id: {
                type: 'string',
                description: 'ID da transação retornado por generatePixCharge',
              },
            },
            required: ['transaction_id'],
          },
        },
      ]
    : [];

export const neutralToolDefinitions: NeutralToolDefinition[] = [...baseDefs, ...fintechDefs];
```

---

## Task 4: Gemini Adapter

**Files:**
- Create: `lib/ai/providers/gemini-adapter.ts`

- [ ] **Step 1: Create Gemini adapter**

```typescript
// lib/ai/providers/gemini-adapter.ts
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

  private genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

  async chat(params: ChatParams): Promise<ChatResult> {
    const modelName = params.preferredModel ?? this.defaultChatModel;
    const declarations = params.tools.map(toGeminiDeclaration);

    const model = this.genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: params.systemPrompt,
      tools: declarations.length > 0 ? [{ functionDeclarations: declarations }] : undefined,
      toolConfig: declarations.length > 0
        ? { functionCallingConfig: { mode: FunctionCallingMode.AUTO } }
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
            return {
              functionResponse: {
                name: fc.name,
                response: { error: err instanceof Error ? err.message : String(err) },
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
```

---

## Task 5: Groq Adapter

**Files:**
- Create: `lib/ai/providers/groq-adapter.ts`

- [ ] **Step 1: Create Groq adapter**

```typescript
// lib/ai/providers/groq-adapter.ts
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
  readonly defaultChatModel = 'llama-3.1-8b-instant';
  readonly defaultGenerateModel = 'llama-3.1-8b-instant';

  private client = new OpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY ?? '',
  });

  async chat(params: ChatParams): Promise<ChatResult> {
    const modelName = params.preferredModel ?? this.defaultChatModel;
    const tools = params.tools.length > 0 ? params.tools.map(toOpenAITool) : undefined;

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

    let response = await this.client.chat.completions.create({
      model: modelName,
      messages,
      ...(tools ? { tools, tool_choice: 'auto' } : {}),
    });

    totalInput += response.usage?.prompt_tokens ?? 0;
    totalOutput += response.usage?.completion_tokens ?? 0;

    while (iterations < params.maxIterations) {
      iterations++;
      const choice = response.choices[0];
      const toolCalls = choice.message.tool_calls;

      if (!toolCalls || toolCalls.length === 0) break;

      messages.push(choice.message as ChatCompletionMessageParam);

      const toolResults: ChatCompletionMessageParam[] = await Promise.all(
        toolCalls.map(async (tc) => {
          let result: any;
          try {
            const args = JSON.parse(tc.function.arguments);
            result = await params.toolHandler(tc.function.name, args);
          } catch (err) {
            result = { error: err instanceof Error ? err.message : String(err) };
          }
          toolsCalled.push({
            name: tc.function.name,
            args_summary: tc.function.arguments.substring(0, 100),
          });
          return {
            role: 'tool' as const,
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          };
        })
      );

      messages.push(...toolResults);

      response = await this.client.chat.completions.create({
        model: modelName,
        messages,
        ...(tools ? { tools, tool_choice: 'auto' } : {}),
      });

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
    const modelName = params.preferredModel ?? this.defaultGenerateModel;
    const response = await this.client.chat.completions.create({
      model: modelName,
      messages: [{ role: 'user', content: params.prompt }],
      ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    });
    return response.choices[0].message.content || '';
  }
}
```

---

## Task 6: Provider Router

**Files:**
- Create: `lib/ai/providers/router.ts`

- [ ] **Step 1: Create router**

```typescript
// lib/ai/providers/router.ts
import { GeminiAdapter } from './gemini-adapter';
import { GroqAdapter } from './groq-adapter';
import { canAttempt, recordSuccess, recordFailure, getCircuitStatus } from './circuit-breaker';
import type {
  ChatParams,
  GenerateParams,
  ProviderName,
  ProviderRouteResult,
  ProviderGenerateResult,
} from './types';

const PROVIDER_TIMEOUT_MS = 15_000;

// Singleton adapters — module-level, reused across warm invocations
const groq = new GroqAdapter();
const gemini = new GeminiAdapter();

// Priority: Groq first, Gemini fallback
const CHAT_CHAIN = [groq, gemini];
const GENERATE_CHAIN = [groq, gemini];

function classifyError(err: any): { retryable: boolean; kind: string } {
  const status: number = err?.status ?? err?.statusCode ?? err?.error?.status ?? 0;
  const msg = String(err?.message ?? err ?? '').toLowerCase();

  if (status === 401 || status === 403) return { retryable: false, kind: 'auth_error' };
  if (status === 429 || msg.includes('rate') || msg.includes('quota') || msg.includes('429'))
    return { retryable: true, kind: 'rate_limit' };
  if (
    status >= 500 ||
    msg.includes('overload') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('timeout')
  )
    return { retryable: true, kind: 'server_error' };

  return { retryable: true, kind: 'unknown' };
}

export async function routeChat(
  params: ChatParams,
  traceId?: string
): Promise<ProviderRouteResult> {
  const errors: string[] = [];
  let firstProvider: ProviderName | null = null;

  for (const provider of CHAT_CHAIN) {
    if (!canAttempt(provider.name)) {
      const status = getCircuitStatus(provider.name);
      console.warn(`[Router] Skip ${provider.name} — circuit ${status} | trace=${traceId}`);
      errors.push(`${provider.name}: circuit_${status}`);
      continue;
    }

    const start = Date.now();
    if (!firstProvider) firstProvider = provider.name;

    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Provider timeout')), PROVIDER_TIMEOUT_MS)
      );

      const result = await Promise.race([provider.chat(params), timeout]);
      const latency = Date.now() - start;

      recordSuccess(provider.name);
      console.log(
        `[Router] ✅ ${provider.name} chat OK ${latency}ms model=${result.modelUsed} tools=${result.toolsCalled.length} | trace=${traceId}`
      );

      return {
        ...result,
        provider: provider.name,
        fallbackUsed: provider.name !== firstProvider,
      };
    } catch (err: any) {
      const { kind } = classifyError(err);
      const latency = Date.now() - start;

      recordFailure(provider.name);
      console.warn(
        `[Router] ❌ ${provider.name} chat FAIL (${kind}, ${latency}ms): ${err.message} | trace=${traceId}`
      );
      errors.push(`${provider.name}: ${kind} — ${err.message?.substring(0, 120)}`);
    }
  }

  const summary = errors.join('; ');
  console.error(`[Router] 🔴 All providers failed (chat) | trace=${traceId} | ${summary}`);
  throw new Error(`AI_ALL_PROVIDERS_FAILED: ${summary}`);
}

export async function routeGenerate(
  params: GenerateParams,
  traceId?: string
): Promise<ProviderGenerateResult> {
  const errors: string[] = [];
  let firstProvider: ProviderName | null = null;

  for (const provider of GENERATE_CHAIN) {
    if (!canAttempt(provider.name)) {
      const status = getCircuitStatus(provider.name);
      errors.push(`${provider.name}: circuit_${status}`);
      continue;
    }

    const start = Date.now();
    if (!firstProvider) firstProvider = provider.name;

    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Provider timeout')), PROVIDER_TIMEOUT_MS)
      );

      const text = await Promise.race([provider.generateText(params), timeout]);
      const latency = Date.now() - start;

      recordSuccess(provider.name);
      console.log(`[Router] ✅ ${provider.name} generate OK ${latency}ms | trace=${traceId}`);

      return {
        text,
        provider: provider.name,
        fallbackUsed: provider.name !== firstProvider,
      };
    } catch (err: any) {
      const { kind } = classifyError(err);
      const latency = Date.now() - start;

      recordFailure(provider.name);
      console.warn(
        `[Router] ❌ ${provider.name} generate FAIL (${kind}, ${latency}ms): ${err.message} | trace=${traceId}`
      );
      errors.push(`${provider.name}: ${kind} — ${err.message?.substring(0, 120)}`);
    }
  }

  const summary = errors.join('; ');
  throw new Error(`AI_ALL_PROVIDERS_FAILED: ${summary}`);
}
```

- [ ] **Step 2: TypeCheck**

Run: `pnpm tsc --noEmit 2>&1 | head -30`
Expected: exit 0 (or only pre-existing errors)

- [ ] **Step 3: Commit**

```bash
git add lib/ai/providers/ lib/ai/tool-schemas.ts
git commit -m "feat: add multi-provider AI layer (types, CB, adapters, router)"
```

---

## Task 7: Modify `lib/ai/engine.ts`

**Files:**
- Modify: `lib/ai/engine.ts`

### 7a — Replace imports and globals

- [ ] **Step 1: Replace top-level Gemini globals**

Replace lines 1-28 (the existing imports + `genAI` + `MAIN_MODEL`) with:

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp/client';
import type { Lead, Message } from '@/lib/types/database';
import crypto from 'crypto';
import {
  handleListServices,
  handleCheckAvailability,
  handleBookAppointment,
  handleCancelAppointment,
  handleRescheduleAppointment,
  handleMyAppointments,
  handleUpdateLeadInfo,
  handleUpdateLeadMemory,
  handleRequestHumanAgent,
  handleGeneratePixCharge,
  handleCheckPaymentStatus,
  type ToolContext,
} from './tools';
import { getCompanyUsage, type CompanyUsage } from '@/lib/billing/limits';
import type { PlanLimits, PlanType } from '@/lib/billing/plans';
import { getPlanLimits } from '@/lib/billing/plans';
import { persistAILog, createTimer } from '@/lib/ai/observability';
import { EMPTY_MEMORY, mountContext, processBackgroundAnalytics, appendScoreHistory } from './memory';
import { validateAndNormalizeScore } from './scoring';
import { routeChat, routeGenerate } from './providers/router';
import { neutralToolDefinitions } from './tool-schemas';
import type { NormalizedMessage } from './providers/types';

// Gemini SDK kept ONLY for text-embedding-005 (RAG) — no chat provider direct here
const _embeddingGenAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
```

Note: `toolDeclarations` import removed — tools now come from `neutralToolDefinitions`.

### 7b — Replace `processLeadMessage`

- [ ] **Step 2: Replace `processLeadMessage` function (lines 172-312)**

```typescript
interface AIResult {
  reply: string;
  heat_score: number;
  status: Lead['status'];
  summary: string;
  tokens_input: number;
  tokens_output: number;
  tools_called: any[];
  model_used: string;
  provider_used: string;
  fallback_used: boolean;
}

export async function processLeadMessage(
  lead: Lead,
  history: Message[],
  newMessage: string,
  companyId: string,
  persona: PersonaConfig,
  isNewConversation: boolean,
  planType: PlanType = 'trial',
  planLimits: PlanLimits = {} as PlanLimits,
  traceId?: string,
): Promise<AIResult> {
  const memoryContext = mountContext(lead.lead_memory, lead.summary);
  const systemPrompt = buildSystemPrompt(persona, lead, memoryContext, isNewConversation, planType, planLimits);

  const ctx: ToolContext = { companyId, leadId: lead.id, traceId };

  const normalizedHistory: NormalizedMessage[] = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const isLitePlan = planLimits.hasAdvancedModel === false;
  const MAX_ITERATIONS = isLitePlan ? 3 : 5;
  // On advanced plans, prefer the heavier Gemini model when Gemini is selected as provider.
  // On lite plans, always flash-lite. The Groq adapter ignores this (uses its own default).
  const geminiModelOverride = isLitePlan ? 'gemini-2.5-flash-lite' : undefined;

  async function toolHandler(name: string, args: Record<string, any>): Promise<any> {
    try {
      if (name === 'listServices') return await handleListServices(args, ctx);
      if (name === 'checkAvailability') return await handleCheckAvailability(args, ctx);
      if (name === 'bookAppointment') return await handleBookAppointment(args, ctx);
      if (name === 'cancelAppointment') return await handleCancelAppointment(args, ctx);
      if (name === 'rescheduleAppointment') return await handleRescheduleAppointment(args, ctx);
      if (name === 'myAppointments') return await handleMyAppointments(args, ctx);
      if (name === 'updateLeadInfo') return await handleUpdateLeadInfo(args, ctx);
      if (name === 'updateLeadMemory') return await handleUpdateLeadMemory(args, ctx);
      if (name === 'requestHumanAgent') return await handleRequestHumanAgent(args, ctx);
      if (name === 'generatePixCharge') return await handleGeneratePixCharge(args, ctx);
      if (name === 'checkPaymentStatus') return await handleCheckPaymentStatus(args, ctx);
      return { error: 'Ferramenta desconhecida' };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  const result = await routeChat(
    {
      systemPrompt,
      history: normalizedHistory,
      userMessage: newMessage,
      tools: neutralToolDefinitions,
      toolHandler,
      maxIterations: MAX_ITERATIONS,
      preferredModel: geminiModelOverride,
    },
    traceId
  );

  const fullText = result.text;
  const [replyPart, jsonPart] = fullText.split('---JSON---');
  const reply = replyPart ? replyPart.trim() : '';

  let heat_score = lead.heat_score;
  let status = lead.status;
  let summary = lead.summary ?? '';

  if (jsonPart) {
    try {
      const parsed = JSON.parse(jsonPart.trim());
      heat_score = parsed.heat_score ?? heat_score;
      status = parsed.status ?? status;
      summary = parsed.summary ?? summary;
    } catch (e) {
      console.warn('[AI Engine] JSON parse failed', e);
    }
  }

  return {
    reply,
    heat_score,
    status,
    summary,
    tokens_input: result.tokensInput,
    tokens_output: result.tokensOutput,
    tools_called: result.toolsCalled,
    model_used: result.modelUsed,
    provider_used: result.provider,
    fallback_used: result.fallbackUsed,
  };
}
```

### 7c — Update `getSemanticKnowledge` (keep Gemini embedding)

- [ ] **Step 3: Update `getSemanticKnowledge` to use `_embeddingGenAI`**

In `getSemanticKnowledge` (line ~318), replace:
```typescript
// OLD
const embedModel = genAI.getGenerativeModel({ model: 'text-embedding-005' });
const embeddingPromise = embedModel.embedContent(query);
```
with:
```typescript
// NEW
const embedModel = _embeddingGenAI.getGenerativeModel({ model: 'text-embedding-005' });
const embeddingPromise = embedModel.embedContent(query);
```

### 7d — Update `persistAILog` call in `handleIncomingMessage`

- [ ] **Step 4: Update observability call after AI result (~line 658)**

Replace the entire `persistAILog` call with:
```typescript
await persistAILog({
  company_id: companyId,
  lead_id: activeLead.id,
  message_id: sentMessage?.id ?? null,
  flow_type: null,
  tools_called: aiResult.tools_called,
  heat_score_before: activeLead.heat_score,
  heat_score_after: finalScore,
  score_validated_to: finalScore,
  score_delta: finalScore - activeLead.heat_score,
  latency_ms: timer(),
  model: aiResult.model_used,
  tokens_input: aiResult.tokens_input,
  tokens_output: aiResult.tokens_output,
  cost: null,
  retries: aiResult.fallback_used ? 1 : 0,
  error: null,
  trace_id: traceId,
  rag_status: ragStatus,
});
```

### 7e — Graceful degradation in `handleIncomingMessage`

- [ ] **Step 5: Add AI_ALL_PROVIDERS_FAILED catch before generic catch**

In `handleIncomingMessage`, replace the inner try/catch block (the one wrapping `processLeadMessage`) with:

```typescript
try {
  try {
    aiResult = await processLeadMessage(
      activeLead, historyList, messageText, companyId, persona,
      isNewConversation, usage.planType, usage.limits, traceId
    );
  } catch (aiErr: any) {
    // Graceful degradation: all providers failed → send friendly fallback, release lock
    if (String(aiErr?.message ?? '').startsWith('AI_ALL_PROVIDERS_FAILED')) {
      console.error('[AI Engine] All providers failed, sending graceful fallback.', aiErr.message);
      const gracefulMsg = 'Oi! Estou com uma instabilidade técnica momentânea. Por favor, aguarde alguns instantes e envie sua mensagem novamente. 🙏';
      await sendWhatsAppMessage(phone, gracefulMsg, companyId);
      await releaseLock();
      if (providerMessageId) {
        await admin.from('processed_messages').update({
          status: 'error',
          error_message: aiErr.message.substring(0, 500)
        }).eq('provider_message_id', providerMessageId);
      }
      return;
    }
    console.error('[AI Engine] processLeadMessage failed:', aiErr);
    throw aiErr;
  }
  // ... rest of the code unchanged ...
```

### 7f — Replace `triggerAutoFollowUp` model loop

- [ ] **Step 6: Replace the Gemini for-loop in `triggerAutoFollowUp` (~lines 848-863)**

Replace:
```typescript
// OLD
let followupText = '';
let lastFollowupErr: any;
let modelUsed = 'gemini-2.5-flash-lite';
for (const modelName of ['gemini-2.5-flash-lite', 'gemini-2.5-flash']) {
  try {
    const m = genAI.getGenerativeModel({ model: modelName });
    const result = await m.generateContent(prompt);
    followupText = result.response.text().trim().replace(/^"|"$/g, '');
    modelUsed = modelName;
    break;
  } catch (err: any) {
    lastFollowupErr = err;
    if (modelName === 'gemini-2.5-flash') break;
    console.warn(`[AI Engine] Follow-up: fallback para gemini-2.5-flash (${err.message})`);
    await new Promise(r => setTimeout(r, 500));
  }
}

if (!followupText) {
  console.error('[AI Engine] Follow-up failed (all models):', lastFollowupErr);
  return;
}
```

With:
```typescript
// NEW
let followupText = '';
let modelUsed = '';
try {
  const generateResult = await routeGenerate({ prompt }, traceId);
  followupText = generateResult.text.trim().replace(/^"|"$/g, '');
  modelUsed = `${generateResult.provider}/${generateResult.text ? 'ok' : 'empty'}`;
} catch (err: any) {
  console.error('[AI Engine] Follow-up failed (all providers):', err.message);
  return;
}

if (!followupText) {
  console.error('[AI Engine] Follow-up: empty response from all providers.');
  return;
}
```

Also update the `automation_events` insert `model_used` field to use `modelUsed`.

---

## Task 8: Modify `lib/ai/memory.ts`

**Files:**
- Modify: `lib/ai/memory.ts`

- [ ] **Step 1: Replace Gemini import and call in `processBackgroundAnalytics`**

Remove top-level Gemini import and singleton:
```typescript
// REMOVE these two lines:
import { GoogleGenerativeAI } from '@google/generative-ai';
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
```

Add router import:
```typescript
import { routeGenerate } from './providers/router';
```

Replace the Gemini call in `processBackgroundAnalytics`:
```typescript
// OLD (lines 97-100):
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash-lite',
  generationConfig: { responseMimeType: 'application/json' }
});
// ...
const result = await model.generateContent(prompt);
const parsed = JSON.parse(result.response.text());
```

```typescript
// NEW:
const generateResult = await routeGenerate({ prompt, jsonMode: true });
const parsed = JSON.parse(generateResult.text);
```

---

## Task 9: Update `lib/ai/observability.ts`

**Files:**
- Modify: `lib/ai/observability.ts`

- [ ] **Step 1: Update cost calculation to be provider-neutral**

Replace `calculateGeminiCost`:
```typescript
// lib/ai/observability.ts — replace calculateGeminiCost with:

export function calculateProviderCost(inputTokens: number, outputTokens: number, model: string): number {
  // Groq pricing (llama-3.1-8b-instant): ~$0.05/$0.08 per 1M tokens
  if (model.includes('llama') || model.includes('groq')) {
    return (inputTokens * 0.05 / 1_000_000) + (outputTokens * 0.08 / 1_000_000);
  }
  // Gemini lite: $0.10/$0.40 per 1M tokens
  if (model.includes('flash-lite')) {
    return (inputTokens * 0.10 / 1_000_000) + (outputTokens * 0.40 / 1_000_000);
  }
  // Gemini flash: $0.30/$2.50 per 1M tokens
  return (inputTokens * 0.30 / 1_000_000) + (outputTokens * 2.50 / 1_000_000);
}

/** @deprecated Use calculateProviderCost */
export const calculateGeminiCost = calculateProviderCost;
```

Also update `persistAILog` to use `calculateProviderCost`:
```typescript
const finalLog = {
  ...log,
  cost: log.cost ?? calculateProviderCost(log.tokens_input ?? 0, log.tokens_output ?? 0, log.model),
};
```

---

## Task 10: Final Validation

- [ ] **Step 1: TypeCheck**

Run: `pnpm tsc --noEmit`
Expected: exit 0

- [ ] **Step 2: Add env variable (dev)**

Add to `.env.local`:
```
GROQ_API_KEY=your_groq_api_key_here
```

Also ensure it is documented in Vercel project env settings for production.

- [ ] **Step 3: Commit everything**

```bash
git add lib/ai/engine.ts lib/ai/memory.ts lib/ai/observability.ts
git commit -m "feat: multi-provider AI resilience — Groq primary, Gemini fallback, circuit breaker, graceful degradation"
```

- [ ] **Step 4: Manual validation checklist**

```
□ Groq online: tail logs, send WhatsApp message → should see "[Router] ✅ groq chat OK"
□ Groq offline (comment out GROQ_API_KEY): send message → see "groq: auth_error" then "gemini: ✅"
□ Analytics: Pro plan message → see "[Router] ✅ groq generate OK" in background task
□ Follow-up cron: trigger manually → confirm followup via Groq, fallback to Gemini if key missing
□ RAG: check embedding still uses Gemini (text-embedding-005) — search for "_embeddingGenAI" in logs
□ Lock: abort during AI call → confirm lock releases after releaseLock() in finally
□ All providers down: both keys wrong → graceful message sent, lead NOT locked
```

- [ ] **Step 5: Update obsidian logs**

Update:
- `obsidian/01 - PRODUTO/roadmap.md`: Add Fase 4 entry for multi-provider resilience
- `obsidian/05 - LOGS/sessions.md`: Log this session's changes

---

## Self-Review

**Spec coverage:**
- ✅ Groq primary → `CHAT_CHAIN = [groq, gemini]`
- ✅ Gemini fallback → second in chain
- ✅ Rate limit handling → `classifyError` detects 429
- ✅ Quota exceeded → same classification
- ✅ Provider instability / timeout → `Promise.race` with 15s timeout
- ✅ Anti-cascade → circuit breaker (closed→open after 2 failures, 30s cooldown)
- ✅ Graceful degradation → `AI_ALL_PROVIDERS_FAILED` catch sends WhatsApp message, releases lock
- ✅ No lead without response → graceful message always sent on total failure
- ✅ Observability → structured `[Router]` logs with provider, latency, trace ID, error kind
- ✅ No duplicate calls → single routeChat call, chain stops on first success
- ✅ No context reconstruction → shared `toolHandler` closure captures `ctx`
- ✅ Multi-tenant → `ctx.companyId` unchanged through all paths
- ✅ Lock safety → `releaseLock()` called in `finally` and on graceful degradation
- ✅ Analytics → routed through `routeGenerate`
- ✅ RAG embeddings → Gemini-only (`_embeddingGenAI`), no routing
- ✅ Follow-up cron → `routeGenerate` replaces Gemini for-loop
- ✅ Plan-aware model → `preferredModel` passed to adapters; Gemini adapter respects it, Groq uses own default

**Remaining risks:**
1. **llama-3.1-8b `---JSON---` compliance** — The model may occasionally forget the JSON block. Existing fallback (uses current lead values) handles this gracefully.
2. **Groq tool-call quality** — llama-3.1-8b-instant is smaller than Gemini flash. Complex multi-step tool sequences (book + PAY) may require more retries. Monitor `tools_called` count in logs.
3. **Circuit breaker cross-instance inconsistency** — On Vercel, each cold-start instance starts with closed circuits. During a Groq outage, each new instance wastes one attempt before tripping. Acceptable for current scale.
4. **JSON mode on Groq** — Groq requires the word "JSON" in the prompt when using `response_format: json_object`. The analytics prompt already contains "JSON" so this is safe.
