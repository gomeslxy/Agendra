import crypto from 'crypto';
import { z } from 'zod';

/**
 * Hashes a 6-digit OTP code with SHA-256 before storing/verifying in DB.
 */
export function hashOtpCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim(), 'utf8').digest('hex');
}

export const OtpVerifyBodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Código inválido'),
});

export const OtpResetBodySchema = OtpVerifyBodySchema.extend({
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres'),
});
