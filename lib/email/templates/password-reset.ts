import { emailWrapper } from "./_base";

export function passwordResetEmail(opts: { code: string }): string {
  return emailWrapper(`
    <h1>Redefinir sua senha</h1>
    <p class="subtitle">
      Recebemos uma solicitação para redefinir a senha da sua conta no Agendra. Use o código de segurança abaixo para prosseguir com a criação da nova senha.
    </p>

    <div class="otp-box">
      <div class="otp-label-top">Código de redefinição</div>
      <div class="otp-code">${opts.code}</div>
      <div class="otp-expire">&#9200; Válido por 15 minutos</div>
    </div>

    <div class="info-row">
      <span class="info-icon">&#9888;&#65039;</span>
      <span class="info-text">
        Se você não solicitou essa redefinição, sua senha atual <span class="text-blue">permanecerá inalterada</span>. Você pode ignorar este e-mail com segurança.
      </span>
    </div>

    <div class="divider"></div>

    <p style="margin-bottom: 0; font-size: 12px; color: #71717A;">
      Precisa de ajuda para acessar sua conta? Responda a este e-mail para falar com nosso suporte.
    </p>
  `);
}
