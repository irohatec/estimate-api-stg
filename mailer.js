// mailer.js (ESM) — 既存SMTPで送信。Fromは環境変数 SMTP_FROM を使用。
// 「自分に送る」には返信不可の注記を自動で付与します。
import nodemailer from 'nodemailer';

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} = process.env;

function isConfigured() {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_FROM);
}

let transport = null;
function getTransport() {
  if (transport) return transport;
  if (!isConfigured()) {
    console.warn('[mailer] SMTP not configured. Emails will be skipped.');
    return null;
  }
  transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: String(SMTP_SECURE || 'false').toLowerCase() === 'true', // 465ならtrue
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transport;
}

/** ユーザー向け（「自分に送る」） */
export async function sendUserMail(to, subject, html) {
  const t = getTransport();
  if (!t || !to) return;
  const disclaimer =
    `<p style="color:#666;font-size:12px;margin-top:16px">` +
    `※ このメールは送信専用です。<b>返信しても届きません</b>。` +
    `お問い合わせは公式サイトからお願いいたします。` +
    `</p>`;
  const body = `${html}${disclaimer}`;

  try {
    await t.sendMail({
      from: SMTP_FROM,          // 例: "Satei App <estimate@irohatec.com>"
      sender: SMTP_USER,        // エンベロープ送信者（SMTPユーザーに合わせる）
      to,
      subject,
      html: body,
      // envelope: { from: SMTP_USER, to } // 必要なら明示
    });
    console.log('[mailer] user mail sent:', to);
  } catch (e) {
    console.warn('[mailer] user mail failed:', e.message);
  }
}

/** 社内通知 */
export async function sendNotifyMail(toCsv, subject, text) {
  const t = getTransport();
  if (!t || !toCsv) return;
  const to = String(toCsv)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  try {
    await t.sendMail({
      from: SMTP_FROM,
      sender: SMTP_USER,
      to,               // 複数可
      subject,
      text,             // プレーンテキストで十分
    });
    console.log('[mailer] notify mail sent:', to.join(','));
  } catch (e) {
    console.warn('[mailer] notify mail failed:', e.message);
  }
}
