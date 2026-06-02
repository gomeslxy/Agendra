import { emailWrapper, escapeHtml } from "./_base";

export function welcomeEmail(opts: { companyName: string }): string {
  const safeName = escapeHtml(opts.companyName);
  return emailWrapper(`
    <h1>Bem-vindo ao Agendra, ${safeName}! &#127881;</h1>
    <p class="subtitle">
      Sua conta está ativa e pronta para uso. A partir de agora, cada lead recebido será qualificado e poderá agendar reuniões com você de forma 100% autônoma.
    </p>

    <a href="https://www.agendra.site/inbox" class="cta-btn">
      Acessar meu Painel &rarr;
    </a>

    <div class="divider"></div>

    <h2>Tudo o que você pode fazer com o Agendra:</h2>

    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr>
        <td style="padding: 14px 0; border-bottom: 1px solid #E4E4E7; vertical-align: top; width: 28px;">
          <span style="font-size: 16px;">&#129302;</span>
        </td>
        <td style="padding: 14px 0 14px 12px; border-bottom: 1px solid #E4E4E7;">
          <div style="font-size: 13px; font-weight: 600; color: #09090B;">Qualificação Automática via WhatsApp</div>
          <div style="font-size: 12px; color: #71717A; margin-top: 2px;">Nossa inteligência artificial atende e qualifica seus leads 24 horas por dia, 7 dias por semana.</div>
        </td>
      </tr>
      <tr>
        <td style="padding: 14px 0; border-bottom: 1px solid #E4E4E7; vertical-align: top; width: 28px;">
          <span style="font-size: 16px;">&#128197;</span>
        </td>
        <td style="padding: 14px 0 14px 12px; border-bottom: 1px solid #E4E4E7;">
          <div style="font-size: 13px; font-weight: 600; color: #09090B;">Sincronização com o Google Calendar</div>
          <div style="font-size: 12px; color: #71717A; margin-top: 2px;">Leads agendam reuniões diretamente em horários livres da sua agenda, sem conflitos.</div>
        </td>
      </tr>
      <tr>
        <td style="padding: 14px 0; vertical-align: top; width: 28px;">
          <span style="font-size: 16px;">&#128202;</span>
        </td>
        <td style="padding: 14px 0 14px 12px;">
          <div style="font-size: 13px; font-weight: 600; color: #09090B;">Painel de Métricas e Funil de Vendas</div>
          <div style="font-size: 12px; color: #71717A; margin-top: 2px;">Acompanhe em tempo real o andamento das conversas, taxas de conversão e reuniões marcadas.</div>
        </td>
      </tr>
    </table>

    <div class="divider"></div>

    <p style="margin-bottom: 0; font-size: 12px; color: #71717A;">
      Ficou com alguma dúvida sobre a configuração inicial? Basta responder a este e-mail. Nossa equipe está pronta para te ajudar a tracionar suas vendas.
    </p>
  `);
}
