// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { db, verifyIdTokenFromRequest } from "./firebaseAdmin.js";
import { sendUserMail, sendNotifyMail } from "./mailer.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const {
  ALLOWED_ORIGINS = "",
  REQUIRE_AUTH = "true",
  NOTIFY_TO = "",
  GEMINI_API_KEY // v0では未使用（将来の精緻化で利用）
} = process.env;

// CORS 設定
const allowedOrigins = ALLOWED_ORIGINS
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // 非ブラウザ（curl等）は許可
    if (!origin) return callback(null, true);
    const ok = allowedOrigins.includes(origin);
    return ok ? callback(null, true) : callback(new Error("CORS_NOT_ALLOWED"));
  }
}));
app.use(express.json({ limit: "1mb" }));

// レート制限（シンプル）
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // 1分60リクエスト
});
app.use(limiter);

// 監査ログ（最小）
app.use(async (req, res, next) => {
  res.locals.auditStart = Date.now();
  res.on("finish", async () => {
    try {
      const ip = (req.headers["x-forwarded-for"] || req.ip || "").toString();
      const uid = res.locals.uid || "anonymous";
      const ts = new Date();
      await db.collection("auditLogs").add({
        route: req.path,
        method: req.method,
        uid,
        ip,
        ts,
        status: res.statusCode,
        ms: Date.now() - res.locals.auditStart
      });
    } catch (e) {
      console.warn("[auditLogs] write failed:", e.message);
    }
  });
  next();
});

// ヘルスチェック
app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// 認証ミドルウェア（結果表示直前のサインイン想定）
async function requireAuth(req, res, next) {
  try {
    if (REQUIRE_AUTH !== "true") {
      return next();
    }
    const decoded = await verifyIdTokenFromRequest(req);
    res.locals.uid = decoded.uid;
    res.locals.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: "UNAUTHORIZED", detail: e.message });
  }
}

// v0 簡易推定ロジック（ダミー）
// ※ 後で L01/L02・駅(N05)・国交省CSVとの段階ブレンドを実装します。
// ここでは疎通確認とUI結線用に、説明可能な固定係数で算出。
function computeEstimateV0(input) {
  const {
    type = "building",     // "land" | "building"
    area_sqm = 60,         // 面積（㎡）
    built_year,            // 築年（西暦, building時のみ有効）
    walk_minutes = 10,     // 駅徒歩（分）※将来は座標→自動算出
    p60_baseline = 350000  // ㎡あたり基準単価（円）仮
  } = input || {};

  // 規模補正：単価 * 面積^0.95
  const scaleFactor = Math.pow(Number(area_sqm), 0.95);
  let unit = p60_baseline;

  // 駅徒歩補正：5分ごと -2%（下限 -20%）
  const step = Math.floor(Number(walk_minutes) / 5);
  const walkAdj = Math.max(-0.20, -0.02 * step); // 例: 10分 → -4%
  unit = unit * (1 + walkAdj);

  // 築年補正：年 -1%（0〜3年は -0.5%/年、上限 -40%、土地は非適用）
  let ageAdjRate = 0;
  if (type !== "land" && built_year) {
    const nowYear = new Date().getFullYear();
    const age = Math.max(0, nowYear - Number(built_year));
    if (age <= 3) {
      ageAdjRate = -0.005 * age;
    } else {
      ageAdjRate = -0.01 * age;
    }
    ageAdjRate = Math.max(ageAdjRate, -0.40);
    unit = unit * (1 + ageAdjRate);
  }

  // 事例/ベース段階ブレンドと時点補正は v0 では省略（将来実装）
  const timeAdjRate = 0.0;
  const casesUsed = 0;

  // 集計：p60想定 → レンジ ±15%（n不明のため固定）
  const price = unit * scaleFactor;
  const rounding = 100000; // 10万円丸め
  const rounded = Math.round(price / rounding) * rounding;

  const rangePct = 0.15;
  const low = Math.round((rounded * (1 - rangePct)) / rounding) * rounding;
  const high = Math.round((rounded * (1 + rangePct)) / rounding) * rounding;

  return {
    price: rounded,
    range_low: low,
    range_high: high,
    rounding,
    adjustments: {
      walk_rate: Number(walkAdj.toFixed(4)),
      age_rate: Number(ageAdjRate.toFixed(4)),
      time_rate: Number(timeAdjRate.toFixed(4))
    },
    basis: {
      used_data_count: casesUsed,
      nearest_station: null,
      walk_minutes: Number(walk_minutes),
      p60_baseline: p60_baseline
    }
  };
}

