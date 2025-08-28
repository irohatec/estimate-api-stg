import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

// __dirname 相当（ESM対策）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Middlewares ---
app.use(cors());
app.use(bodyParser.json());

// --- Static files ---
// /public をルート配信（/demo.html など）
app.use(express.static(path.join(__dirname, "public")));

// /assets をそのまま公開（/assets/... でJSON取得）
// demo.html 側は ../assets, ./assets, /assets, assets を順に試す実装だが、
// いずれも最終的に /assets/... へ到達するため、この1本でOK。
app.use("/assets", express.static(path.join(__dirname, "assets")));

// --- Health check ---
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// --- Start server ---
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
