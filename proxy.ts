import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/** Routes requiring authentication */
const PROTECTED_PREFIXES = ["/inbox", "/agenda", "/leads", "/reports", "/settings", "/onboarding"];

/** Routes for non-authenticated users only */
const AUTH_PREFIXES = ["/login", "/signup", "/verify", "/recuperar-senha", "/nova-senha"];

/** Public marketing routes — no auth check needed, ever */
const PUBLIC_PREFIXES = ["/contato", "/planos", "/sobre", "/termos", "/privacidade"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Fast path: public marketing routes — skip Supabase round-trip entirely
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPublic) {
    return NextResponse.next();
  }

  // Fast path: root without a session cookie — anonymous visitor, nothing to redirect
  const hasSupabaseCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));

  if (pathname === "/" && !hasSupabaseCookie) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: any[]) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            response = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // 1. Protected routes check
    const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
    if (isProtected && !user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    // 2. Auth routes check (redirect to inbox if logged in)
    const isAuthRoute = AUTH_PREFIXES.some((p) => pathname.startsWith(p));
    if (isAuthRoute && user) {
      return NextResponse.redirect(new URL("/inbox", request.url));
    }

    // 3. Root redirect for logged-in user
    if (pathname === "/" && user) {
      return NextResponse.redirect(new URL("/inbox", request.url));
    }
  } catch (e: any) {
    // Stale/revoked session — clear sb-* cookies so each request doesn't repeat this error
    if (e?.code === "refresh_token_not_found") {
      const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
      const res = isProtected
        ? NextResponse.redirect(
            new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url)
          )
        : NextResponse.next({ request: { headers: request.headers } });
      request.cookies
        .getAll()
        .filter((c) => c.name.startsWith("sb-"))
        .forEach((c) => res.cookies.delete(c.name));
      return res;
    }
    return response;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next (all Next.js internals: static, image, RSC, HMR, Turbopack)
     * - favicon.ico (favicon file)
     * - assets/fonts (static assets)
     */
    "/((?!api|_next|favicon\\.ico|assets|fonts|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
