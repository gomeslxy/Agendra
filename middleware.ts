import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Route classification
//
// Security model: middleware is the first barrier (Edge), not the only one.
// Layouts and Server Components add a second verification (defense-in-depth).
//
// Route groups:
//   PUBLIC          → anonymous access OK, skip Supabase entirely
//   PROTECTED       → requires a valid Supabase session (→ /login)
//   ADMIN_PROTECTED → requires valid session AND is the /admin tree (→ /admin/login)
//   AUTH_ONLY       → only for non-authenticated users (redirect logged-in to /inbox)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fast-path: skip Supabase round-trip entirely.
 * Includes marketing pages, legal pages, auth infrastructure (/auth/callback),
 * and the blog.
 */
const PUBLIC_PREFIXES = [
  "/contato",
  "/planos",
  "/sobre",
  "/termos",
  "/privacidade",
  "/blog",
  "/auth", // Supabase OAuth/magic-link callback — MUST NOT be intercepted
];

/**
 * Routes that require an authenticated Supabase session.
 * Unauthenticated requests are redirected to /login?next=<pathname>.
 * /accept-invite and /onboarding require session to guard server-side logic.
 */
const PROTECTED_PREFIXES = [
  "/inbox",
  "/agenda",
  "/leads",
  "/reports",
  "/settings",
  "/onboarding",
  "/accept-invite",
];

/**
 * The admin subtree. Needs a Supabase session AND the fingerprinted admin cookie.
 * Redirects to /admin/login (not /login) when session is missing —
 * this avoids mixing tenant login with admin login flows.
 */
const ADMIN_PREFIX = "/admin";

/**
 * Accessible only when NOT authenticated. Logged-in users are sent to /inbox.
 */
const AUTH_ONLY_PREFIXES = [
  "/login",
  "/signup",
  "/verify",
  "/recuperar-senha",
  "/nova-senha",
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitize the `next` redirect target so it is always a relative pathname.
 * Prevents open-redirect attacks if something upstream ever passes an absolute URL.
 */
function safeNext(pathname: string): string {
  // Ensure the value starts with "/" — discard anything that looks external.
  if (!pathname.startsWith("/")) return "/inbox";
  return pathname;
}

/**
 * Build a redirect to /login while carrying the sanitized `next` parameter.
 */
function redirectToLogin(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", safeNext(pathname));
  return NextResponse.redirect(url);
}

/**
 * Clear all Supabase auth cookies from `res`.
 * Called when the session is expired/revoked so subsequent requests don't
 * keep hitting Supabase with a dead token.
 */
function clearSupabaseCookies(
  request: NextRequest,
  res: NextResponse,
): NextResponse {
  request.cookies
    .getAll()
    .filter((c) => c.name.startsWith("sb-"))
    .forEach((c) => res.cookies.delete(c.name));
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Public fast-path ───────────────────────────────────────────────────
  // Skip Supabase entirely for marketing, legal, blog and auth infrastructure.
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // ── 2. Anonymous visitor at root — nothing to do ─────────────────────────
  // Avoid a Supabase round-trip for the common case of an anonymous landing.
  const hasSessionCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));

  if (pathname === "/" && !hasSessionCookie) {
    return NextResponse.next();
  }

  // ── 3. Build the mutable response (Supabase SSR requires this pattern) ────
  let response = NextResponse.next({ request: { headers: request.headers } });

  // ── 4. Supabase session verification ─────────────────────────────────────
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            // Propagate refreshed tokens to both the incoming request object
            // and the outgoing response so downstream Server Components see
            // the updated session.
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options as any),
            );
          },
        },
      },
    );


    // getUser() is the authoritative check — never trust getSession() alone.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // ── 4a. Admin subtree ─────────────────────────────────────────────────
    // /admin requires a session. Fine-grained checks (email allowlist + HMAC
    // fingerprint cookie) live in the Server Components themselves.
    // We redirect to /admin/login — NOT /login — to keep auth flows distinct.
    if (pathname.startsWith(ADMIN_PREFIX)) {
      if (!user) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin/login";
        return NextResponse.redirect(url);
      }
      // Authenticated: let the request through. /admin page.tsx enforces
      // email allowlist + fingerprinted cookie (defense-in-depth layer 2).
      return response;
    }

    // ── 4b. Tenant-app protected routes ───────────────────────────────────
    if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) && !user) {
      return redirectToLogin(request, pathname);
    }

    // ── 4c. Auth-only routes (redirect logged-in users away) ──────────────
    if (AUTH_ONLY_PREFIXES.some((p) => pathname.startsWith(p)) && user) {
      return NextResponse.redirect(new URL("/inbox", request.url));
    }

    // ── 4d. Root redirect for authenticated user ──────────────────────────
    if (pathname === "/" && user) {
      return NextResponse.redirect(new URL("/inbox", request.url));
    }
  } catch (err: any) {
    // ── 5. Handle broken/revoked sessions ────────────────────────────────
    // Any AuthApiError that indicates an invalid session (expired, revoked,
    // missing) should clear the stale sb-* cookies so the next request
    // doesn't keep retrying with a dead token.
    const isAuthError =
      err?.name === "AuthApiError" ||
      err?.code === "refresh_token_not_found" ||
      err?.code === "invalid_jwt" ||
      err?.message?.includes("JWT");

    if (isAuthError) {
      const isProtectedRoute =
        pathname.startsWith(ADMIN_PREFIX) ||
        PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

      if (isProtectedRoute) {
        const target = pathname.startsWith(ADMIN_PREFIX)
          ? new URL("/admin/login", request.url)
          : new URL(`/login?next=${encodeURIComponent(safeNext(pathname))}`, request.url);
        return clearSupabaseCookies(
          request,
          NextResponse.redirect(target),
        );
      }

      // Not a protected route: clear the dead cookies but let the request pass.
      return clearSupabaseCookies(
        request,
        NextResponse.next({ request: { headers: request.headers } }),
      );
    }

    // Unexpected error — pass through with the original response.
    // Do NOT expose the error to the client.
    return response;
  }

  return response;
}

// ─────────────────────────────────────────────────────────────────────────────
// Matcher
//
// Excludes:
//   api/          — Route Handlers (have their own auth)
//   _next/        — Next.js internals (static, image, RSC, HMR, Turbopack)
//   auth/callback — Supabase OAuth/magic-link callback (also in PUBLIC_PREFIXES
//                   as defense-in-depth, but the matcher exclusion is faster)
//   favicon.ico   — Browser default request
//   assets/fonts  — Static assets
//   *.ext         — Any file with a known static extension
// ─────────────────────────────────────────────────────────────────────────────
export const config = {
  matcher: [
    "/((?!api|_next|auth/callback|favicon\\.ico|assets|fonts|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
