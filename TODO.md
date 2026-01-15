# ASIP フロントエンド移植計画

プロトタイプ (`Asset-Integration.zip`) からの機能移植計画

---

## 機能比較マトリクス

| 機能 | プロトタイプ | 現行 | 優先度 |
|------|-------------|------|--------|
| **Settings ページ** | ✅ プロンプト管理・バージョン・File Search | ❌ 未実装 | 🔴 高 |
| **CSV インポート** | ✅ カラムマッピング付き | ❌ 未実装 | 🔴 高 |
| **Run Progress 詳細** | ✅ フェーズ・並列状況・経過時間 | ⚠️ 簡易版 | 🔴 高 |
| **個別レポートDL** | ✅ Word/ZIP一括 | ❌ 未実装 | 🟡 中 |
| **Pause/Resume/Stop** | ✅ 完全実装 | ⚠️ 一部 | 🟡 中 |
| **既出仮説フィルター** | ✅ 実装済み | ❌ 未実装 | 🟡 中 |
| **Reprocess モード** | ✅ 実装済み | ❌ 未実装 | 🟢 低 |
| **Favorites** | ✅ 実装済み | ❌ 未実装 | 🟢 低 |
| **他プロジェクトからリソースインポート** | ✅ 実装済み | ❌ 未実装 | 🟢 低 |

---

## 移植フェーズ

### Phase 1: Settings ページ (新規) 🔴
- [ ] `/settings` ルート作成
- [ ] プロンプト管理UI（Step選択、編集、保存）
- [ ] バージョン履歴・ロールバック
- [ ] File Search添付ファイル設定
- [ ] プロンプト一覧エクスポート（Markdown）

### Phase 2: Run Progress 再設計 🔴

> ⚠️ **注意**: プロトタイプの `RunProgressDisplay` は設計が良くないため、単純移植ではなく再設計を推奨。

**現状の問題点:**
- 状態管理が複雑すぎる
- UIとロジックが密結合
- 並列処理状況の表示が見づらい

**再設計方針:**
- [ ] 状態を明確に分離（idle/running/paused/completed/error）
- [ ] フェーズ進捗をステップインジケーターで視覚化
- [ ] 経過時間はカスタムフックで管理
- [ ] 並列処理状況をカード形式で表示
- [ ] Pause/Resume/Stop をコントロールバーに統合

### Phase 3: CSV Import 🔴
- [ ] `CsvImportModal` コンポーネント作成
- [ ] CSV/TSVパーサー実装
- [ ] カラムマッピングUI
- [ ] 仮説インポートAPI連携

### Phase 4: History Panel 強化 🟡
- [ ] 個別レポート一覧表示
- [ ] Word単体ダウンロード
- [ ] ZIP一括ダウンロード
- [ ] デバッグプロンプト表示

### Phase 5: Execution Panel 強化 🟡
- [ ] 既出仮説除外フィルターUI
- [ ] リプロセスモード（STEP2-2アップロード）

### Phase 6: その他 🟢
- [ ] Favorites機能（ダッシュボード）
- [ ] 他プロジェクトからリソースインポート
- [ ] プロジェクト削除連携（project-header.tsx）

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

## 文言一覧（移植対象）

### ヘッダー・ナビゲーション
- "AGC Strategic Innovation Playbook"
- "設定"
- "ログアウト"

### ダッシュボード
- "AGCの新テーマ創出AI"
- "最近のプロジェクト"
- "新規プロジェクトを作成"
- "プロジェクト名"
- "プロジェクト説明（任意）"
- "キャンセル"
- "作成"
- "プロジェクトがありません"
- "最初のプロジェクトを作成して始めましょう"

### プロジェクトワークスペース
- "ターゲット仕様書" (type: target_specification)
- "技術資産リスト" (type: technical_assets)
- "市場ニーズ"
- "技術シーズ"
- "新規作成"
- "他プロジェクトからインポート"
- "新規実行"
- "ジョブ名"
- "自動生成 (YYYYMMDDHHMM)"
- "仮説数"
- "ループ数"
- "モデル選択"
- "Pro (精度優先)"
- "Flash (スピード優先)"
- "既出仮説除外設定"
- "一括分析を開始"
- "リプロセスモード"
- "STEP2-2出力をアップロード"
- "カスタムプロンプト（任意）"

