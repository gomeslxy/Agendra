import { emailWrapper } from "./_base";

export function passwordResetEmail(opts: { code: string }): string {
  return emailWrapper(`
    <h1>Redefinir sua senha</h1>
    <p class="subtitle">
      Recebemos um pedido para redefinir a senha da sua conta Agendra.
      Use o código abaixo para criar uma nova.
    </p>

    <div class="otp-box">
      <div class="otp-code">${opts.code}</div>
      <div class="otp-label">Código de redefinição · Válido por 15 minutos</div>
    </div>

    <div class="divider"></div>

    <p class="subtitle" style="color: #94A3B8; font-size: 13px; margin-bottom: 0;">
      Não solicitou isto? Ignore com segurança.<br/>
      <span class="teal-accent">Sua senha atual permanece a mesma</span>. Nunca compartilhe este código.
    </p>
  `);
}
