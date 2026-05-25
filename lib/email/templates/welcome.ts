import { emailWrapper, escapeHtml } from "./_base";

export function welcomeEmail(opts: { companyName: string }): string {
  const safeName = escapeHtml(opts.companyName);
  return emailWrapper(`
    <h1>Bem-vindo, ${safeName}!</h1>
    <p class="subtitle">
      Sua conta Agendra está ativa. Lead novo → reunião marcada. Pronto para começar?
    </p>

    <a href="https://www.agendra.site/inbox" class="cta-btn">
      Abrir Agendra
    </a>

    <div class="divider"></div>

    <p class="subtitle" style="color: #94A3B8; font-size: 13px; margin-bottom: 0;">
      Alguma dúvida? Responda este email.<br/>
      <span class="teal-accent">Agendra responde, qualifica e agenda.</span>
    </p>
  `);
}
