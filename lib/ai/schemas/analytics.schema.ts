import { z } from 'zod';

export const BackgroundAnalyticsSchema = z.object({
  sentiment: z
    .enum(['positive', 'neutral', 'frustrated', 'aggressively_cold'])
    .catch('neutral')
    .default('neutral'),
  sentiment_score: z.number().min(-1).max(1).catch(0).default(0),
  intent_detected: z.string().min(1).max(120).catch('conversação').default('conversação'),
  urgency_detected: z.boolean().catch(false).default(false),
  objection_handled: z.string().nullable().catch(null).default(null),
  rationale: z.string().max(1000).catch('Interação padrão.').default('Interação padrão.'),
  services: z.array(z.string()).catch([]).default([]),
  objections: z.array(z.string()).catch([]).default([]),
  answers: z.record(z.string(), z.string()).catch({}).default({}),
  new_summary: z.string().max(500).optional(),
});

export type BackgroundAnalyticsOutput = z.infer<typeof BackgroundAnalyticsSchema>;

export const ImagePaymentSchema = z.object({
  amount: z.number(),
  beneficiary: z.string().default(''),
  date: z.string().default(''),
  txid: z.string().default(''),
  bank: z.string().default(''),
});

export const ImageAnalysisSchema = z.object({
  type: z.enum(['pix', 'other']).default('other'),
  description: z.string().default('Imagem recebida'),
  payment: ImagePaymentSchema.nullable().default(null),
});

export type ImageAnalysisOutput = z.infer<typeof ImageAnalysisSchema>;

export const FlushJobSchema = z.object({
  companyId: z.string().uuid(),
  leadPhone: z.string().min(4).max(64),
  leadName: z.string().max(200).default(''),
  gen: z.string().min(8).max(64),
});

export type FlushJobInput = z.infer<typeof FlushJobSchema>;
