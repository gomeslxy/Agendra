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
      background-color: #F4F4F5;
      color: #09090B;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      font-size: 15px;
      line-height: 1.6;
      margin: 0;
      padding: 0;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }

    /* Wrapper */
    .email-body {
      background-color: #F4F4F5;
      padding: 48px 16px;
      width: 100%;
    }

    /* Container */
    .container {
      max-width: 540px;
      margin: 0 auto;
    }

    /* Logo header */
    .logo-row {
      text-align: center;
      margin-bottom: 20px;
    }
    .logo-mark {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
    }
    .logo-icon {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #2563EB 0%, #14B8A6 100%);
      border-radius: 8px;
      display: inline-block;
    }
    .logo-text {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #09090B;
      vertical-align: middle;
    }

    /* Card */
    .card {
      background: #FFFFFF;
      border: 1px solid #E4E4E7;
      border-radius: 16px;
      padding: 40px 36px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
    }

    /* Top accent line */
    .accent-bar {
      height: 3px;
      background: linear-gradient(90deg, #2563EB 0%, #14B8A6 100%);
      border-radius: 2px;
      margin-bottom: 32px;
    }

    /* Typography */
    h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #09090B;
      margin-bottom: 8px;
      line-height: 1.3;
    }
    .subtitle {
      font-size: 14px;
      color: #71717A;
      margin-bottom: 28px;
      line-height: 1.6;
      font-weight: 400;
    }

    /* OTP box */
    .otp-box {
      background: #F0F6FF;
      border: 1px solid #BFDBFE;
      border-radius: 12px;
      padding: 28px 24px 20px;
      text-align: center;
      margin: 24px 0;
    }
    .otp-label-top {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #2563EB;
      margin-bottom: 12px;
    }
    .otp-code {
      font-size: 48px;
      font-weight: 700;
      letter-spacing: 0.22em;
      color: #1D4ED8;
      font-family: 'JetBrains Mono', 'Courier New', Courier, monospace;
      line-height: 1;
    }
    .otp-expire {
      font-size: 12px;
      color: #6B7280;
      margin-top: 10px;
      font-weight: 400;
    }

    /* CTA Button */
    .cta-btn {
      display: block;
      background: #F97316;
      color: #FFFFFF !important;
      text-decoration: none;
      border-radius: 10px;
      padding: 14px 24px;
      font-size: 15px;
      font-weight: 600;
      text-align: center;
      margin: 28px 0;
      letter-spacing: -0.01em;
      box-shadow: 0 1px 3px rgba(249,115,22,0.3), 0 4px 12px rgba(249,115,22,0.15);
    }

    /* Divider */
    .divider {
      height: 1px;
      background-color: #E4E4E7;
      margin: 28px 0;
    }

    /* Info row */
    .info-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      background: #FAFAFA;
      border: 1px solid #E4E4E7;
      border-radius: 10px;
      padding: 14px 16px;
      margin: 20px 0;
    }
    .info-icon {
      font-size: 16px;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .info-text {
      font-size: 13px;
      color: #3F3F46;
      line-height: 1.5;
    }

    /* Teal highlight */
    .teal {
      color: #0D9488;
      font-weight: 600;
    }
    .blue {
      color: #2563EB;
      font-weight: 600;
    }

    /* Footer */
    .footer {
      text-align: center;
      margin-top: 28px;
    }
    .footer p {
      font-size: 12px;
      color: #A1A1AA;
      line-height: 1.6;
    }
    .footer a {
      color: #71717A;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    /* Mobile */
    @media only screen and (max-width: 600px) {
      .card { padding: 28px 20px; }
      .otp-code { font-size: 38px; letter-spacing: 0.16em; }
      h1 { font-size: 20px; }
    }
  </style>
</head>
<body>
  <div class="email-body">
    <div class="container">

      <!-- Logo -->
      <div class="logo-row">
        <a href="https://www.agendra.site" class="logo-mark" style="text-decoration:none;">
          <span class="logo-icon" style="display:inline-block; width:32px; height:32px; background:linear-gradient(135deg,#2563EB,#14B8A6); border-radius:8px; vertical-align:middle; margin-right:8px;"></span>
          <span class="logo-text" style="font-family:'Inter',-apple-system,sans-serif; font-size:18px; font-weight:700; letter-spacing:-0.02em; color:#09090B; vertical-align:middle;">Agendra</span>
        </a>
      </div>

      <!-- Card -->
      <div class="card">
        <div class="accent-bar"></div>
        ${content}
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>
          &copy; 2026 Agendra &nbsp;&middot;&nbsp;
          <a href="https://www.agendra.site">www.agendra.site</a>
        </p>
        <p style="margin-top:4px;">Voc&ecirc; recebeu este email porque tem uma conta Agendra.</p>
      </div>

    </div>
  </div>
</body>
</html>`;
}
