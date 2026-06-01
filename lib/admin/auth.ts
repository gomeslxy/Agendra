// lib/admin/auth.ts
// ─────────────────────────────────────────────────────────────────────────────
// Centralized admin (owner) auth. Server-only.
//
// Security model (after audit S1/S2/S3):
//  - Secrets (password + HMAC salt) come ONLY from env. No hardcoded fallback.
//    If unset, the panel hard-fails closed instead of using a guessable default.
//  - Client IP is taken from Vercel's trusted `x-vercel-forwarded-for` (not the
//    spoofable left-most token of `x-forwarded-for`). Used for rate limiting,
//    audit IP and the session fingerprint.
//  - The real authz boundary is the Supabase session + email allowlist. The
//    password/fingerprint is a secondary lock and is now non-guessable.
// ─────────────────────────────────────────────────────────────────────────────
import "server-only";
import { cookies, headers } from "next/headers";
import crypto from "crypto";

export const ADMIN_COOKIE = "agendra_admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 2; // 2h

// Owner emails are identifiers, not secrets (the Supabase inbox is the real
// gate). They stay overridable via env but keep a fallback so we never lock the
// owner out of production.
const FALLBACK_ADMIN_EMAILS = ["gmlucazz1@gmail.com", "la181009@gmail.com"];

export function getAdminEmails(): string[] {
  const fromEnv = [
    ...(process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL] : []),
    ...(process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(",") : []),
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const merged = new Set([...fromEnv, ...FALLBACK_ADMIN_EMAILS]);
  return Array.from(merged);
}

export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

/** Secrets from env. Throws (fail-closed) when unset — never falls back to a
 *  guessable default. */
function getAdminSecrets(): { password: string; salt: string } {
  const password = process.env.ADMIN_PASSWORD;
  const salt = process.env.ADMIN_SESSION_SALT;
  if (!password || !salt) {
    throw new Error(
      "Admin panel desabilitado: defina ADMIN_PASSWORD e ADMIN_SESSION_SALT no ambiente.",
    );
  }
  return { password, salt };
}

/** Trusted client IP. Vercel overwrites `x-vercel-forwarded-for` with the real
 *  client IP, so it cannot be spoofed by the caller (unlike the left-most token
 *  of `x-forwarded-for`). Falls back to right-most XFF hop / x-real-ip. */
export function getClientIp(h: Headers): string {
  const vercel = h.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    // right-most is the closest trusted hop
    if (hops.length) return hops[hops.length - 1];
  }
  return "0.0.0.0";
}

export async function getRequestMeta(): Promise<{ ip: string; ua: string }> {
  const h = await headers();
  return { ip: getClientIp(h), ua: h.get("user-agent") || "unknown" };
}

export function computeAdminToken(ip: string, ua: string): string {
  const { password, salt } = getAdminSecrets();
  const fingerprint = `${ip}:${ua.substring(0, 128)}`;
  return crypto
    .createHmac("sha256", salt)
    .update(`${password}:${fingerprint}`)
    .digest("hex");
}

export function checkAdminPassword(candidate: string): boolean {
  const { password } = getAdminSecrets();
  // constant-time compare to avoid a timing oracle on the secondary key
  const a = Buffer.from(candidate);
  const b = Buffer.from(password);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** True when the request carries a valid fingerprinted admin cookie. */
export async function hasValidAdminCookie(): Promise<boolean> {
  const stored = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!stored) return false;
  const { ip, ua } = await getRequestMeta();
  try {
    // constant-time compare — both are fixed-length sha256 hex digests
    const a = Buffer.from(stored);
    const b = Buffer.from(computeAdminToken(ip, ua));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false; // secrets unset → fail closed
  }
}

export async function setAdminCookie(): Promise<void> {
  const { ip, ua } = await getRequestMeta();
  const token = computeAdminToken(ip, ua);
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  });
}

export async function clearAdminCookie(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
}
