// mailer.js — v0 no-op mailer (CommonJS)
// メールは一切送らず、「成功した風の結果」を返します。
// 既存の require('./mailer') を変更せずに使えます。

/**
 * @param {{to?:string, subject?:string, html?:string, meta?:object}} payload
 * @returns {Promise<{data:{id:string}, error:null}>}
 */
async function sendNotifyMail(payload = {}) {
  const id = cryptoRandomId();
  console.log(`[mailer] SKIPPED(v0): { id:'${id}', meta:${safeJson(payload.meta)} }`);
  return { data: { id }, error: null };
}

async function enqueueNotifyJob(payload = {}) {
  return sendNotifyMail(payload);
}

function cryptoRandomId() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function safeJson(v) {
  try { return JSON.stringify(v ?? null); } catch { return "null"; }
}

module.exports = { sendNotifyMail, enqueueNotifyJob };
