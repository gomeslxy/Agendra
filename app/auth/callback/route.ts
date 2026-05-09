/**
 * OAuth + Email Confirmation Callback Route
 *
 * Supabase redireciona para cá após:
 * - Login com Google (OAuth)
 * - Confirmação de email (magic link / signup)
 *
 * Troca o code pelo token de sessão e redireciona para o app.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/inbox";
  const cookieStore = await cookies();

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: any[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Redirecionar para o destino original ou inbox
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Redirecionar com mensagem de erro em caso de falha
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
