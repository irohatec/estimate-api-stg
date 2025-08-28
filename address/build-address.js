// address/build-address.js
// 使い方: node address/build-address.js
// 使い方(任意): node address/build-address.js address/hiroshima/34_hiroshima_chome.csv
import fs from "fs";
import path from "path";

const CSV_PATH =
  process.argv[2] || path.join("address", "hiroshima", "34_hiroshima_chome.csv");
const OUT_DIR = path.join("address", "hiroshima");

// 対象区（広島市 中区/南区）
const TARGETS = [
  { jis: "34101", ward: "広島市中区", out: "34101.json" },
  { jis: "34103", ward: "広島市南区", out: "34103.json" },
];

// 全角->半角 数字
function z2hDigits(s) {
  return s.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
}

// 漢数字→半角（丁目のみ想定）
const KANJI_DIGITS = { "一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10 };
function kanjiToNumber(s) {
  // 1〜99程度の丁目を想定
  let total = 0;
  if (s.length === 1) return KANJI_DIGITS[s] || null;
  // 「十」「二十」「二十一」等
  let ten = 0, one = 0;
  for (const ch of s) {
    if (ch === "十") {
      ten = ten === 0 ? 10 : ten + 10; // 「十十」は来ない想定
    } else if (KANJI_DIGITS[ch]) {
      if (ten) one += KANJI_DIGITS[ch];
      else one += KANJI_DIGITS[ch];
    } else {
      return null;
    }
  }
  if (ten && one === 0) total = ten; else if (ten) total = 10 + one; else total = one;
  return total || null;
}

// 「町丁・字等名」から 町名と丁目を抽出
function parseTownChome(raw) {
  if (!raw) return { town: "", chome: null };
  let s = raw;
  // 注記・括弧などを除去（例：〇〇（次の番地のみ））
  s = s.replace(/（.*?）/g, "").replace(/\(.*?\)/g, "");
  s = s.replace(/\s+/g, "").trim();

  // 末尾が「〇〇丁目」
  // パターン1: 漢数字
  let m = s.match(/^(.*?)([一二三四五六七八九十]+)丁目$/);
  if (m) {
    const n = kanjiToNumber(m[2]);
    return { town: m[1], chome: n };
  }
  // パターン2: 半角/全角数字
  s = z2hDigits(s);
  m = s.match(/^(.*?)(\d+)丁目$/);
  if (m) {
    return { town: m[1], chome: parseInt(m[2], 10) };
  }
  // 丁目なし町名
  return { town: s, chome: null };
}

// 簡易CSVパーサ（カンマ/引用符対応）
function parseCsvLines(text) {
  const rows = [];
  let i = 0, cur = "", inQ = false, row = [];
  while (i < text.length) {
    const ch = text[i++];
    if (ch === '"') {
      inQ = !inQ;
      // 連続する "" はエスケープ
      if (inQ && text[i] === '"') { cur += '"'; i++; inQ = !inQ; }
    } else if (ch === "," && !inQ) {
      row.push(cur); cur = "";
    } else if ((ch === "\n" || ch === "\r") && !inQ) {
      // 行終端（\r\n, \n, \r いずれも）
      if (ch === "\r" && text[i] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function run() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }
  const csv = fs.readFileSync(CSV_PATH, "utf8");
  const rows = parseCsvLines(csv);
  if (rows.length < 2) {
    console.error("CSV has no data.");
    process.exit(1);
  }

  const header = rows[0].map(h => h.trim());
  // 列名の推定（e-Statの表記揺れに対応）
  const idxPref = header.findIndex(h => /都道府県名/.test(h));
  const idxCity = header.findIndex(h => /市区町村名/.test(h));
  const idxTown = header.findIndex(h => /(町丁・字等名|町丁・字等)/.test(h));
  if (idxPref === -1 || idxCity === -1 || idxTown === -1) {
    console.error("Header columns not found. Expected 都道府県名/市区町村名/町丁・字等(名).");
    process.exit(1);
  }

  // ward -> Map(town -> Set(chome))
  const wardMap = new Map();
  for (const t of TARGETS) wardMap.set(t.ward, new Map());

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const prefecture = cols[idxPref]?.trim();
    const ward = cols[idxCity]?.trim();
    const townRaw = cols[idxTown]?.trim();
    if (!prefecture || !ward || !townRaw) continue;
    if (prefecture !== "広島県") continue;

    const target = TARGETS.find(t => t.ward === ward);
    if (!target) continue;

    const { town, chome } = parseTownChome(townRaw);
    if (!town) continue;

    const m = wardMap.get(ward);
    if (!m.has(town)) m.set(town, new Set());
    if (chome) m.get(town).add(chome);
  }

  // 出力
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 各区のJSON
  for (const t of TARGETS) {
    const m = wardMap.get(t.ward);
    const towns = Array.from(m.keys())
      .sort((a, b) => a.localeCompare(b, "ja"))
      .map(name => {
        const ch = Array.from(m.get(name)).sort((a, b) => a - b);
        return { town: name, chome: ch };
      });
    fs.writeFileSync(
      path.join(OUT_DIR, t.out),
      JSON.stringify({ city: t.ward, jis: t.jis, towns }, null, 2)
    );
  }

  // index.json
  const index = {
    prefecture: { code: "34", name_ja: "広島県", name_en: "Hiroshima" },
    cities: TARGETS.map(t => ({
      jis: t.jis,
      name_ja: t.ward,
      name_en: "Hiroshima " + (t.ward.includes("中区") ? "Naka Ward" : "Minami Ward"),
      file: t.out
    }))
  };
  fs.writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify(index, null, 2));

  console.log("✅ Generated:", OUT_DIR);
}
run();
