import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// __dirname をESMで解決
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// public フォルダをルート公開
app.use(express.static(path.join(__dirname, "public")));

// address フォルダを /address で公開
app.use("/address", express.static(path.join(__dirname, "address")));

// rail フォルダを /rail で公開
app.use("/rail", express.static(path.join(__dirname, "rail")));

// /demo を開いたら demo.html を返す（互換ルート）
app.get("/demo", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "demo.html"));
});

// ヘルスチェック
app.get("/healthz", (req, res) => {
  res.json({ ok: true });
});

// サーバ起動
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
