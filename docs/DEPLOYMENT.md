# ASIP デプロイメントマニュアル

## 環境構成

| 環境 | 用途 | Vercel | Supabase |
|------|------|--------|----------|
| local | 開発 | - | `supabase start` |
| dev | 検証 | asip-dev.vercel.app | Supabase Dev Project |
| prod | 本番 | asip.vercel.app | Supabase Prod Project |

---

## 1. Supabase プロジェクト作成

### 1.1 Supabase Dashboard でプロジェクト作成

1. https://supabase.com/dashboard にログイン
2. 「New Project」をクリック
3. 設定:
   - **Name**: `asip-dev` または `asip-prod`
   - **Database Password**: 強力なパスワードを設定（控えておく）
   - **Region**: Northeast Asia (Tokyo)
4. 「Create new project」をクリック

### 1.2 接続情報の取得

Project Settings > API から以下を取得:
- **Project URL**: `https://xxxxx.supabase.co`
- **anon public key**: `eyJhbGciOi...`
- **service_role key**: `eyJhbGciOi...`（秘密）
- **Reference ID**: `xxxxx`（GitHub Actions用）

Project Settings > Database から:
- **Connection string (URI)**: `postgresql://postgres:xxxxx@db.xxxxx.supabase.co:5432/postgres`

---

## 2. データベースマイグレーション

マイグレーションファイルは `supabase/migrations/` に格納されています。

**GitHub Actions が自動実行するため、手動実行は不要です。**

### 初回セットアップ（新規プロジェクト）

GitHub Actions の Secrets を設定後、dev/main ブランチに push すると自動適用されます。

### 手動実行が必要な場合

```bash
# Supabase CLI でリンク
export SUPABASE_ACCESS_TOKEN=your_token
supabase link --project-ref your_project_ref

# マイグレーション実行
supabase db push
```

---

## 3. GitHub Actions CI/CD 設定

### 3.1 Repository Secrets

Settings > Secrets and variables > Actions > Repository secrets:

| Secret名 | 取得方法 |
|----------|----------|
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard > Account > Access Tokens |

### 3.2 Environments 設定

Settings > Environments で作成:

**staging** (devブランチ用)
| Secret名 | 値 |
|----------|-----|
| `SUPABASE_PROJECT_ID` | Dev用プロジェクトのReference ID |

**production** (mainブランチ用)
| Secret名 | 値 |
|----------|-----|
| `SUPABASE_PROJECT_ID` | Prod用プロジェクトのReference ID |

※ productionには Required reviewers 設定を推奨

### 3.3 ワークフロー

```
dev push  → staging環境   → Dev Supabase にマイグレーション
main push → production環境 → Prod Supabase にマイグレーション
```

ブランチ名で環境が自動選択され、各環境の `SUPABASE_PROJECT_ID` が使用される。

---

## 4. Vercel デプロイ

### 4.1 Vercel プロジェクト作成

1. https://vercel.com/new にアクセス
2. GitHub リポジトリを選択
3. Framework Preset: Next.js

### 4.2 環境変数

| 変数名 | 説明 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 公開キー |
| `SUPABASE_SERVICE_ROLE_KEY` | サービスキー（秘密） |
| `DATABASE_URL` | PostgreSQL接続文字列（下記参照） |
| `GOOGLE_GENAI_API_KEY` | Gemini API キー |

### 4.3 DATABASE_URL の設定

Supabase Dashboard > Project Settings > Database > Connection string

**Vercel (サーバーレス) では Transaction Pooler を使用:**
```
postgresql://postgres.[project-ref]:[password]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

| 接続タイプ | ポート | 用途 |
|-----------|--------|------|
| Transaction Pooler | 6543 | Vercel等サーバーレス（推奨） |
| Session Pooler | 5432 | 長時間接続が必要な場合 |
| Direct | 5432 | ローカル開発、マイグレーション |

※ Pooler URL は `pooler.supabase.com` を含む

---

## 5. Supabase Auth 設定

### 5.1 認証プロバイダー

Authentication > Providers で有効化:
- Email (デフォルト)
- Google (推奨)

### 5.2 リダイレクトURL

Authentication > URL Configuration:
- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: `https://your-app.vercel.app/auth/callback`

---

## 6. デプロイ手順

```bash
# Dev環境
git push origin dev
# → Vercel 自動デプロイ + GitHub Actions でDBマイグレーション

# Prod環境
git push origin main
# → Vercel 自動デプロイ + GitHub Actions でDBマイグレーション
```

---

## 7. マイグレーション追加

```bash
# 1. マイグレーションファイル作成
touch supabase/migrations/$(date +%Y%m%d%H%M%S)_description.sql

# 2. SQLを記述

# 3. ローカルで検証
supabase db reset

# 4. push → GitHub Actions が自動実行
git add supabase/migrations/
git commit -m "Add migration: description"
git push origin dev
```

---

## 8. トラブルシューティング

| 問題 | 確認事項 |
|------|----------|
| DB接続エラー | `DATABASE_URL`、Connection Pooling設定 |
| 認証エラー | Supabase URL/Key、Redirect URLs |
| Deep Researchが動かない | `GOOGLE_GENAI_API_KEY`、API quota |
| GitHub Actionsマイグレーション失敗 | `SUPABASE_ACCESS_TOKEN`の有効期限、Project ID |
