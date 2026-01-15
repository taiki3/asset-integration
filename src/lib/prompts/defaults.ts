// Default prompts for ASIP pipeline steps

export const STEP_NAMES: Record<number, string> = {
  21: 'Step 2-1: テーマ創出と選定',
  211: 'Step 2-1B: 構造化抽出（任意）',
  22: 'Step 2-2: テーマの詳細検討',
  3: 'Step 3: テーマ魅力度評価',
  4: 'Step 4: AGC参入検討',
  5: 'Step 5: テーマ一覧表作成',
};

export const AVAILABLE_STEPS = [21, 211, 22, 3, 4, 5] as const;
export type StepNumber = (typeof AVAILABLE_STEPS)[number];

// Available files for File Search attachment per step
export interface AvailableFile {
  id: string;
  name: string;
  description: string;
  category: 'input' | 'step_output';
}

export const AVAILABLE_FILES_BY_STEP: Record<number, AvailableFile[]> = {
  21: [
    { id: 'target_spec', name: 'ターゲット仕様書', description: '市場・顧客ニーズの入力データ', category: 'input' },
    { id: 'technical_assets', name: '技術資産リスト', description: '技術シーズの入力データ', category: 'input' },
  ],
  211: [
    { id: 'target_spec', name: 'ターゲット仕様書', description: '市場・顧客ニーズの入力データ', category: 'input' },
    { id: 'technical_assets', name: '技術資産リスト', description: '技術シーズの入力データ', category: 'input' },
    { id: 'step21_output', name: 'Step 2-1 出力', description: 'テーマ創出の結果', category: 'step_output' },
  ],
  22: [
    { id: 'target_spec', name: 'ターゲット仕様書', description: '市場・顧客ニーズの入力データ', category: 'input' },
    { id: 'technical_assets', name: '技術資産リスト', description: '技術シーズの入力データ', category: 'input' },
    { id: 'step21_output', name: 'Step 2-1 出力', description: 'テーマ創出の結果', category: 'step_output' },
  ],
  3: [
    { id: 'technical_assets', name: '技術資産リスト', description: '技術シーズの入力データ', category: 'input' },
    { id: 'step22_output', name: 'Step 2-2 出力', description: '詳細検討の結果', category: 'step_output' },
  ],
  4: [
    { id: 'technical_assets', name: '技術資産リスト', description: '技術シーズの入力データ', category: 'input' },
    { id: 'step22_output', name: 'Step 2-2 出力', description: '詳細検討の結果', category: 'step_output' },
    { id: 'step3_output', name: 'Step 3 出力', description: '魅力度評価の結果', category: 'step_output' },
  ],
  5: [
    { id: 'step22_output', name: 'Step 2-2 出力', description: '詳細検討の結果', category: 'step_output' },
    { id: 'step3_output', name: 'Step 3 出力', description: '魅力度評価の結果', category: 'step_output' },
    { id: 'step4_output', name: 'Step 4 出力', description: 'AGC参入検討の結果', category: 'step_output' },
  ],
};

