# ASIP フロントエンド移植計画

プロトタイプ (`Asset-Integration.zip`) からの機能移植計画

---

## 実装済み機能 ✅

### 2026-01-17 実装完了
- [x] **Run Progress Display** - リアルタイム進捗表示（経過時間、フェーズ、並列処理状況）
- [x] **CSV Import/Export** - 仮説のインポート/エクスポート（カラムマッピング付き）
- [x] **デバッグプロンプト表示** - 各ステップのプロンプト確認ダイアログ
- [x] **Card/Table ビュー切り替え** - サイドバーの表示モード切替
- [x] **TSV/Excel/ZIP ダウンロード** - 出力ドロップダウンメニュー
- [x] **S3/S4 パーサー** - テキスト出力の構造化抽出
- [x] **仮説サイドバー強化** - ステータス集計、フィルター、ソート、プログレスバー
- [x] **仮説詳細ビュー** - タブ切り替え、Markdown表示、スコアテーブル
- [x] **React Query移行** - ポーリングベースのデータ取得
- [x] **用語統一** - Replit最新版に合わせてステップ名を更新
  - G-Method → ASIP
  - Step X → SX 形式に統一
  - S3: テーマ魅力度評価、S4: AGC参入検討

---

## 機能比較マトリクス

| 機能 | プロトタイプ | 現行 | 優先度 |
|------|-------------|------|--------|
| **Settings ページ** | ✅ プロンプト管理・バージョン・File Search | ✅ 基本実装済み | 🟡 中 |
| **Word出力機能** | ✅ 個別/一括Word | ❌ 壊れている | 🔴 高 |
| **列カスタマイズ** | ✅ columnOrder/visibleColumns | ❌ 未実装 | 🔴 高 |
| **仮説削除機能** | ✅ 個別/一括削除 | ❌ 未実装 | 🔴 高 |
| **リソースファイルアップロード** | ✅ 単一追加時にファイル選択可 | ❌ テキスト入力のみ | 🟡 中 |
| **他プロジェクトからインポート** | ✅ リソース選択UI | ❌ 「開発中」表示 | 🟡 中 |
| **ループ切り替え** | ✅ siblingRuns管理 | ❌ 未実装 | 🟡 中 |
| **S3/S4個別レポート** | ✅ 評価・参入検討レポート表示 | ❌ 未実装 | 🟡 中 |
| **既出仮説フィルター** | ✅ 実装済み | ✅ 実装済み | ✅ 完了 |
| **実行タイミング詳細** | ✅ 詳細統計表示 | ❌ 未実装 | 🟡 中 |
| **Reprocess モード** | ✅ 実装済み | ✅ 実装済み | ✅ 完了 |
| **Favorites** | ✅ 実装済み | ❌ 未実装 | 🟢 低 |
| **PromptManual** | ✅ プロンプトヘルプ表示 | ❌ 未実装 | 🟢 低 |

---

## ✅ 完了: パフォーマンス改善（2026-01-17）

### 実施内容
- [x] **ポーリング間隔最適化** - 3s→8s (runs), 5s→10s (hypotheses)
- [x] **カラム選択性** - 重いJSONBカラムを除外（555KB→2.2KB, 99.6%削減）
- [x] **SSRクエリ並列化** - Promise.allで全クエリを並列実行
- [x] **認証キャッシュ** - React cache()でリクエスト内キャッシュ
- [x] **DB接続設定最適化** - サーバーレス向け設定
- [x] **Supabase Pooler** - Transaction mode (6543) + pgbouncer=true
- [x] **Streaming SSR** - loading.tsx追加でTTFB改善
- [x] **仮説詳細の遅延読み込み** - 新エンドポイント `/api/hypotheses/[uuid]`

### 効果
| 指標 | Before | After |
|------|--------|-------|
| Hypotheses list | 555KB | 2.2KB |
| Runs list | 161KB | 65KB |
| SSR時間 | 順次実行 | 並列実行 |
| 初回表示 | 2-4秒 | <1秒 |

### 残課題（優先度低）
- [ ] Realtime活用（ポーリング置き換え）
- [ ] JOINクエリ化

---

## 🔴 緊急: Word出力機能修正 + E2E

### 問題
- Word出力機能が壊れている

### 対応
- [ ] E2Eテスト追加（Word出力の動作確認）
- [ ] APIエンドポイント `/api/runs/[runId]/reports/word` の修正
- [ ] 一括Wordダウンロード機能の実装

### E2Eテスト項目
```typescript
// tests/e2e/word-download.spec.ts
- 完了したRunのWord出力ボタンが有効であること
- Word出力クリックでdocxファイルがダウンロードされること
- ダウンロードファイルが破損していないこと
- ZIP一括ダウンロードが動作すること
```

