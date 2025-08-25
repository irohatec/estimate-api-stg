// mailer.js (ESM) — 既存SMTP + ユーザー宛メールに運営BCCを追加
// ・587はSTARTTLS/465はSSLに対応
// ・エンベロープFrom=SMTP_USERを固定
// ・ユーザー宛メールに BCC（USERMAIL_BCC 環境変数。なければ NOTIFY_TO を利用）
// ・text(プレーン)も同梱して到達率を改善
import nodemailer from 'nodemailer';

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE, // "true"なら465/SSL, それ以外は587/STARTTLS
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  NOTIFY_TO,
  USERMAIL_BCC, // ← 追加（未設定ならNOTIFY_TOを利用）
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
    requireTLS: !secure,            // 587ではSTARTTLSを必須
    logger: true,
    debug: true,
    tls: {
      servername: SMTP_HOST,
      minVersion: 'TLSv1.2',
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

function toPlainText(html) {
  // 超簡易：タグ除去のみ（v0）
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** ユーザー向け（「自分に送る」）— 運営BCCを自動付与 */
export async function sendUserMail(to, subject, html) {
  const t = getTransport();
  if (!t || !to) return;

  const bodyHtml = withDisclaimer(html);
  const bodyText = toPlainText(bodyHtml);

  // BCC先：USERMAIL_BCC があれば優先、なければ NOTIFY_TO を利用
  const bccCsv = (USERMAIL_BCC && USERMAIL_BCC.trim())
    ? USERMAIL_BCC
    : (NOTIFY_TO || '');
  const bccList = String(bccCsv)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // envelopeの宛先は To + BCC を全て含める
  const rcptAll = [to, ...bccList];

  try {
    const info = await t.sendMail({
      from: SMTP_FROM,              // 表示用From（例: "Satei App <estimate@irohatec.com>"）
      sender: SMTP_USER,            // 送信者ヘッダ
      to,
      bcc: bccList.length ? bccList : undefined,
      subject,
      html: bodyHtml,
      text: bodyText,
      envelope: { from: SMTP_USER, to: rcptAll },
      headers: {
        'X-Entity-Type': 'satei-app-v0',
      },
    });
    console.log('[mailer] user mail sent:', info.messageId, 'bcc:', bccList.join(','));
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
      envelope: { from: SMTP_USER, to },
      headers: { 'X-Entity-Type': 'satei-app-v0' },
    });
    console.log('[mailer] notify mail sent:', info.messageId);
  } catch (e) {
    console.warn('[mailer] notify mail failed:', e.message, e.response || '');
  }
}
