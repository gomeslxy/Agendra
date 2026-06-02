import { emailWrapper, escapeHtml } from "./_base";

export function contactEmail(opts: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): string {
  const safeName = escapeHtml(opts.name);
  const safeEmail = escapeHtml(opts.email);
  const safeSubject = escapeHtml(opts.subject);
  const safeMessage = escapeHtml(opts.message);

  return emailWrapper(`
    <h1>Novo contato recebido</h1>
    <p class="subtitle">
      Você recebeu uma nova mensagem através do formulário de contato do site do Agendra.
    </p>

    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E4E4E7; font-weight: 600; color: #09090B; width: 80px;">
          Remetente
        </td>
        <td style="padding: 10px 0 10px 12px; border-bottom: 1px solid #E4E4E7; color: #3F3F46;">
          ${safeName}
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E4E4E7; font-weight: 600; color: #09090B;">
          E-mail
        </td>
        <td style="padding: 10px 0 10px 12px; border-bottom: 1px solid #E4E4E7; color: #3F3F46;">
          <a href="mailto:${safeEmail}" style="color: #2563EB; text-decoration: none;">${safeEmail}</a>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E4E4E7; font-weight: 600; color: #09090B;">
          Assunto
        </td>
        <td style="padding: 10px 0 10px 12px; border-bottom: 1px solid #E4E4E7; color: #3F3F46; font-weight: 500;">
          ${safeSubject}
        </td>
      </tr>
    </table>

    <div style="background-color: #F4F4F5; border: 1px solid #E4E4E7; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #71717A; margin-bottom: 8px; letter-spacing: 0.05em;">
        Mensagem
      </div>
      <div style="font-size: 13px; color: #09090B; line-height: 1.6; white-space: pre-wrap;">${safeMessage}</div>
    </div>

    <div class="divider"></div>

    <p style="margin-bottom: 0; font-size: 11px; color: #A1A1AA; text-align: center;">
      Este é um e-mail transacional gerado automaticamente pelo Agendra Website Engine.
    </p>
  `);
}
