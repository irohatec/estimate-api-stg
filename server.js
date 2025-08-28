import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

// __dirname（ESM対策）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// パス定義
const PUBLIC_DIR = path.join(__dirname, "public");
const ASSETS_DIR = path.join(__dirname, "assets");

// Middleware
app.use(cors());
app.use(bodyParser.json());

// 静的配信（public をルートに）
app.use(express.static(PUBLIC_DIR));

// /assets も配信（JSONなど）
app.use("/assets", express.static(ASSETS_DIR));

// /demo/ と /demo/index.html の互換対応：
// 1) public/demo/index.html があればそれを返す
// 2) 無ければ public/demo.html を返す（以前の構成に対応）
function sendDemo(res) {
  const demoIndex = path.join(PUBLIC_DIR, "demo", "index.html");
  const demoSingle = path.join(PUBLIC_DIR, "demo.html");
  if (fs.existsSync(demoIndex)) {
    return res.sendFile(demoIndex);
  } else if (fs.existsSync(demoSingle)) {
    return res.sendFile(demoSingle);
  } else {
    return res.status(404).send("Not Found: demo page");
  }
}

app.get("/demo", (_req, res) => sendDemo(res));
app.get("/demo/", (_req, res) => sendDemo(res));
app.get("/demo/index.html", (_req, res) => sendDemo(res));

// ヘルスチェック
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// サーバ起動
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
