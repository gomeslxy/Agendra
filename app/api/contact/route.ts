import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send";
import { checkRateLimitAsync } from "@/lib/rate-limit";

/** Escapes HTML special chars to prevent injected markup from being rendered in email clients */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!(await checkRateLimitAsync(`contact:${ip}`, 5, 60_000))) {
      return NextResponse.json({ error: "Muitas tentativas. Aguarde 1 minuto." }, { status: 429 });
    }

    const body = await req.json();
    const name    = typeof body.name    === "string" ? body.name.trim()    : "";
    const email   = typeof body.email   === "string" ? body.email.trim()   : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: "Todos os campos são obrigatórios." }, { status: 400 });
    }

    // Length limits — prevent oversized payloads / log flooding
    if (name.length > 100)    return NextResponse.json({ error: "Nome muito longo (máx 100)." }, { status: 400 });
    if (email.length > 320)   return NextResponse.json({ error: "Email inválido." }, { status: 400 });
    if (subject.length > 200) return NextResponse.json({ error: "Assunto muito longo (máx 200)." }, { status: 400 });
    if (message.length > 5000) return NextResponse.json({ error: "Mensagem muito longa (máx 5000)." }, { status: 400 });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email inválido." }, { status: 400 });
    }

    // Escape all user-supplied values before interpolating into HTML
    const safeName    = escapeHtml(name);
    const safeEmail   = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message);

    const adminEmailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
        <h2 style="color: #0f172a; margin-top: 0;">Novo Contato - Agendra</h2>
        <p style="color: #475569; font-size: 16px;">Você recebeu uma nova mensagem através do formulário de contato.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p><strong>Nome:</strong> ${safeName}</p>
        <p><strong>E-mail:</strong> ${safeEmail}</p>
        <p><strong>Assunto:</strong> ${safeSubject}</p>
        <div style="background-color: #f8fafc; padding: 16px; border-radius: 4px; margin-top: 16px;">
          <p style="margin: 0; white-space: pre-wrap;">${safeMessage}</p>
        </div>
      </div>
    `;

    await sendEmail({
      to: "la181009@gmail.com",
      subject: `[Contato Agendra] ${safeSubject}`,
      html: adminEmailHtml,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API_CONTACT_ERROR]", error);
    return NextResponse.json({ error: "Erro interno ao processar sua mensagem." }, { status: 500 });
  }
}
