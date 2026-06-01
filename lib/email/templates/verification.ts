import { emailWrapper, escapeHtml } from "./_base";

export function verificationEmail(opts: { code: string; companyName: string }): string {
  const safeName = escapeHtml(opts.companyName);
  return emailWrapper(`
    <h1>Confirme seu email</h1>
    <p class="subtitle">
      Olá, <strong style="color:#09090B;">${safeName}</strong>! Use o código abaixo para ativar sua conta Agendra.
    </p>

    <div class="otp-box">
      <div class="otp-label-top">Código de verificação</div>
      <div class="otp-code">${opts.code}</div>
      <div class="otp-expire">&#9200; Válido por 15 minutos</div>
    </div>

    <div class="info-row">
      <span class="info-icon">&#128274;</span>
      <span class="info-text">
        <span class="teal">Nunca compartilhe este código</span> com ninguém.
        A Agendra jamais solicitará seu código por WhatsApp ou telefone.
      </span>
    </div>

    <div class="divider"></div>

    <p class="subtitle" style="margin-bottom:0; font-size:13px;">
      Não criou esta conta? Pode ignorar este email com segurança.
    </p>
  `);
}
