'use strict';

// ── 基本セットアップ ───────────────────────────────────────────
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { db, verifyIdTokenFromRequest } = require('./firebaseAdmin');
const { sendUserMail, sendNotifyMail } = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;

const {
  ALLOWED_ORIGINS = '',
  REQUIRE_AUTH = 'true',
  NOTIFY_TO = '',
} = process.env;

// ── CORS（フロントのドメインだけ許可）────────────────────────────
const allowedOrigins = ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true); // curl等
    const ok = allowedOrigins.includes(origin);
    return ok ? callback(null, true) : callback(new Error('CORS_NOT_ALLOWED'));
  }
}));

app.use(express.json({ limit: '1mb' }));

// ── レート制限（軽め）───────────────────────────────────────────
app.use(rateLimit({ windowMs: 60 * 1000, max: 60 }));

// ── 監査ログ（失敗してもサービス継続）──────────────────────────
app.use(async (req, res, next) => {
  const started = Date.now();
  res.on('finish', async () => {
    try {
      const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString();
      const uid = res.locals.uid || 'anonymous';
      await db.collection('auditLogs').add({
        route: req.path,
        method: req.method,
        uid,
        ip,
        ts: new Date(),
        status: res.statusCode,
        ms: Date.now() - started,
      });
    } catch (e) {
      console.warn('[auditLogs] write failed:', e.message);
    }
  });
  next();
});

app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// ── 認証ミドルウェア（/estimate で使用）────────────────────────
async function requireAuth(req, res, next) {
  try {
    if (REQUIRE_AUTH !== 'true') return next();
    const decoded = await verifyIdTokenFromRequest(req);
    res.locals.uid = decoded.uid;
    res.locals.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'UNAUTHORIZED', detail: e.message });
  }
}

// ── v0 用 データローダ（同梱 JSON を読む。公開URLは不要）─────────
const fs = require('fs');
const path = require('path');