### 実行進捗
- "実行中"
- "一時停止中"
- "Step 2-1: テーマ創出と選定"
- "Step 2-2: テーマの詳細検討"
- "Step 3: テーマ魅力度評価"
- "Step 4: AGC参入検討"
- "Step 5: テーマ一覧表作成"
- "ループ {n}/{total}"
- "一時停止待機中"
- フェーズ: "計画中", "探索中", "推論中", "統合中", "検証中", "完了"
- "Deep Research 起動中", "Deep Research 実行中"
- "仮説抽出中"
- "Step 2-2 並列実行中", "Steps 3-5 並列実行中"
- "一時停止", "再開", "停止"
- "一時停止（現在のステップ完了後）"
- "停止（再開不可）"

### 履歴パネル
- "実行履歴"
- ステータス: "待機中", "処理中", "一時停止", "完了", "エラー", "失敗", "中断"
- "ジョブ詳細"
- "概要", "パラメータ", "出力"
- "ステータス", "処理時間", "開始時刻", "終了時刻", "未完了"
- "ダウンロード": "TSV", "Excel", "Step2 Word"
- "個別レポート", "デバッグ"
- "閉じる"

### 仮説パネル
- "仮説一覧"
- "全選択", "選択解除"
- "削除", "インポート", "一括ダウンロード"
- "仮説番号", "仮説タイトル", "市場", "技術", "操作"
- "個別レポート"
- "仮説がありません"

### CSVインポート
- "仮説CSVインポート"
- "CSVまたはTSVファイルをアップロードしてください"
- "{n}行を検出しました。列の紐づけを設定してください"
- "ファイルを選択"
- "CSV, TSV形式に対応しています"
- "アプリ側列名", "CSV列名"
- "(未選択)", "(選択解除)"
- "列を検索...", "列が見つかりません"
- "戻る", "キャンセル"
- "インポート ({n}件)", "インポート中..."
- "少なくとも1つの列をマッピングしてください"
- "CSVファイルにデータがありません"
- "CSVファイルの解析に失敗しました"
- "ファイルの読み込みに失敗しました"

### 設定ページ
- "設定"
- "ASIPパイプラインのプロンプトを管理"
- "ステップ選択", "編集するステップを選択"
- "Step 2-1: テーマ創出と選定"
- "Step 2-1B: 構造化抽出（任意）"
- "Step 2-2: テーマの詳細検討"
- "Step 3: テーマ魅力度評価"
- "Step 4: AGC参入検討"
- "Step 5: テーマ一覧表作成"
- "バージョン履歴"
- "デフォルト（組み込み）"
- "このバージョンを適用"
- "現在の適用状況"
- "プロンプトを編集して保存"
- "保存して適用"
- "File Search 添付ファイル設定"
- "選択したファイルはAIがFile Searchで参照可能"
- "入力ファイル", "前ステップの出力"
- "プロンプト一覧"
- "エクスポート完了"
- "プロンプト一覧をMarkdownファイルでダウンロードしました"

### エラー・通知メッセージ
- "アクセスが拒否されました"
- "メールアドレスが確認できません"
- "このアプリはagc.comドメインのメールアドレスでのみ利用可能です"
- "サーバー再起動により中断"
- "自動再開を試みます"
- "自動リトライ上限に達しました"
- "手動で再開してください"
- "ユーザーにより停止されました"
- "強制リセットにより中断されました"
- "再開するには「途中から再開」をクリックしてください"
- "パイプラインをステップ{n}から再開しました"

---

## 参照ファイル（プロトタイプ）

展開先: `/tmp/proto-analysis/Asset-Integration/`

| カテゴリ | ファイル |
|----------|----------|
| ページ | `client/src/pages/Dashboard.tsx` |
| ページ | `client/src/pages/ProjectWorkspace.tsx` |
| ページ | `client/src/pages/Settings.tsx` |
| コンポーネント | `client/src/components/ExecutionPanel.tsx` |
| コンポーネント | `client/src/components/HistoryPanel.tsx` |
| コンポーネント | `client/src/components/HypothesesPanel.tsx` |
| コンポーネント | `client/src/components/RunProgressDisplay.tsx` |
| コンポーネント | `client/src/components/CsvImportModal.tsx` |
| スキーマ | `shared/schema.ts` |
| API | `server/routes.ts` |
| パイプライン | `server/gmethod-pipeline.ts` |
| プロンプト | `server/prompts.ts` |
