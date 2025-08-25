// mailer.js (ESM) — Xserver等の既存SMTP向け強化版
// ・エンベロープFromをSMTP_USERに固定（envelope）
// ・587はSTARTTLS必須（requireTLS）/ 465はSSL
// ・詳細ログ（logger/debug）を出す
import nodemailer from 'nodemailer';

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE, // "true" なら 465/SSL, それ以外は 587/STARTTLS
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
  const secure = String(SMTP_SECURE || 'false').toLowerCase() === 'true';
  transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || (secure ? 465 : 587)),
    secure,                         // 465ならtrue / 587ならfalse
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    requireTLS: !secure,            // 587のときはSTARTTLSを必須
    logger: true,                   // nodemailerの詳細ログ
    debug: true,
    tls: {
      servername: SMTP_HOST,        // SNI一致
      minVersion: 'TLSv1.2',
      // ※ 証明書エラー時の暫定回避（基本は不要）:
      // rejectUnauthorized: false,
    },
  });
  return transport;
}

function withDisclaimer(html) {
  const disclaimer =
    `<p style="color:#666;font-size:12px;margin-top:16px">` +
    `※ このメールは送信専用です。<b>返信しても届きません</b>。` +
    `お問い合わせは公式サイトからお願いいたします。` +
    `</p>`;
  return `${html}${disclaimer}`;
}

/** ユーザー向け（「自分に送る」） */
export async function sendUserMail(to, subject, html) {
  const t = getTransport();
  if (!t || !to) return;
  const body = withDisclaimer(html);
  try {
    const info = await t.sendMail({
      from: SMTP_FROM,          // 表示用From（例: "Satei App <estimate@irohatec.com>"）
      sender: SMTP_USER,        // 送信者（ヘッダ）
      to,
      subject,
      html: body,
      envelope: {               // ★ SMTPエンベロープ（実送信者/宛先）
        from: SMTP_USER,        // 必ずSMTP_USERに固定（Xserver対策）
        to
      },
    });
    console.log('[mailer] user mail sent:', info.messageId);
  } catch (e) {
    console.warn('[mailer] user mail failed:', e.message, e.response || '');
  }
}

/** 社内通知 */
export async function sendNotifyMail(toCsv, subject, text) {
  const t = getTransport();
  if (!t || !toCsv) return;
  const to = String(toCsv).split(',').map(s => s.trim()).filter(Boolean);
  try {
    const info = await t.sendMail({
      from: SMTP_FROM,
      sender: SMTP_USER,
      to,
      subject,
      text,
      envelope: { from: SMTP_USER, to }, // ★ envelope固定
    });
    console.log('[mailer] notify mail sent:', info.messageId);
  } catch (e) {
    console.warn('[mailer] notify mail failed:', e.message, e.response || '');
  }
}
