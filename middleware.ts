import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/** Routes requiring authentication */
const PROTECTED_PREFIXES = ["/inbox", "/agenda", "/leads", "/reports", "/settings"];

/** Routes for non-authenticated users only */
const AUTH_PREFIXES = ["/login", "/signup", "/verify", "/recuperar-senha", "/nova-senha"];

export async function middleware(request: NextRequest) {
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

    const { pathname } = request.nextUrl;

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

    // 3. Root redirect
    if (pathname === "/" && user) {
      return NextResponse.redirect(new URL("/inbox", request.url));
    }
  } catch (e) {
    // Fail safe for local development without Supabase config
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

