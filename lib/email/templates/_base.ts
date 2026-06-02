export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Agendra</title>
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    /* Reset */
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    img { border: 0; display: block; }
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }

    /* Base */
    body {
      background-color: #FAFAFA;
      color: #3F3F46;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      margin: 0;
      padding: 0;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }

    /* Wrapper */
    .email-body {
      background-color: #FAFAFA;
      padding: 48px 16px;
      width: 100%;
    }

    /* Container */
    .container {
      max-width: 520px;
      margin: 0 auto;
    }

    /* Logo header */
    .logo-row {
      text-align: center;
      margin-bottom: 24px;
    }
    .logo-mark {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
    }
    .logo-icon {
      width: 28px;
      height: 28px;
      background-color: #09090B;
      border-radius: 6px;
      display: inline-block;
      vertical-align: middle;
    }
    .logo-text {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #09090B;
      vertical-align: middle;
      font-family: 'Inter', -apple-system, sans-serif;
    }

    /* Card */
    .card {
      background: #FFFFFF;
      border: 1px solid #E4E4E7;
      border-radius: 12px;
      padding: 36px 32px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.01);
    }

    /* Typography */
    h1 {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.025em;
      color: #09090B;
      margin-bottom: 12px;
      line-height: 1.3;
    }
    h2 {
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: #09090B;
      margin-top: 24px;
      margin-bottom: 12px;
    }
    p {
      color: #3F3F46;
      margin-bottom: 16px;
    }
    .subtitle {
      font-size: 14px;
      color: #3F3F46;
      margin-bottom: 24px;
      line-height: 1.6;
      font-weight: 400;
    }

    /* OTP box - High contrast raised style */
    .otp-box {
      background: #F4F4F5;
      border: 1px solid #E4E4E7;
      border-radius: 8px;
      padding: 24px 20px;
      text-align: center;
      margin: 24px 0;
    }
    .otp-label-top {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #71717A;
      margin-bottom: 10px;
    }
    .otp-code {
      font-size: 36px;
      font-weight: 700;
      letter-spacing: 0.18em;
      color: #09090B;
      font-family: 'JetBrains Mono', 'Courier New', Courier, monospace;
      line-height: 1;
      margin-left: 0.18em; /* offset the letter-spacing on the last char */
    }
    .otp-expire {
      font-size: 11px;
      color: #71717A;
      margin-top: 10px;
      font-weight: 400;
    }

    /* CTA Button - Precise brand-orange */
    .cta-btn {
      display: block;
      background: #F97316;
      color: #FFFFFF !important;
      text-decoration: none;
      border-radius: 6px;
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 600;
      text-align: center;
      margin: 24px 0;
      letter-spacing: -0.01em;
      box-shadow: 0 1px 2px rgba(249,115,22,0.1);
    }
    .cta-btn:hover {
      background: #EA580C;
    }

    /* Secondary button */
    .sec-btn {
      display: inline-block;
      background: #FFFFFF;
      color: #09090B !important;
      border: 1px solid #E4E4E7;
      text-decoration: none;
      border-radius: 6px;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 500;
      text-align: center;
      margin: 16px 0;
    }

    /* Divider */
    .divider {
      height: 1px;
      background-color: #E4E4E7;
      margin: 24px 0;
    }

    /* Semantic Status Info Box */
    .info-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      background: #F4F4F5;
      border: 1px solid #E4E4E7;
      border-radius: 8px;
      padding: 12px 14px;
      margin: 20px 0;
    }
    .info-icon {
      font-size: 14px;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .info-text {
      font-size: 12px;
      color: #71717A;
      line-height: 1.5;
    }

    /* Color highlights matching Design System */
    .text-teal {
      color: #0D9488;
      font-weight: 600;
    }
    .text-blue {
      color: #2563EB;
      font-weight: 600;
    }
    .text-orange {
      color: #EA580C;
      font-weight: 600;
    }
    .text-red {
      color: #DC2626;
      font-weight: 600;
    }

    /* Footer */
    .footer {
      text-align: center;
      margin-top: 24px;
    }
    .footer p {
      font-size: 11px;
      color: #A1A1AA;
      line-height: 1.6;
      margin-bottom: 4px;
    }
    .footer a {
      color: #71717A;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    /* Mobile */
    @media only screen and (max-width: 600px) {
      .card { padding: 28px 20px; }
      .otp-code { font-size: 32px; letter-spacing: 0.12em; }
      h1 { font-size: 18px; }
    }
  </style>
</head>
<body>
  <div class="email-body">
    <div class="container">

      <!-- Logo -->
      <div class="logo-row" style="text-align: center; margin-bottom: 24px;">
        <a href="https://www.agendra.site" style="text-decoration: none; display: inline-block;">
          <span style="display: inline-block; width: 24px; height: 24px; background-color: #09090B; border-radius: 6px; vertical-align: middle; margin-right: 8px;"></span>
          <span style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 16px; font-weight: 700; letter-spacing: -0.02em; color: #09090B; vertical-align: middle; line-height: 24px;">Agendra</span>
        </a>
      </div>

      <!-- Card -->
      <div class="card">
        ${content}
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>
          &copy; 2026 Agendra &nbsp;&middot;&nbsp;
          <a href="https://www.agendra.site">www.agendra.site</a>
        </p>
        <p>Você recebeu este e-mail porque possui uma conta ativa no Agendra.</p>
      </div>

    </div>
  </div>
</body>
</html>`;
}
