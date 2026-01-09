# Docker環境での開発

## 開発サーバーの起動

### 1. 簡単な方法（推奨）

```bash
# Dockerコンテナで開発サーバーを起動
docker run -d --rm --name asip-dev \
  -p 3000:3000 \
  -v $(pwd):/app \
  -w /app \
  -e NEXT_PUBLIC_MOCK_AUTH=true \
  -e NO_PROXY='*' \
  node:20-alpine \
  npm run dev

# ログを確認
docker logs -f asip-dev

# アプリケーションにアクセス
# ブラウザで http://localhost:3000 を開く
# または curl でテスト
curl http://localhost:3000 --noproxy "*"

# コンテナを停止
docker stop asip-dev
```

### 2. Docker Composeを使用

```bash
# シンプル版のdocker-compose.ymlを使用
docker compose -f docker-compose.simple.yml up -d

# ログを確認
docker compose -f docker-compose.simple.yml logs -f

# コンテナを停止
docker compose -f docker-compose.simple.yml down
```

## 環境変数

モック認証モードで起動する場合：
```bash
NEXT_PUBLIC_MOCK_AUTH=true
```

本番環境変数を使用する場合は、`.env.local`ファイルを作成して適切な値を設定してください。

## トラブルシューティング

### プロキシ環境での問題

ホスト環境でプロキシが設定されている場合、localhostへの接続で問題が発生することがあります。
その場合は、curlコマンドで `--noproxy "*"` オプションを使用してください：

```bash
curl http://localhost:3000 --noproxy "*"
```

### ポートが使用中の場合

別のポートを使用する場合：

```bash
docker run -d --rm --name asip-dev \
  -p 8080:3000 \
  -v $(pwd):/app \
  -w /app \
  -e NEXT_PUBLIC_MOCK_AUTH=true \
  node:20-alpine \
  npm run dev
```

この場合、`http://localhost:8080` でアクセスしてください。