// mailer.js
import nodemailer from "nodemailer";

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM
} = process.env;

let transporter = null;

if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465, // 465: true, else false
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
} else {
  console.warn("[mailer] SMTP not configured. Emails will be skipped.");
}

export async function sendUserMail(to, subject, html) {
  if (!transporter) {
    console.log(`[mailer] (skip) to=${to}, subject=${subject}`);
    return { skipped: true };
  }
  const info = await transporter.sendMail({
    from: SMTP_FROM || '"Satei App" <no-reply@example.com>',
    to,
    subject,
    html
  });
  return { messageId: info.messageId };
}

export async function sendNotifyMail(toCsv, subject, text) {
  if (!transporter) {
    console.log(`[mailer] (notify skip) to=${toCsv}, subject=${subject}, text=${text}`);
    return { skipped: true };
  }
  const info = await transporter.sendMail({
    from: SMTP_FROM || '"Satei App" <no-reply@example.com>',
    to: toCsv,
    subject,
    text
  });
  return { messageId: info.messageId };
}
