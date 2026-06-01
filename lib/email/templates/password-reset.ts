import { emailWrapper } from "./_base";

export function passwordResetEmail(opts: { code: string }): string {
  return emailWrapper(`
    <h1>Redefinir sua senha</h1>
    <p class="subtitle">
      Recebemos uma solicitação para redefinir a senha da sua conta Agendra.
      Use o código abaixo para criar uma nova senha.
    </p>

    <div class="otp-box">
      <div class="otp-label-top">Código de redefinição</div>
      <div class="otp-code">${opts.code}</div>
      <div class="otp-expire">&#9200; Válido por 15 minutos</div>
    </div>

    <div class="info-row">
      <span class="info-icon">&#9888;&#65039;</span>
      <span class="info-text">
        Não solicitou a redefinição? Sua senha atual <span class="blue">permanece inalterada</span>.
        Ignore este email com segurança.
      </span>
    </div>

    <div class="divider"></div>

    <p class="subtitle" style="margin-bottom:0; font-size:13px;">
      Se precisar de ajuda, responda este email.
    </p>
  `);
}
