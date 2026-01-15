# CLAUDE.md

## ステージング・本番環境のデバッグ

パイプラインの動作確認時は `scripts/check-runs.ts` でDB状態を確認すること：

```bash
# ステージング（デフォルト）
npx tsx scripts/check-runs.ts
npx tsx scripts/check-runs.ts --run-id <ID>

# 本番
npx tsx scripts/check-runs.ts --env production
npx tsx scripts/check-runs.ts --env production --run-id <ID>
```

認証情報は `.env.remote` に設定済み（gitignored）。
