import nodemailer from "nodemailer";

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendEmail(payload: EmailPayload): Promise<void> {
  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });
  } catch (error) {
    console.error("[sendEmail] Gmail SMTP error:", error);
    throw new Error(`Failed to send email: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
  }
}
