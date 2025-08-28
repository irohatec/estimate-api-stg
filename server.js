import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

// __dirname の代替（ESM用）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ---- 静的ファイル公開設定 ----
// public フォルダをルート配信
app.use(express.static(path.join(__dirname, "public")));

// assets フォルダも公開（JSONなど）
app.use("/assets", express.static(path.join(__dirname, "assets")));
// --------------------------------

// 動作確認用エンドポイント
app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// サーバー起動
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
