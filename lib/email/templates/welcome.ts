import { emailWrapper, escapeHtml } from "./_base";

export function welcomeEmail(opts: { companyName: string }): string {
  const safeName = escapeHtml(opts.companyName);
  return emailWrapper(`
    <h1>Bem-vindo, ${safeName}! &#127881;</h1>
    <p class="subtitle">
      Sua conta Agendra está ativa e pronta. A partir de agora,
      cada lead recebido pode ser qualificado e com reunião marcada automaticamente.
    </p>

    <a href="https://www.agendra.site/inbox" class="cta-btn">
      Abrir minha Agendra &rarr;
    </a>

    <div class="divider"></div>

    <table style="width:100%; border-collapse:collapse;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E4E4E7; vertical-align:top; width:28px;">
          <span style="font-size:15px;">&#129302;</span>
        </td>
        <td style="padding: 10px 0 10px 12px; border-bottom: 1px solid #E4E4E7;">
          <div style="font-size:13px; font-weight:600; color:#09090B;">IA responde no WhatsApp</div>
          <div style="font-size:13px; color:#71717A; margin-top:2px;">Leads qualificados automaticamente, 24/7.</div>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #E4E4E7; vertical-align:top; width:28px;">
          <span style="font-size:15px;">&#128197;</span>
        </td>
        <td style="padding: 10px 0 10px 12px; border-bottom: 1px solid #E4E4E7;">
          <div style="font-size:13px; font-weight:600; color:#09090B;">Agenda integrada ao Google Calendar</div>
          <div style="font-size:13px; color:#71717A; margin-top:2px;">Horários reais, zero conflito, confirmação automática.</div>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px 0; vertical-align:top; width:28px;">
          <span style="font-size:15px;">&#128202;</span>
        </td>
        <td style="padding: 10px 0 10px 12px;">
          <div style="font-size:13px; font-weight:600; color:#09090B;">Relatórios e funil de vendas</div>
          <div style="font-size:13px; color:#71717A; margin-top:2px;">Visibilidade total de cada etapa da sua operação.</div>
        </td>
      </tr>
    </table>

    <div class="divider"></div>

    <p class="subtitle" style="margin-bottom:0; font-size:13px;">
      Alguma dúvida? Responda este email — nossa equipe está aqui para ajudar.
    </p>
  `);
}
