import { emailWrapper, escapeHtml } from "./_base";

export function anomalyAlertEmail(opts: {
  companyName: string;
  type: string;
  message: string;
}): string {
  const safeCompany = escapeHtml(opts.companyName);
  const safeType = escapeHtml(opts.type);
  const safeMessage = escapeHtml(opts.message);

  return emailWrapper(`
    <h1 style="color: #DC2626; display: flex; align-items: center; gap: 8px;">
      &#9888;&#65039; Alerta de Anomalia
    </h1>
    <p class="subtitle">
      Nossa monitoração automática de segurança detectou um comportamento anômalo ou falha de conexão na conta da empresa <strong>${safeCompany}</strong>.
    </p>

    <div style="background-color: #FFF1F2; border: 1px solid #FECACA; border-radius: 8px; padding: 18px; margin: 24px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr>
          <td style="padding: 6px 0; font-weight: 700; color: #DC2626; width: 100px; vertical-align: top;">
            Tipo de Alerta:
          </td>
          <td style="padding: 6px 0 6px 12px; color: #991B1B; font-family: 'JetBrains Mono', monospace; font-size: 12px;">
            ${safeType}
          </td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: 700; color: #DC2626; vertical-align: top;">
            Detalhe/Log:
          </td>
          <td style="padding: 6px 0 6px 12px; color: #991B1B; white-space: pre-wrap; font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.5;">
            ${safeMessage}
          </td>
        </tr>
      </table>
    </div>

    <p style="font-size: 13px; color: #3F3F46; margin-bottom: 20px;">
      Recomendamos que você acesse o Painel Administrativo imediatamente para inspecionar os logs detalhados, verificar a integridade das conexões e garantir que a operação do tenant não esteja comprometida.
    </p>

    <a href="https://www.agendra.site/admin" class="cta-btn" style="background-color: #09090B; border: 1px solid #09090B;">
      Acessar Painel de Controle &rarr;
    </a>

    <div class="divider"></div>

    <p style="margin-bottom: 0; font-size: 11px; color: #71717A; text-align: center;">
      Equipe Agendra Security Monitor &nbsp;&middot;&nbsp; Monitoramento de Integridade SaaS
    </p>
  `);
}
