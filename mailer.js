// mailer.js  — v0 no-op mailer (Resend未認証/送信停止モード)
// 目的: v0ではメールを一切送らない。ただし呼び出し元は壊さない。

/**
 * @typedef {Object} NotifyPayload
 * @property {string} to         - 送信先メール（使わない）
 * @property {string} subject    - 件名（使わない）
 * @property {string} html       - HTML本文（使わない）
 * @property {Object} [meta]     - 任意メタ（ログ用）
 */

/**
 * 送信せずに即時 resolve。ログは「SKIPPED(v0)」を1行だけ。
 * 呼び出し元の期待値に合わせて { data: { id }, error: null } を返す。
 * @param {NotifyPayload} payload
 * @returns {Promise<{data:{id:string}, error:null}>}
 */
export async function sendNotifyMail(payload) {
  const id = cryptoRandomId();
  console.log(`[mailer] sendNotifyMail SKIPPED(v0): { id: '${id}', meta: ${safeJson(payload?.meta)} }`);
  // 実送信なし
  return { data: { id }, error: null };
}

/**
 * v0ではバッチやキューも未使用。互換のためダミーを残す。
 */
export async function enqueueNotifyJob(payload) {
  return sendNotifyMail(payload);
}

/** ライブラリに依存しない簡易ID */
function cryptoRandomId() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

function safeJson(v) {
  try { return JSON.stringify(v ?? null); } catch { return 'null'; }
}

export default { sendNotifyMail, enqueueNotifyJob };
