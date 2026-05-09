import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send";

export async function POST(req: NextRequest) {
  try {
    const { name, email, subject, message } = await req.json();

    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: "Todos os campos são obrigatórios." },
        { status: 400 }
      );
    }

    // Email to the Admin (the user)
    const adminEmailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
        <h2 style="color: #0f172a; margin-top: 0;">Novo Contato - Agendra</h2>
        <p style="color: #475569; font-size: 16px;">Você recebeu uma nova mensagem através do formulário de contato.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p><strong>Nome:</strong> ${name}</p>
        <p><strong>E-mail:</strong> ${email}</p>
        <p><strong>Assunto:</strong> ${subject}</p>
        <div style="background-color: #f8fafc; padding: 16px; border-radius: 4px; margin-top: 16px;">
          <p style="margin: 0; white-space: pre-wrap;">${message}</p>
        </div>
      </div>
    `;

    await sendEmail({
      to: "la181009@gmail.com",
      subject: `[Contato Agendra] ${subject}`,
      html: adminEmailHtml,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API_CONTACT_ERROR]", error);
    return NextResponse.json(
      { error: "Erro interno ao processar sua mensagem." },
      { status: 500 }
    );
  }
}
