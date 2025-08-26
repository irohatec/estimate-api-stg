// mailer.js — Resend対応版（ESM）
// server.js が期待する `sendNotifyMail` / `sendUserMail` をエクスポートします
import { Resend } from "resend";

console.log("[mailer] Resend mailer loaded");

// 環境変数
const API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.SMTP_FROM || "onboarding@resend.dev"; // 独自ドメイン未認証でも送信可
const DEFAULT_TO = (process.env.NOTIFY_TO || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// サンドボックス（安全確認用）。true の間は宛先を強制的に delivered@resend.dev にする
const USE_SANDBOX = String(process.env.RESEND_SANDBOX || "").toLowerCase() === "true";
const SANDBOX_TO = ["delivered@resend.dev"];

const resend = API_KEY ? new Resend(API_KEY) : null;

function buildText(payload) {
  if (typeof payload === "string") return payload;
  return [
    "【査定通知】",
    `name: ${payload?.name ?? ""}`,
    `email: ${payload?.email ?? ""}`,
    `note: ${payload?.note ?? ""}`,
    payload ? `\nraw:\n${JSON.stringify(payload, null, 2)}` : ""
  ].join("\n");
}

/**
 * 管理者・社内向け通知
 * server.js 側は sendNotifyMail(payload, { subject?, to? }) を想定
 */
export async function sendNotifyMail(payload, opts = {}) {
  if (!resend) {
    console.warn("[mailer] RESEND_API_KEY 未設定。sendNotifyMail をスキップ");
    return { skipped: true };
  }
  const to = USE_SANDBOX
    ? SANDBOX_TO
    : (opts.to && opts.to.length ? opts.to : DEFAULT_TO);

  if (!to || to.length === 0) {
    console.warn("[mailer] 宛先未設定（NOTIFY_TO か opts.to を設定してください）");
    return { skipped: true };
  }

  const subject = opts.subject || "【査定リード】受信";
  const text = buildText(payload);

  try {
    const resp = await resend.emails.send({ from: FROM, to, subject, text });
    console.log("[mailer] sendNotifyMail queued:", resp?.id || resp);
    return { ok: true, id: resp?.id || null };
  } catch (err) {
    console.error("[mailer] sendNotifyMail error:", err);
    throw err;
  }
}

/**
 * ユーザー（依頼者）向け送信
 * server.js 側は sendUserMail(payload, email, subject?) を想定
 */
export async function sendUserMail(payload, email, subject = "査定結果のお知らせ") {
  if (!resend) {
    console.warn("[mailer] RESEND_API_KEY 未設定。sendUserMail をスキップ");
    return { skipped: true };
  }
  const to = USE_SANDBOX
    ? SANDBOX_TO
    : (Array.isArray(email) ? email : [email]).filter(Boolean);

  if (!to || to.length === 0) {
    console.warn("[mailer] ユーザー宛先が空です");
    return { skipped: true };
  }

  const text = buildText(payload);

  try {
    const resp = await resend.emails.send({ from: FROM, to, subject, text });
    console.log("[mailer] sendUserMail queued:", resp?.id || resp);
    return { ok: true, id: resp?.id || null };
  } catch (err) {
    console.error("[mailer] sendUserMail error:", err);
    throw err;
  }
}