class DataPack {
  constructor({ rootDir = process.cwd(), relPath = 'data/hiroshima' } = {}) {
    this.dir = path.join(rootDir, relPath);
    this.l02_2023_points = [];
    this.l01_2025_points = [];
    this.stations = [];
    this.deals = [];
    this.meta = { current_date: new Date().toISOString() };
  }
  readJsonSafe(fname) {
    try {
      const p = path.join(this.dir, fname);
      const raw = fs.readFileSync(p, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[DataPack] read failed:', fname, e.message);
      return null;
    }
  }
  async loadAll() {
    const l02 = this.readJsonSafe('l02_2023_residential.json') || { points: [] };
    const l01 = this.readJsonSafe('l01_2025_residential.json') || { points: [] };
    const st  = this.readJsonSafe('stations_hiroshima.json')  || { stations: [] };
    const dl  = this.readJsonSafe('deals_recent.json')        || { deals: [] };
    const mt  = this.readJsonSafe('meta.json')                || {};

    const normPt = p => ({ lat: Number(p.lat), lng: Number(p.lng), ppsqm: Number(p.ppsqm) });
    this.l02_2023_points = (l02.points || []).map(normPt).filter(x => isFinite(x.lat)&&isFinite(x.lng)&&isFinite(x.ppsqm));
    this.l01_2025_points = (l01.points || []).map(normPt).filter(x => isFinite(x.lat)&&isFinite(x.lng)&&isFinite(x.ppsqm));
    this.stations = (st.stations || []).map(s => ({ name: s.name || '', lat: Number(s.lat), lng: Number(s.lng) }))
      .filter(x => isFinite(x.lat)&&isFinite(x.lng));
    this.deals = (dl.deals || []).map(d => ({ lat: Number(d.lat), lng: Number(d.lng), ppsqm: Number(d.ppsqm), date: d.date || null }))
      .filter(x => isFinite(x.lat)&&isFinite(x.lng)&&isFinite(x.ppsqm));
    this.meta = mt;
    console.log(`[DataPack] loaded: L02=${this.l02_2023_points.length}, L01=${this.l01_2025_points.length}, stations=${this.stations.length}, deals=${this.deals.length}`);
  }
}

// ── 推定ロジック（v0）──────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // m
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function idwNearest(points, qLat, qLng, k = 5) {
  if (!points || points.length === 0) return null;
  const arr = points.map(p => ({ ...p, d: haversine(qLat, qLng, p.lat, p.lng) }))
                    .sort((a,b)=> a.d - b.d)
                    .slice(0, k);
  const eps = 1e-6;
  let num = 0, den = 0;
  for (const p of arr) {
    const w = 1 / Math.max(p.d, eps);
    num += w * p.ppsqm; den += w;
  }
  return den > 0 ? (num/den) : null;
}

function percentile(values, p = 0.6) {
  const arr = values.filter(v => typeof v === 'number' && !Number.isNaN(v)).sort((a,b)=>a-b);
  if (arr.length === 0) return null;
  const idx = Math.floor((arr.length - 1) * p);
  return arr[idx];
}

// L02(2023/09) ↔ L01(2025/03) を県中央値で線形補間 → 現月へ時点補正
function timeAdjustFactor(currentISO, meta) {
  if (!meta) return 1;
  const m2023 = meta.l02_2023_median_ppsqm || null;
  const m2025 = meta.l01_2025_median_ppsqm || null;
  if (!m2023 || !m2025) return 1;

  const start = new Date('2023-09-01T00:00:00Z');
  const end   = new Date('2025-03-01T00:00:00Z');
  const now   = new Date(currentISO || new Date().toISOString());
  const months = (d1, d2) => (d2.getUTCFullYear()-d1.getUTCFullYear())*12 + (d2.getUTCMonth()-d1.getUTCMonth());
  const total = Math.max(1, months(start, end));
  const delta = months(start, now);

  const slope = (m2025 - m2023) / total;
  const nowIndex = m2023 + slope * delta;
  const factor = nowIndex / m2025;
  return (!isFinite(factor) || factor <= 0) ? 1 : factor;
}

function nearestStationInfo(stations, lat, lng) {
  if (!stations || stations.length === 0 || !isFinite(lat) || !isFinite(lng)) return { name: null, minutes: null };
  let best = null;
  for (const s of stations) {
    const d = haversine(lat, lng, s.lat, s.lng);
    if (!best || d < best.d) best = { ...s, d };
  }
  const minutes = Math.ceil(best.d / 80); // 80m/分
  return { name: best.name || null, minutes };
}

function computeEstimateV0(input, dataPack) {
  const {
    type = 'building',
    area_sqm = 60,
    built_year,
    lat = null,
    lng = null,
  } = input || {};

  // 1) ベース単価（L01→L02の順にIDW、無ければ県中央値）
  let base_ppsqm = null;
  if (lat && lng) {
    base_ppsqm = idwNearest(dataPack.l01_2025_points, lat, lng, 5)
              || idwNearest(dataPack.l02_2023_points, lat, lng, 5);
  }
  if (!base_ppsqm) {
    base_ppsqm = dataPack.meta?.l01_2025_median_ppsqm
              || dataPack.meta?.l02_2023_median_ppsqm
              || 350000;
  }

  // 2) 近隣事例：半径1.5km / 24ヶ月 / 最大10件
  const deals = [];
  const now = new Date(dataPack.meta?.current_date || new Date().toISOString());
  const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 24);
  if (lat && lng && Array.isArray(dataPack.deals)) {
    for (const d of dataPack.deals) {
      if (!d.date) continue;
      const dd = new Date(d.date + 'T00:00:00Z');
      if (dd < cutoff) continue;
      const dist = haversine(lat, lng, d.lat, d.lng);
      if (dist <= 1500) deals.push({ ...d, dist });
    }
  }
  deals.sort((a,b)=> a.dist - b.dist);
  const dealsTop = deals.slice(0, 10);
  const dealsPpsqm = dealsTop.map(d => d.ppsqm).filter(v => typeof v === 'number');
  const deals_p60 = percentile(dealsPpsqm, 0.6);

  // 3) 時点補正（県中央値）
  const tf = timeAdjustFactor(now.toISOString(), dataPack.meta);
  let ppsqm_current = base_ppsqm * tf;

  // 4) ブレンド：件数で段階ウェイト
  const n = dealsTop.length;
  let wDeals = 0, wBase = 1;
  if (n >= 6)      { wDeals = 0.7; wBase = 0.3; }
  else if (n >= 3) { wDeals = 0.5; wBase = 0.5; }
  else if (n >= 1) { wDeals = 0.3; wBase = 0.7; }
  else             { wDeals = 0.0; wBase = 1.0; }
  if (isFinite(deals_p60)) {
    ppsqm_current = (ppsqm_current * wBase) + (deals_p60 * wDeals);
  }

  // 5) 補正：駅徒歩 / 築年 / 規模
  const st = nearestStationInfo(dataPack.stations, lat, lng);
  const walkMin = (st.minutes != null) ? st.minutes : (input.walk_minutes || 10);
  const step = Math.floor(walkMin / 5);
  const walkAdj = Math.max(-0.20, -0.02 * step);          // −2%/5分 下限−20%

