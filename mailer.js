// mailer.js — v0 no-op mailer (ESM)
// 送信は一切せず、「成功した風の結果」を返す。
// server.js の `import { sendUserMail, sendNotifyMail } from './mailer.js'` と一致させる。

/**
 * @typedef {Object} MailPayload
 * @property {string} [to]
 * @property {string} [subject]
 * @property {string} [html]
 * @property {Object} [meta]
 */

// v0: 通知メール（管理者向けなど）— 実送信なし
export async function sendNotifyMail(payload = {}) {
  const id = makeId();
  console.log(`[mailer] SKIPPED(v0): sendNotifyMail { id:'${id}', meta:${safeJson(payload.meta)} }`);
  return { data: { id }, error: null };
}

// v0: ユーザー向けメール — 実送信なし
export async function sendUserMail(payload = {}) {
  const id = makeId();
  console.log(`[mailer] SKIPPED(v0): sendUserMail { id:'${id}', meta:${safeJson(payload.meta)} }`);
  return { data: { id }, error: null };
}

// 互換のため default でもまとめて出す（使わなくてもOK）
export default { sendNotifyMail, sendUserMail };

// ---- helpers ----
function makeId() {
  try {
    // Node.js 16+ なら crypto.randomUUID が使える
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  } catch {}
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function safeJson(v) {
  try { return JSON.stringify(v ?? null); } catch { return "null"; }
}
