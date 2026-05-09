import { emailWrapper, escapeHtml } from "./_base";

export function verificationEmail(opts: { code: string; companyName: string }): string {
  const safeName = escapeHtml(opts.companyName);
  return emailWrapper(`
    <h1>Confirme seu email</h1>
    <p class="subtitle">
      Olá, ${safeName}! Use o código abaixo para ativar sua conta Agendra.
    </p>

    <div class="otp-box">
      <div class="otp-code">${opts.code}</div>
      <div class="otp-label">Código de verificação · Válido por 15 minutos</div>
    </div>

    <div class="divider"></div>

    <p class="subtitle" style="color: #94A3B8; font-size: 13px; margin-bottom: 0;">
      Se você não criou uma conta, pode ignorar com segurança.<br/>
      <span class="teal-accent">Nunca compartilhe este código</span> com ninguém.
    </p>
  `);
}
