import { emailWrapper, escapeHtml } from "./_base";

export function verificationEmail(opts: { code: string; companyName: string }): string {
  const safeName = escapeHtml(opts.companyName);
  return emailWrapper(`
    <h1>Confirme seu e-mail</h1>
    <p class="subtitle">
      Olá, <strong style="color: #09090B;">${safeName}</strong>! Use o código abaixo para ativar sua conta no Agendra e iniciar sua automação.
    </p>

    <div class="otp-box">
      <div class="otp-label-top">Código de verificação</div>
      <div class="otp-code">${opts.code}</div>
      <div class="otp-expire">&#9200; Válido por 15 minutos</div>
    </div>

    <div class="info-row">
      <span class="info-icon">&#128274;</span>
      <span class="info-text">
        <span class="text-teal">Nunca compartilhe este código</span> com ninguém.
        A equipe do Agendra jamais solicitará este código através do WhatsApp ou telefone.
      </span>
    </div>

    <div class="divider"></div>

    <p style="margin-bottom: 0; font-size: 12px; color: #71717A;">
      Se você não solicitou este código, pode ignorar este e-mail com segurança.
    </p>
  `);
}