// Default prompts (abbreviated for readability - full versions in production)
export const DEFAULT_PROMPTS: Record<number, string> = {
  21: `【マスタープロンプト】新規素材ビジネス戦略仮説の構築

P0 契約（Non-negotiables：5項）
1) 出力順序（開始アンカー＋区切り線含む）
- 先頭は【Phase 1：監査ストリップ（Proof-of-Work Evidence）】で開始。
- 開始アンカー（Fail-fast）:
  1行目＝「【Phase 1：監査ストリップ（Proof-of-Work Evidence）】」
  2行目＝Top {HYPOTHESIS_COUNT}短表のヘッダ行
  3行目＝同ヘッダ直下の区切り行

2) ロック見出しの完全一致（Phase 2）
- ホワイトリスト（許可見出し文字列・順序固定）

3) Phase 1の最小証跡
- Ideation総数（≥30）＋領域内訳、Negative Scope照合。
- 選抜重み固定：I 0.40／M 0.30／L 0.15／U 0.15

4) 第3章カードのスキーマ固定

5) 引用・参考文献の整合

=== 市場・顧客ニーズ（Role A）===
{TARGET_SPEC}

=== 技術資産リスト（Role B）===
{TECHNICAL_ASSETS}

=== 過去に生成した仮説（重複回避用）===
{PREVIOUS_HYPOTHESES}`,

  211: `【構造化抽出プロンプト】Step 2-1の出力から仮説を抽出

Step 2-1の出力テキストから、Top {HYPOTHESIS_COUNT}の仮説を構造化して抽出してください。

各仮説について以下の情報を抽出：
- 仮説タイトル
- 解決する物理的矛盾
- Cap-ID指紋
- 判定タグ
- 判定理由
- 合成スコア

=== Step 2-1 出力 ===
{STEP21_OUTPUT}`,

  22: `【Deep Research プロンプト】仮説の詳細検討

以下の仮説について、詳細な市場調査と技術検証を実施してください。

## 対象仮説
{HYPOTHESIS_TITLE}
{HYPOTHESIS_SUMMARY}

## 調査項目
1. 市場規模と成長性
2. 主要プレイヤー分析
3. 技術的実現可能性
4. 参入障壁と競争優位性
5. 想定される課題とリスク

=== 技術資産リスト ===
{TECHNICAL_ASSETS}`,

  3: `# システム指令：新規素材ビジネス評価プログラム（Dr. Kill-Switch）

## 役割定義 (Persona)
**名前:** Dr. Kill-Switch（R&D戦略投資監査官）
**使命:** 提案された事業仮説に対し、科学的整合性と経済合理性の両面から「致命的な欠陥」を特定し、投資の可否（Go/No-Go）を冷徹に判定すること。

## 評価基準
各仮説に対し、以下の基準で1〜5点の採点を行う：
① 科学的妥当性 (Weight: 20%)
② 製造実現性 (Weight: 15%)
③ 性能優位 (Weight: 20%)
④ 単位経済 (Weight: 20%)
⑤ 市場魅力度 (Weight: 10%)
⑥ 規制・EHS (Weight: 5%)
⑦ IP防衛 (Weight: 5%)
⑧ 戦略適合 (Weight: 5%)

## 出力フォーマット
### 仮説 No.X: [仮説タイトル]
* **科学×経済判定:** (Go / Conditional Go / Pivot / No-Go)
* **総合スコア:** (100点満点)
* **総評:** (辛口評価の結論)

=== 技術資産リスト ===
{TECHNICAL_ASSETS}

=== Step 2-2の出力（詳細検討レポート）===
{STEP22_OUTPUT}`,

  4: `# システム指令：新規素材ビジネス・競合キャッチアップ評価プログラム (War Gaming Mode)

## 役割定義 (Persona)
**名前:** Strategic Investment Auditor（R&D戦略投資監査官）
**使命:** 科学的に成立する仮説であっても、「Incumbent（既存の支配者）に勝てるか」を冷徹に試算すること。

## 評価アルゴリズム
### A. 距離と摩擦の計測
1. 対象競合の特定
2. TRLギャップ計測
3. Moat係数の決定（1.0〜3.0）
4. キャッチアップ期間の算出

### B. 自社技術シーズ監査基準
① 顧客アクセス (A/B/C)
② 資本的持久力 (A/B/C)
③ 製造基盤 (A/B/C)

## 出力フォーマット
### 仮説 No.X: [仮説タイトル]
* **戦略判定:** (Go / Caution / No-Go)
* **結論:** (競合に対する勝算の評価)

=== 技術資産リスト ===
{TECHNICAL_ASSETS}

=== Step 2-2の出力（詳細検討レポート）===
{STEP22_OUTPUT}

=== Step 3の出力（科学×経済評価レポート）===
{STEP3_OUTPUT}`,

  5: `# システム指令：事業仮説データベース構築 (Final Integration)

## 役割定義
あなたは、高度な情報処理能力を持つデータアナリストです。
3つのソースから情報を抽出し、情報の解像度を落とさずにマスターテーブルを作成します。

## 抽出・統合ルール
1. データ単位: {HYPOTHESIS_COUNT}つの仮説について、それぞれ1行ずつデータを生成
2. サニタイズ: 改行コード、タブ文字、特殊記号を含めない
3. 出力形式: TSV (Tab Separated Values) 形式
4. ヘッダー: 1行目に項目名を出力

## 出力項目（カラム定義）
1. 仮説番号
2. 仮説タイトル
3. 業界
4. 分野
5. 素材が活躍する舞台
... (以下省略)

=== Step 2-2の出力（詳細検討レポート）===
{STEP22_OUTPUT}

=== Step 3の出力（科学×経済評価レポート）===
{STEP3_OUTPUT}

=== Step 4の出力（AGC参入検討レポート）===
{STEP4_OUTPUT}`,
};
