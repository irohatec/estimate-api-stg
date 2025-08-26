// mailer.js — Resend版（ESM）
import { Resend } from "resend";

const API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.SMTP_FROM || "onboarding@resend.dev"; // 独自ドメイン未認証でも送れるデフォルト
const DEFAULT_TO = (process.env.NOTIFY_TO || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// サンドボックス強制（最初の動作確認用）: RESEND_SANDBOX=true のとき、宛先を delivered@resend.dev に固定
const USE_SANDBOX = String(process.env.RESEND_SANDBOX || "").toLowerCase() === "true";
const SANDBOX_TO = ["delivered@resend.dev"];

if (!API_KEY) {
  console.warn("[mailer] RESEND_API_KEY が未設定です。メール送信はスキップされます。");
}

const resend = API_KEY ? new Resend(API_KEY) : null;

/**
 * 内部通知メールを送る（/lead 等から呼び出し）
 * @param {object|string} payload - 本文生成に使うデータ or 文字列本文
 * @param {object} opts - 追加オプション { subject?: string, to?: string[] }
 * @returns {Promise<{ok?:boolean, id?:string|null, skipped?:boolean}>}
 */
export async function sendMail(payload, opts = {}) {
  // 初期化・宛先チェック
  if (!resend) {
    console.warn("[mailer] Resend未初期化のため送信スキップ:", { payload, opts });
    return { skipped: true };
  }

  const to =
    USE_SANDBOX
      ? SANDBOX_TO
      : (opts.to && opts.to.length ? opts.to : DEFAULT_TO);

  if (!to || to.length === 0) {
    console.warn("[mailer] 宛先が未設定のため送信スキップ（NOTIFY_TO か opts.to を設定してください）");
    return { skipped: true };
  }

  const subject = opts.subject || "新しい査定リードが届きました";
  const text =
    typeof payload === "string"
      ? payload
      : [
          "【査定リード】",
          `name: ${payload?.name ?? ""}`,
          `email: ${payload?.email ?? ""}`,
          `note: ${payload?.note ?? ""}`,
          payload ? `\nraw:\n${JSON.stringify(payload, null, 2)}` : ""
        ].join("\n");

  try {
    const resp = await resend.emails.send({
      from: FROM,
      to,
      subject,
      text
    });
    console.log("[mailer] Resend queued:", resp?.id || resp);
    return { ok: true, id: resp?.id || null };
  } catch (err) {
    console.error("[mailer] Resend error:", err);
    throw err;
  }
}
