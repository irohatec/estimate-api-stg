import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// __dirname の代替（ESModules用）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ---- ここが今回の追加部分 ----
// 「public」配下の静的ファイルを公開
app.use(express.static(path.join(__dirname, "public")));

// 「assets」フォルダもそのまま公開
app.use("/assets", express.static(path.join(__dirname, "assets")));
// --------------------------------

// Gemini API 初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// API エンドポイント（SNS生成の例）
app.post("/generate-sns", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "prompt が必要です。" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    res.json({ ok: true, result: text });
  } catch (err) {
    console.error("Error in /generate-sns:", err);
    res.status(500).json({ error: "SNS生成に失敗しました。" });
  }
});

// サーバ起動
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
