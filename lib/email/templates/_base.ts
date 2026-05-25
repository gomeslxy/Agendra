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
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agendra</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: linear-gradient(135deg, #0F172A 0%, #1a1f3a 50%, #0d2038 100%);
      color: #F1F5F9;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 16px;
      line-height: 1.6;
      padding: 40px 16px;
      margin: 0;
    }
    .container {
      max-width: 520px;
      margin: 0 auto;
    }
    .card {
      background: rgba(15, 23, 42, 0.7);
      backdrop-filter: blur(24px);
      border: 1px solid rgba(37, 99, 235, 0.2);
      border-radius: 20px;
      padding: 40px 36px;
      box-shadow: 0 12px 40px rgba(37, 99, 235, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.1);
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
      pointer-events: none;
    }
    .logo-wrapper {
      margin: 0 auto 28px;
      text-align: center;
      display: block;
      width: 100%;
    }
    .logo-glyph {
      display: inline-block;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin: 0 auto;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.015em;
      text-align: center;
      margin-bottom: 8px;
      color: #FFFFFF;
    }
    .subtitle {
      color: #CBD5E1;
      font-size: 14px;
      text-align: center;
      margin-bottom: 28px;
      line-height: 1.5;
      font-weight: 400;
    }
    .otp-box {
      background: rgba(37, 99, 235, 0.12);
      border: 1px solid rgba(37, 99, 235, 0.25);
      border-radius: 14px;
      padding: 24px 20px;
      text-align: center;
      margin: 24px 0;
      position: relative;
      overflow: hidden;
    }
    .otp-box::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(59,130,246,0.3), transparent);
      pointer-events: none;
    }
    .otp-code {
      font-size: 44px;
      font-weight: 700;
      letter-spacing: 0.18em;
      color: #60A5FA;
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      line-height: 1.1;
    }
    .otp-label {
      font-size: 11px;
      color: #94A3B8;
      margin-top: 8px;
      font-family: 'JetBrains Mono', monospace;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 500;
    }
    .cta-btn {
      display: inline-block;
      width: 100%;
      background: linear-gradient(135deg, #F97316 0%, #FB923C 100%);
      color: white !important;
      text-decoration: none;
      border-radius: 10px;
      padding: 14px 20px;
      font-size: 14px;
      font-weight: 600;
      text-align: center;
      margin: 24px 0;
      border: none;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(249, 115, 22, 0.35);
    }
    .footer {
      color: #64748B;
      font-size: 12px;
      text-align: center;
      margin-top: 20px;
      line-height: 1.5;
    }
    .footer a {
      color: #60A5FA;
      text-decoration: none;
      border-bottom: 1px solid rgba(96, 165, 250, 0.25);
    }
    .divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent);
      margin: 32px 0;
    }
    .teal-accent {
      color: #14B8A6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo-wrapper">
        <div class="logo-glyph">Agendra</div>
      </div>
      ${content}

      <div class="divider"></div>
      <p class="footer" style="margin-top: 24px; margin-bottom: 0;">
        &copy; 2026 Agendra &middot; <a href="https://www.agendra.site" style="color: #60A5FA; text-decoration: none; border-bottom: 1px solid rgba(96, 165, 250, 0.3);">www.agendra.site</a><br/>
        Voc&ecirc; est&aacute; recebendo porque se cadastrou
      </p>
    </div>
  </div>
</body>
</html>`;
}