  let ageAdjRate = 0;
  if (type !== 'land' && built_year) {
    const nowYear = new Date().getFullYear();
    const age = Math.max(0, nowYear - Number(built_year));
    ageAdjRate = (age <= 3) ? (-0.005 * age) : (-0.01 * age); // 0–3年 −0.5%/年、以降 −1%/年
    ageAdjRate = Math.max(ageAdjRate, -0.40);                  // 上限 −40%
  }

  let unit = ppsqm_current * (1 + walkAdj) * (1 + ageAdjRate);

  // 規模：単価×面積^0.95
  const scaleFactor = Math.pow(Number(area_sqm || 0), 0.95);
  const priceRaw = unit * scaleFactor;

  // 丸め & レンジ
  const rounding = 100000; // 10万円単位
  const rounded = Math.round(priceRaw / rounding) * rounding;
  let rangePct = 0.15;     // nで自動調整
  if (n >= 6) rangePct = 0.10;
  else if (n >= 3) rangePct = 0.15;
  else rangePct = 0.20;

  const low  = Math.round((rounded * (1 - rangePct)) / rounding) * rounding;
  const high = Math.round((rounded * (1 + rangePct)) / rounding) * rounding;

  return {
    price: rounded,
    range_low: low,
    range_high: high,
    rounding,
    adjustments: {
      walk_rate: Number(walkAdj.toFixed(4)),
      age_rate: Number(ageAdjRate.toFixed(4)),
      time_factor: Number(tf.toFixed(4)),
    },
    basis: {
      used_data_count: n,
      nearest_station: st.name,
      walk_minutes: walkMin,
      p60_baseline_ppsqm: Math.round(ppsqm_current),
    },
  };
}

// ── API: /lead（認証不要）────────────────────────────────────
app.post('/lead', async (req, res) => {
  try {
    const { name, email, phone, note, tags = [] } = req.body || {};
    if (!email) return res.status(400).json({ error: 'MISSING_EMAIL' });

    const ref = await db.collection('leads').add({
      name: name || null,
      email,
      phone: phone || null,
      note: note || null,
      tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
      ts: new Date(),
    });

    if (NOTIFY_TO) {
      await sendNotifyMail(
        NOTIFY_TO,
        '[Satei App] New lead captured',
        `email=${email}\nname=${name||''}\nphone=${phone||''}\nref=${ref.id}`
      ).catch(()=>{});
    }

    return res.json({ ok: true, id: ref.id });
  } catch (e) {
    console.error('/lead error:', e);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── API: /estimate（結果表示直前のAuthが必要）─────────────────
let dataPack; // 起動時にロード
app.post('/estimate', requireAuth, async (req, res) => {
  try {
    const uid = (res.locals.user && res.locals.user.uid) || 'unknown';
    const input = req.body || {};

    const result = computeEstimateV0(input, dataPack);

    const ref = await db.collection('estimates').add({
      uid, input, result, ts: new Date(),
    });

    if (input.send_to && input.email) {
      const subject = '不動産査定（概算）結果';
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
      await sendUserMail(input.email, subject, html).catch(()=>{});
    }

    if (NOTIFY_TO) {
      await sendNotifyMail(
        NOTIFY_TO,
        '[Satei App] Estimate executed (v0)',
        `uid=${uid}\nprice=${result.price}\nrange=${result.range_low}-${result.range_high}\nstation=${result.basis.nearest_station||''}\nwalk=${result.basis.walk_minutes}\n`
      ).catch(()=>{});
    }

    return res.json({ ok: true, id: ref.id, result });
  } catch (e) {
    console.error('/estimate error:', e);
    if (e && e.message === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── 404 / エラー処理 ─────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
app.use((err, req, res, next) => {
  if (err && err.message === 'CORS_NOT_ALLOWED') {
    return res.status(403).json({ error: 'CORS_NOT_ALLOWED' });
  }
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'INTERNAL_ERROR' });
});

// ── 起動：データを事前ロードしてから listen ────────────────
(async () => {
  try {
    dataPack = new DataPack({ rootDir: process.cwd(), relPath: 'data/hiroshima' });
    await dataPack.loadAll();
  } catch (e) {
    console.warn('[DataPack] preload failed:', e.message);
    dataPack = new DataPack({}); // 空でも動作継続（県中央値fallback）
  }
  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
})();
