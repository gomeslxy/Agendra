// app/admin/login/page.tsx
import { redirect } from "next/navigation";
import { getUser, getCachedUserProfile } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import crypto from "crypto";
import { AdminLoginForm } from "./login-form";

const DEFAULT_ADMIN_PASSWORD = "agendra-proprietario-2026";
const ADMIN_EMAILS = ["gmlucazz1@gmail.com", "la181009@gmail.com"];

function getExpectedToken(): string {
  const password = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  return crypto.createHmac("sha256", "agendra-admin-salt-2026")
    .update(password)
    .digest("hex");
}

export default async function AdminLoginPage() {
  // Layer 1: Supabase Authentication check
  const user = await getUser();
  if (!user) {
    redirect("/login?next=/admin");
  }

  // Layer 2: Whitelist Email verification
  const allowedEmails = [
    ...(process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL] : []),
    ...ADMIN_EMAILS
  ];
  if (!user.email || !allowedEmails.includes(user.email)) {
    // If authenticated user is NOT an admin, redirect back to home/dashboard
    redirect("/inbox");
  }

  // Check if admin session cookie is already valid
  const cookieStore = await cookies();
  const token = cookieStore.get("agendra_admin_session")?.value;
  const expectedToken = getExpectedToken();

  if (token && token === expectedToken) {
    redirect("/admin");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[#FAFAFA] px-6 py-12">
      <div className="w-full max-w-md">
        <div className="border border-[#E4E4E7] bg-white rounded-2xl p-9 shadow-sm">
          <div className="mb-6">
            <Link
              href="/inbox"
              className="inline-flex items-center gap-2 text-xs font-medium text-[#71717A] transition-colors hover:text-[#09090B]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6"/>
              </svg>
              Voltar ao app principal
            </Link>
          </div>

          <div className="mb-5 flex justify-center">
            <Image
              src="/assets/agendra-logo.svg"
              alt="Agendra"
              width={124}
              height={31}
              priority
            />
          </div>

          <h1 className="text-center text-xl font-bold tracking-tight text-[#09090B]">
            Centro de Comando Secreto
          </h1>
          <p className="mb-7 mt-2 text-center text-sm text-[#3F3F46]">
            Insira sua chave de segurança administrativa para acessar o cockpit operacional.
          </p>

          <div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 mb-6 text-xs text-[#92400E]">
            <p className="font-semibold mb-1">Acesso Proprietário Exclusivo</p>
            Sua conta (<span className="font-mono">{user.email}</span>) é elegível. Resolva o desafio de segunda camada para continuar.
          </div>

          <AdminLoginForm />
        </div>
      </div>
    </div>
  );
}
