# Estimate API (v0 / staging)

不動産査定アプリの **API ひな形**（v0）。  
Render (onrender.com) にデプロイ → WordPress プラグインから呼び出します。

## エンドポイント

- `GET /health` … 稼働確認
- `POST /lead` … 見込み客保存（Firestore: `leads`）
- `POST /estimate` … 査定（結果表示直前に Firebase Auth サインイン必須）

## 必要な環境変数

`.env.example` を参照。Render では **Environment** に下記を設定：

- `FIREBASE_PROJECT_ID` / `CLIENT_EMAIL` / `PRIVATE_KEY`（Firebase Admin）
- `ALLOWED_ORIGINS`：`https://irohatec.com,https://yamashita-syouten.com`
- `REQUIRE_AUTH`：`true`
- `NOTIFY_TO`：社内通知（カンマ区切り）
- `GEMINI_API_KEY`：将来の精緻化用（v0では未使用）
- `SMTP_*`：任意（未設定ならメール送信はスキップ）

> `PRIVATE_KEY` は改行を `\n` に置換して一行文字列で保存してください。

## Render設定

- **Start Command**: `node server.js`
- **Instance Type**: Free → 本番前に Starter へ
- **Region**: 近接リージョン（例: Singapore）

## Firestore ルール（参考・任意）
クライアント直アクセス禁止（Admin 経由のみ）：