// --------------- Routes ---------------

// 見込み客（リード）保存 & 社内通知
app.post("/lead", async (req, res) => {
  try {
    const { name, email, phone, note, tags = [] } = req.body || {};
    if (!email) return res.status(400).json({ error: "MISSING_EMAIL" });

    const doc = {
      name: name || null,
      email,
      phone: phone || null,
      note: note || null,
      tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
      ts: new Date()
    };

    const ref = await db.collection("leads").add(doc);

    // 社内通知（SMTPが無い場合はスキップ）
    if (process.env.NOTIFY_TO) {
      await sendNotifyMail(
        process.env.NOTIFY_TO,
        "[Satei App] New lead captured",
        `email=${email}\nname=${name || ""}\nphone=${phone || ""}\nref=${ref.id}`
      );
    }

    return res.json({ ok: true, id: ref.id });
  } catch (e) {
    console.error("/lead error:", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// 査定（結果表示直前にサインイン必須）
app.post("/estimate", requireAuth, async (req, res) => {
  try {
    const uid = (res.locals.user && res.locals.user.uid) || "unknown";
    const input = req.body || {};

    // v0 簡易推定
    const result = computeEstimateV0(input);

    // Firestore 保存（estimates）
    const doc = {
      uid,
      input,
      result,
      ts: new Date()
    };
    const ref = await db.collection("estimates").add(doc);

    // 「自分に送る」メール（任意）
    if (input.send_to && input.email) {
      const subject = "不動産査定（概算）結果";
      const html = `
        <p>概算の査定結果です（v0）。</p>
        <ul>
          <li><b>参考価格</b>：${result.price.toLocaleString()} 円</li>
          <li><b>レンジ</b>：${result.range_low.toLocaleString()} 〜 ${result.range_high.toLocaleString()} 円</li>
          <li><b>補正（徒歩）</b>：${(result.adjustments.walk_rate * 100).toFixed(1)}%</li>
          <li><b>補正（築年）</b>：${(result.adjustments.age_rate * 100).toFixed(1)}%</li>
          <li><b>丸め</b>：${(result.rounding/10000)} 万円単位</li>
        </ul>
        <p>※ 本結果は参考値です（v0ロジック）。</p>
      `;
      await sendUserMail(input.email, subject, html);
    }

    // 社内通知（簡易）
    if (NOTIFY_TO) {
      await sendNotifyMail(
        NOTIFY_TO,
        "[Satei App] Estimate executed (v0)",
        `uid=${uid}\nprice=${result.price}\nrange=${result.range_low}-${result.range_high}\ndoc=${ref.id}`
      );
    }

    return res.json({ ok: true, id: ref.id, result });
  } catch (e) {
    console.error("/estimate error:", e);
    if (e.message === "UNAUTHORIZED" || e.message === "MISSING_TOKEN") {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: "NOT_FOUND" });
});

// エラーハンドラ（CORSなど）
app.use((err, req, res, next) => {
  if (err && err.message === "CORS_NOT_ALLOWED") {
    return res.status(403).json({ error: "CORS_NOT_ALLOWED" });
  }
  console.error("[Unhandled Error]", err);
  res.status(500).json({ error: "INTERNAL_ERROR" });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