---

## 移植フェーズ

### Phase 1: Settings ページ (新規) 🔴
- [ ] `/settings` ルート作成
- [ ] プロンプト管理UI（Step選択、編集、保存）
- [ ] バージョン履歴・ロールバック
- [ ] File Search添付ファイル設定
- [ ] プロンプト一覧エクスポート（Markdown）

### Phase 2: 列カスタマイズ 🔴
- [ ] `columnOrder` 状態管理（列の表示順序）
- [ ] `visibleColumns` 状態管理（表示/非表示）
- [ ] 列設定モーダル（上下移動、チェックボックス）
- [ ] localStorage永続化
- [ ] Step5の `step5ColumnOrder` から自動取得

### Phase 3: 仮説削除機能 🔴
- [ ] APIエンドポイント `DELETE /api/projects/{id}/hypotheses/{uuid}`
- [ ] 個別削除ボタン（ゴミ箱アイコン）
- [ ] 一括削除機能
- [ ] 削除確認ダイアログ

### Phase 4: ループ切り替え 🟡
- [ ] `siblingRuns` の取得（同じjobNameのRun群）
- [ ] ループセレクターUI
- [ ] 「全ループ」「N回目のみ」フィルタリング
- [ ] Run切り替え時のデータリセット

### Phase 5: S3/S4個別レポート 🟡
- [ ] S3 テーマ魅力度評価レポート表示（select + 詳細ビュー）
- [ ] S4 AGC参入検討レポート表示
- [ ] 判定バッジの自動カラーリング（Go/No-Go）

### Phase 6: リソース管理強化 🟡
- [ ] 単一追加タブにファイルアップロードボタン追加
- [ ] 他プロジェクトからリソースインポート機能実装
- [ ] PromptManual（プロンプトヘルプドキュメント）

### Phase 7: その他機能 🟢
- [ ] S2-1 表示モード切り替え（テーブル/全文）
- [ ] 実行タイミング詳細表示（executionTiming）
- [ ] 既出仮説除外フィルターUI
- [ ] リプロセスモード（S2-2アップロード）
- [ ] Favorites機能（プロジェクトお気に入り）
- [ ] 中断からの再開（Resume）機能強化

---

## DBスキーマ変更

### hypotheses テーブル追加カラム
```sql
ALTER TABLE hypotheses ADD COLUMN target_spec_id INTEGER REFERENCES resources(id);
ALTER TABLE hypotheses ADD COLUMN technical_assets_id INTEGER REFERENCES resources(id);
ALTER TABLE hypotheses ADD COLUMN index_in_run INTEGER;
```

### 新規テーブル
```sql
-- prompt_versions (既存確認要)
CREATE TABLE prompt_versions (
  id SERIAL PRIMARY KEY,
  step_number INTEGER NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  is_active INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- step_file_attachments
CREATE TABLE step_file_attachments (
  id SERIAL PRIMARY KEY,
  step_number INTEGER NOT NULL UNIQUE,
  attached_files JSONB DEFAULT '[]',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- user_favorites
CREATE TABLE user_favorites (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, project_id)
);
```

---

## 参照ファイル

### プロトタイプ（Replit）
展開先: `/tmp/replit-ref/Asset-Integration/`

| カテゴリ | ファイル |
|----------|----------|
| コンポーネント | `client/src/components/HypothesesPanel.tsx` (1,029行) |
| コンポーネント | `client/src/components/HistoryPanel.tsx` (1,426行) |
| コンポーネント | `client/src/components/RunProgressDisplay.tsx` (308行) |
| コンポーネント | `client/src/components/CsvImportModal.tsx` |

### 現行実装
| カテゴリ | ファイル |
|----------|----------|
| メインビュー | `src/components/run/run-detail-view.tsx` |
| サイドバー | `src/components/run/hypothesis-sidebar.tsx` |
| 詳細ビュー | `src/components/run/hypothesis-detail.tsx` |
| カード | `src/components/run/hypothesis-card.tsx` |
| プログレス | `src/components/run/run-progress-display.tsx` |
| CSVインポート | `src/components/run/csv-import-modal.tsx` |
| デバッグ | `src/components/run/debug-prompts-dialog.tsx` |
| パーサー | `src/lib/parsers/` |

---

## 優先度サマリー

### 今すぐやるべき（🔴 高）
1. ~~パフォーマンス改善~~ ✅ 完了
2. Word出力機能修正 + E2Eテスト
3. 列カスタマイズ
4. 仮説削除機能

### 次にやるべき（🟡 中）
5. ループ切り替え
6. S3/S4個別レポート
7. リソースファイルアップロード

### 余裕があれば（🟢 低）
8. その他機能（Favorites, PromptManual等）
9. Realtime活用
