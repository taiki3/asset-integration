# E2E Testing

このディレクトリにはE2Eテスト環境が含まれています。Docker Composeでアプリケーションとデータベースを起動し、ホストマシンのPlaywrightでテストを実行します。他の開発環境とポートが衝突しないよう、カスタムポートを使用しています。

## ポート構成

| サービス | ポート | 説明 |
|---------|--------|------|
| App | 55000 | Next.jsアプリケーション |
| PostgreSQL | 55432 | データベース |

## 使い方

### 全自動実行

```bash
npm run e2e
```

これにより:
1. PostgreSQLとNext.jsアプリのコンテナが起動
2. アプリケーションの起動を待機
3. ホストマシンでPlaywrightテストを実行
4. 終了後すべてのコンテナが停止・クリーンアップ

### 手動実行 (デバッグ用)

```bash
# 環境を起動 (バックグラウンド)
npm run e2e:up

# アプリの準備を待機
npm run e2e:wait

# テストを実行
npm run e2e:local

# 環境を停止・クリーンアップ
npm run e2e:down
```

### テスト実行のみ (環境が起動済みの場合)

```bash
npm run e2e:local
```

## 初回セットアップ

ホストマシンでPlaywrightを実行するため、初回のみブラウザのインストールが必要です:

```bash
# @playwright/testがインストールされていることを確認
npm install

# Chromiumをインストール
npx playwright install chromium
```

## ディレクトリ構成

```
e2e/
├── README.md              # このファイル
├── playwright.config.ts   # Playwright設定
├── init-db/               # DB初期化SQL
│   ├── 01-schema.sql      # スキーマ定義
│   └── 02-seed.sql        # テストデータ
└── tests/                 # テストファイル
    ├── health.spec.ts     # ヘルスチェック
    ├── auth.spec.ts       # 認証テスト
    ├── projects.spec.ts   # プロジェクトテスト
    └── api.spec.ts        # APIテスト
```

## テストデータ

`init-db/02-seed.sql` にテスト用のサンプルデータが定義されています:

- **e2e-test-user**: テストユーザーID
- **Project 1**: 空のテストプロジェクト
- **Project 2**: 完了済みサンプルデータを含むプロジェクト

## 環境変数

- `NEXT_PUBLIC_MOCK_AUTH=true`: モック認証を使用
- `PLAYWRIGHT_BASE_URL`: テスト対象URL (デフォルト: `http://localhost:55000`)

## トラブルシューティング

### コンテナが起動しない

```bash
# ログを確認
docker compose -f docker-compose.e2e.yml logs

# 強制的にリビルド
docker compose -f docker-compose.e2e.yml build --no-cache
```

### ポートが使用中

docker-compose.e2e.yml のポート番号を変更してください。

### テストが失敗する

```bash
# PlaywrightのHTMLレポートを確認
open playwright-report/index.html
```

### Permission denied エラー

Dockerコンテナがrootで作成したファイルが原因の場合:

```bash
sudo chown -R $USER:$USER node_modules test-results playwright-report
```
