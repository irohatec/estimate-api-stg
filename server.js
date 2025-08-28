import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

// __dirname（ESM対応）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// public ディレクトリ
const PUBLIC_DIR = path.join(__dirname, "public");

app.use(cors());
app.use(bodyParser.json());

// public 配下を静的配信
app.use(express.static(PUBLIC_DIR));

// /demo ルーティング
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

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Public dir: ${PUBLIC_DIR}`);
});
