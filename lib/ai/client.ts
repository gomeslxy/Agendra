/**
 * Singleton para Google Generative AI.
 * Reusa a mesma instância em todo o codebase para evitar overhead
 * de criar múltiplos clients (cada um carrega config + auth).
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

if (!process.env.GOOGLE_AI_API_KEY) {
  throw new Error('GOOGLE_AI_API_KEY ausente — defina em .env.local');
}

export const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
