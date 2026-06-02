import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { contactEmail } from "@/lib/email/templates/contact";

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

    await sendEmail({
      to: "la181009@gmail.com",
      subject: `[Contato Agendra] ${subject}`,
      html: contactEmail({ name, email, subject, message }),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API_CONTACT_ERROR]", error);
    return NextResponse.json({ error: "Erro interno ao processar sua mensagem." }, { status: 500 });
  }
}
