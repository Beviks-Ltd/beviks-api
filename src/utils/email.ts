import nodemailer from "nodemailer";

export function buildBeviksEmailHtml({
  title,
  preheader,
  userName,
  bodyText,
  buttonText,
  buttonUrl,
}: {
  title: string;
  preheader?: string;
  userName?: string;
  bodyText: string;
  buttonText?: string;
  buttonUrl?: string;
}): string {
  const logoUrl = 'https://raw.githubusercontent.com/Beviks-Ltd/beviks-mobile/main/assets/images/logo_beviks_dark.png';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #F7F4F4;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1A1A1A;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #F7F4F4;
      padding: 40px 0;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #FFFFFF;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
      border: 1px solid #EFEFEF;
    }
    .header {
      background-color: #1A1A1A;
      padding: 36px 40px;
      text-align: center;
    }
    .header img {
      max-height: 48px;
      width: auto;
    }
    .header-title {
      color: #FFFFFF;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      margin-top: 12px;
      opacity: 0.85;
    }
    .content {
      padding: 40px 40px 32px 40px;
    }
    .heading {
      font-size: 24px;
      font-weight: 800;
      color: #1A1A1A;
      margin-top: 0;
      margin-bottom: 16px;
      letter-spacing: -0.5px;
    }
    .subtext {
      font-size: 15px;
      line-height: 1.6;
      color: #555555;
      margin-bottom: 28px;
    }
    .cta-btn {
      display: inline-block;
      background-color: #BC000A;
      color: #FFFFFF !important;
      text-decoration: none;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding: 16px 36px;
      border-radius: 40px;
      box-shadow: 0 6px 16px rgba(188, 0, 10, 0.25);
    }
    .cta-container {
      text-align: center;
      margin: 32px 0;
    }
    .link-alt {
      font-size: 12px;
      color: #888888;
      word-break: break-all;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px dashed #E5E0E0;
    }
    .link-alt a {
      color: #BC000A;
    }
    .footer {
      background-color: #FAF7F7;
      padding: 28px 40px;
      text-align: center;
      border-top: 1px solid #EFEFEF;
    }
    .footer-text {
      font-size: 11px;
      color: #888888;
      letter-spacing: 0.5px;
      margin: 0;
      line-height: 1.5;
    }
    .footer-highlight {
      color: #BC000A;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      
      <!-- Brand Header with Logo -->
      <div class="header">
        <img source="${logoUrl}" alt="BEVIKS ATELIER" onerror="this.style.display='none'" />
        <div class="header-title">BEVIKS ATELIER</div>
      </div>

      <!-- Body Content -->
      <div class="content">
        <h1 class="heading">${title}</h1>
        <p class="subtext">
          ${userName ? `Hello <strong>${userName}</strong>,<br/><br/>` : ''}
          ${bodyText}
        </p>

        ${
          buttonText && buttonUrl
            ? `
          <div class="cta-container">
            <a href="${buttonUrl}" target="_blank" class="cta-btn">${buttonText}</a>
          </div>
          <div class="link-alt">
            Or copy and paste this link into your browser:<br/>
            <a href="${buttonUrl}" target="_blank">${buttonUrl}</a>
          </div>
        `
            : ''
        }
      </div>

      <!-- Footer -->
      <div class="footer">
        <p class="footer-text">
          &copy; ${new Date().getFullYear()} <span class="footer-highlight">BEVIKS LTD</span>. Curated Heritage & Custom Cultural Designs.<br/>
          All Rights Reserved.
        </p>
      </div>

    </div>
  </div>
</body>
</html>
  `;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL || "noreply@beviks.com";

  if (!apiKey) {
    console.log(`[Brevo Simulation] (No BREVO_API_KEY set) To: ${to} | Subject: ${subject}`);
    return { success: true, simulated: true };
  }

  // If key is a Brevo SMTP Key (starts with xsmtpsib-), use Nodemailer SMTP
  if (apiKey.startsWith("xsmtpsib-")) {
    const smtpUser = process.env.BREVO_SMTP_USER;
    if (!smtpUser || smtpUser.includes("your-brevo-login-email")) {
      console.warn("[Brevo SMTP Notice] Please set BREVO_SMTP_USER in .env to your Brevo account login email address (e.g. user@domain.com) so SMTP auth succeeds.");
    }

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
        port: 587,
        secure: false,
        auth: {
          user: smtpUser || fromEmail,
          pass: apiKey,
        },
      });

      const info = await transporter.sendMail({
        from: `"Beviks Atelier" <${fromEmail}>`,
        to,
        subject,
        text: text || subject,
        html,
      });

      console.log(`[Brevo SMTP Success] Email delivered to ${to} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      console.error("[Brevo SMTP Error]", err);
      return { success: false, error: err.message };
    }
  }

  // Otherwise use Brevo REST API v3 (for xkeysib- keys)
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "accept": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: "Beviks Atelier" },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text || subject,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Brevo REST Error]", res.status, errText);
      return { success: false, error: errText };
    }

    console.log(`[Brevo REST Success] Email delivered to ${to}`);
    return { success: true };
  } catch (err: any) {
    console.error("[Brevo Exception]", err);
    return { success: false, error: err.message };
  }
}
