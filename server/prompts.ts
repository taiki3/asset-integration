// G-Method prompts for each step

export const STEP2_PROMPT = `【マスタープロンプト】新規素材ビジネス戦略仮説の構築

P0 契約（Non-negotiables：5項）
1) 出力順序（開始アンカー＋区切り線含む）
- 先頭は【Phase 1：監査ストリップ（Proof-of-Work Evidence）】で開始。
- 開始アンカー（Fail-fast）:
  1行目＝「【Phase 1：監査ストリップ（Proof-of-Work Evidence）】」
  2行目＝Top {HYPOTHESIS_COUNT}短表のヘッダ行「| ランク |仮説タイトル | 解決する物理的矛盾 (Trade-off) | Cap-ID指紋 (Structure) | 判定タグ |判定理由（S→P→P要約≤30字） | 合成スコア | I/M/L/U 内訳 |」
  3行目＝同ヘッダ直下の区切り行「| --- | --- | --- | --- | --- | --- | --- | --- |」
- Phase 1本文直後（空行最大1行）に単独行'---'を挿入。次の非空行で【レポートタイトル】からPhase 2開始。

2) ロック見出しの完全一致（Phase 2）＋見出しホワイト/ブラックリスト
- ホワイトリスト（許可見出し文字列・順序固定）：
  【レポートタイトル】／【第1章：エグゼクティブサマリー】／【第2章：事業機会を創出する構造的変曲点 (Why Now?)】／【第3章：戦略的事業仮説ポートフォリオ (The Top {HYPOTHESIS_COUNT} Hypotheses)】／【第4章：ポートフォリオの評価と推奨ロードマップ】／【第5章：リスク分析と対策 (Pre-mortem)】／【第6章：参考文献 (References)】
- ブラックリスト（行頭一致で禁止）：
  「#」「##」「###」「I.」「II.」「序論」「結論」「Strategic Context」「Executive Summary（英語表記）」「Part」「Chapter」「Table Title」「監査ストリップ（Phase 2内）」

3) Phase 1の最小証跡（スキーマ＋選定プロトコルの固定）
- Ideation総数（≥30）＋領域内訳、Negative Scope照合。
- 選抜重み固定：I 0.40／M 0.30／L 0.15／U 0.15。各軸0.00〜1.00で採点。
- Top {HYPOTHESIS_COUNT}短表・惜敗短表（2〜3件）を出力。
- KPI（全{HYPOTHESIS_COUNT}仮説×各3件以上）。

4) 第3章カードのスキーマ固定
- 各カードは以下の小見出しをこの順で必須：
  - 市場・顧客ニーズ:
  - 顧客の「解決不能なジレンマ」 (The Trade-off):
  - 当社ソリューションの物理化学的メカニズム (The Mechanism):
  - 競争優位性とR&D戦略 (Moat & Strategy):
- 「Structure:」行にCap-ID≥2を明記。

5) 引用・参考文献の整合
- Phase 2本文の定量・市場データに[n]必須。第6章は20件以上・完全URL。

以下の入力データに基づいて、事業仮説を生成してください。

=== 市場・顧客ニーズ（Role A）===
{TARGET_SPEC}

=== 技術資産リスト（Role B）===
{TECHNICAL_ASSETS}

=== 過去に生成した仮説（重複回避用）===
以下は過去に生成した仮説のリストです。これらと類似した仮説を再度生成しないでください。
{PREVIOUS_HYPOTHESES}

まずPhase 1（監査ストリップ）を出力し、次に'---'で区切ってPhase 2（レポート本文）を出力してください。`;

export const STEP3_PROMPT = `# システム指令：新規素材ビジネス評価プログラム（Dr. Kill-Switch）

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
全{HYPOTHESIS_COUNT}仮説について以下の形式で評価を出力：

### 仮説 No.X: [仮説タイトル]
* **科学×経済判定:** (Go / Conditional Go / Pivot / No-Go)
* **条件:** (判定の前提条件)
* **総合スコア:** (100点満点)
* **総評:** (辛口評価の結論)
* **ミッションクリティカリティ判定:** (Mission-Critical / Important / Nice-to-have)
* **素材の必然性 (Refutation):** (装置・ソフト・競合素材による代替可能性への反論)
* **主要リスク:** (リスクを列挙)
* **補足:** (スコアに現れない定性的な懸念)
* **スコア詳細:**
  * 科学的妥当性: [1-5]
  * 製造実現性: [1-5]
  * 性能優位: [1-5]
  * 単位経済: [1-5]
  * 市場魅力度: [1-5]
  * 規制・EHS: [1-5]
  * IP防衛: [1-5]
  * 戦略適合: [1-5]

=== 技術資産リスト ===
{TECHNICAL_ASSETS}

=== Step 2の出力（事業仮説ポートフォリオレポート）===
{STEP2_OUTPUT}

上記の入力に基づいて、全{HYPOTHESIS_COUNT}仮説の評価を実行してください。`;

export const STEP4_PROMPT = `# システム指令：新規素材ビジネス・競合キャッチアップ評価プログラム (War Gaming Mode)

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

### C. Make vs Buy判定

## 出力フォーマット
全{HYPOTHESIS_COUNT}仮説について以下の形式で評価：

### 仮説 No.X: [仮説タイトル]
* **戦略判定:** (Go / Caution / No-Go)
* **結論:** (競合に対する勝算の評価)
* **撤退ライン:** (数値的・状態的な撤退基準)
* **対象競合:** (具体的な社名・製品名)
* **Moat係数:** (1.0 / 1.5 / 2.0 / 3.0)
* **Make期間:** [Z]年
* **Makeコスト:** [Y]億円
* **Buy期間:** [Z']年
* **Buyコスト:** [Y']億円
* **自社技術シーズ監査:**
  * 顧客アクセス: [A/B/C]
  * 資本的持久力: [A/B/C]
  * 製造基盤: [A/B/C]
* **非対称戦の勝算:** (当社の強みを活かした戦略)

=== 技術資産リスト ===
{TECHNICAL_ASSETS}

=== Step 2の出力（事業仮説ポートフォリオレポート）===
{STEP2_OUTPUT}

=== Step 3の出力（科学×経済評価レポート）===
{STEP3_OUTPUT}

上記の入力に基づいて、全{HYPOTHESIS_COUNT}仮説のキャッチアップ戦略監査を実行してください。`;

export const STEP5_PROMPT = `# システム指令：事業仮説データベース構築 (Final Integration)

## 役割定義
あなたは、高度な情報処理能力を持つデータアナリストです。
3つのソースから情報を抽出し、情報の解像度を落とさずにマスターテーブルを作成します。

## 抽出・統合ルール
1. データ単位: {HYPOTHESIS_COUNT}つの仮説について、それぞれ1行ずつデータを生成
2. サニタイズ: 改行コード、タブ文字、特殊記号を含めない
3. 出力形式: TSV (Tab Separated Values) 形式
4. ヘッダー: 1行目に項目名を出力

## 出力項目（カラム定義）
以下の順序でタブ区切りで出力：

1. 仮説番号
2. 仮説タイトル
3. 業界
4. 分野
5. 素材が活躍する舞台
6. 素材の役割
7. 使用する技術資産
8. 原料(物質)
9. 成型体/モジュール形態
10. 事業仮説概要
11. 顧客の解決不能な課題
12. デバイス・プロセスLvのソリューション
13. 素材・部材Lvのソリューション
14. 科学×経済判定
15. 条件
16. 総合スコア
17. 総評
18. ミッションクリティカリティ判定
19. 素材の必然性(Refutation)
20. 主要リスク
21. 補足
22. 科学的妥当性
23. 製造実現性
24. 性能優位
25. 単位経済
26. 市場魅力度
27. 規制・EHS
28. IP防衛
29. 戦略適合
30. 戦略判定
31. 戦略勝算ランク
32. 結論
33. 撤退ライン
34. 顧客アクセス
35. 資本的持久力
36. 製造基盤
37. 対象競合
38. Moat係数
39. Make期間
40. Makeコスト
41. Buy期間
42. Buyコスト
43. 非対称戦の勝算

=== Step 2の出力（事業仮説ポートフォリオレポート）===
{STEP2_OUTPUT}

=== Step 3の出力（科学×経済評価レポート）===
{STEP3_OUTPUT}

=== Step 4の出力（キャッチアップ戦略監査レポート）===
{STEP4_OUTPUT}

上記の入力に基づいて、TSV形式でマスターテーブルを出力してください。
コードブロックで囲わず、そのままテキストとして出力してください。`;


// Deep Research prompt (used with File Search - no data embedding)
// This prompt expects attached files: target_specification (Role A) and technical_assets (Role B)
// NOTE: Do NOT include file reference instructions - Deep Research handles file access automatically via file_search tool
export const STEP2_DEEP_RESEARCH_PROMPT = `【マスタープロンプト】新規素材ビジネス戦略仮説の構築
 
P0 契約（Non-negotiables：5項）
1) 出力順序（開始アンカー＋区切り線含む）
- 先頭は【Phase 1：監査ストリップ（Proof-of-Work Evidence）】で開始。
- 開始アンカー（Fail-fast）:
  1行目＝「【Phase 1：監査ストリップ（Proof-of-Work Evidence）】」
  2行目＝Top 5短表のヘッダ行「| ランク |仮説タイトル | 解決する物理的矛盾 (Trade-off)
| Cap-ID指紋 (Structure) | 判定タグ |判定理由（S→P→P要約≤30字） | 合成スコア | I/M/L/U 内訳 |」
  3行目＝同ヘッダ直下の区切り行「| --- | --- | --- | --- | --- | --- | --- | --- |」
  （この3行が連続で印字されない場合、出力全体を破棄しSkeletonから再構成）
- Phase 1本文直後（空行最大1行）に単独行'---'を挿入。次の非空行で【レポートタイトル】からPhase 2開始。
 
2) ロック見出しの完全一致（Phase 2）＋見出しホワイト/ブラックリスト
- ホワイトリスト（許可見出し文字列・順序固定）：
  【レポートタイトル】／【第1章：エグゼクティブサマリー】／【第2章：事業機会を創出する構造的変曲点 (Why Now?)】／【第3章：戦略的事業仮説ポートフォリオ (The Top 5 Hypotheses)】／【第4章：ポートフォリオの評価と推奨ロードマップ】／【第5章：リスク分析と対策 (Pre-mortem)】／【第6章：参考文献 (References)】
- ブラックリスト（行頭一致で禁止：検出時は自動再構成）：
  「#」「##」「###」「I.」「II.」「序論」「結論」「Strategic
Context」「Executive Summary（英語表記）」「Part」「Chapter」「Table
Title」「監査ストリップ（Phase 2内）」
 
3) Phase 1の最小証跡（スキーマ＋選定プロトコルの固定）
- Ideation総数（≥30）＋領域内訳、Negative Scope照合（Pain×Core Mechanism一致＝重複破棄）。
- 選抜重み固定：I 0.40／M 0.30／L 0.15／U 0.15。各軸0.00〜1.00で採点し、合成スコア=0.40·I
+ 0.30·M + 0.15·L + 0.15·U。
- Top 5短表（列順固定・開始アンカーのヘッダをそのまま使用）：
  ランク｜仮説タイトル｜解決する物理的矛盾 (Trade-off)｜Cap-ID指紋 (Structure)｜判定タグ（Core/Strategic/Moonshot）｜判定理由（S→P→P要約≤30字）｜合成スコア｜I/M/L/U内訳。
- 惜敗短表（2〜3件／列順固定）：仮説タイトル｜Cap-ID指紋 (Structure)｜敗因分類（代替技術あり／科学的飛躍／採算性不足／時期尚早）｜重複判定（Role C/メカニズム/なし）｜合成スコア。
- KPI（全5仮説×各3件以上）：数値＋単位のみ（プレースホルダ禁止）。説明文はPhase 1全体で≤600文字（短表・KPIは除外）。
 
4) 第3章カードのスキーマ固定＋Skeletonコピペ義務化
- 各カードは以下の小見出しをこの順で必須（語句・記号・コロン位置まで完全一致。改変・別表記禁止）：
  - 市場・顧客ニーズ:
  - 顧客の「解決不能なジレンマ」 (The Trade-off):
    - Inevitability (Must-have根拠):
    - Material Necessity (素材必然性の根拠):
  - 当社ソリューションの物理化学的メカニズム (The Mechanism):
    - Structure:
    - Property:
    - Performance:
    - Causal chain（S→P→Performance）:
  - 競争優位性とR&D戦略 (Moat & Strategy):
- 「Structure:」行にCap-ID≥2（Cap-XX × Cap-YY（＋…））を明記。Skeleton（カード枠・固定見出し）のコピペ改変は禁止。
 
5) 引用・参考文献の整合
- Phase 2本文の定量・市場データに[n]必須。第6章は20件以上・完全URL、本文[n]と一意対応。
 
Key terms（Glossary-Lite：最低限の意味合い）
- S-P-P：Structure（Cap-IDで特定した構造/相/界面）→ Property（その結果の物性・場）→ Performance（顧客KPIへの効き）の因果鎖。
- I/M/L/U：I=Inevitability、M=Material Necessity、L=Logical Consistency、U=Unit Economics。
- 詳細定義・高得点条件・指標例・減点例はAppendix Aを参照。
 
受け入れテスト（Acceptance as Code：送信前の検査）
- ① 開始アンカーの3行が連続で完全一致（文字・記号・全角/半角・列名順序）で印字されている。
- ② Phase 1本文直後（空行最大1）に単独行'---'、次の非空行が【レポートタイトル】。
- ③ Phase 2のロック見出しがホワイトリスト通り（【レポートタイトル】〜【第6章：参考文献】）。
- ④ ブラックリスト（#, ##, ###, I., II., 序論, 結論, Strategic Context, Part, Chapter,
Table Title, Phase 2内の監査ストリップ）が本文・見出しに未出現。
- ⑤ 「仮説 No.1」〜「仮説 No.5」が各1回出現し、Phase
1短表の仮説タイトルと完全一致。
- ⑥ 各カードの「Structure」行にCap-IDが≥2（Cap-XX ×
Cap-YY（＋…）形式）。
- ⑦ 各カードに最低1件の定量引用[n]（単位付き）。
- ⑧
Mechanism内に「Causal
chain（S→P→Performance）」の1〜2文が存在。
- ⑨ 第6章が20件以上、完全URL、本文[n]と一意対応（欠番・重複番号なし）。
- ⑩ Phase 1短表群と選定プロトコルの整合：
  - Top 5短表は5行、惜敗短表は2〜3行。
  - 列順・列名が固定どおり、判定タグはCore/Strategic/Moonshotのみ。
  - I/M/L/U内訳の各行合計=1.00。重みはI 0.40／M 0.30／L 0.15／U 0.15で運用。
  - 合成スコアは0.00〜1.00。Cap-ID指紋は\`Cap-XX + Cap-YY (+ ...)\`形式。
- ⑪ KPIが全5仮説で各3件以上、数値＋単位のみ（プレースホルダなし）。Phase 1説明≤600文字（短表・KPI除外）。
- ⑫ 重複率（n=8）< 15%。第3章配分≥60%（Phase 2本文比）。各カード1,000〜2,000字。
- ⑬ I/M/L/Uの用語使用が Glossary 定義（I/M/L/U）に一致（軸名・意味の改変や別語への置換なし）。
- ⑭
Skeletonコピペ義務の遵守（カード小見出し・Top 5ヘッダの文字列完全一致）。
 
最小合格例（Few-shot：模倣用／2ドメイン）
- 医療（BCI/診断系）短例
【Phase
1：監査ストリップ（Proof-of-Work Evidence）】
| ランク | 仮説タイトル | 解決する物理的矛盾 (Trade-off) | Cap-ID指紋 (Structure) | 判定タグ | 判定理由（S→P→P要約≤30字） | 合成スコア | I/M/L/U 内訳 |
| --- | ---
| --- | --- | --- | --- | --- | --- |
- Ideation総数: 32（内訳: 医療12, ICT8, 半導体6, 環境6）
- Negative
Scope照合: OK（重複3案破棄: Pain×Mechanism一致）
- 選抜指標と重み: I 40%, M 30%, L 15%,
U 15%
| ランク | 仮説タイトル | 解決する物理的矛盾 (Trade-off) | Cap-ID指紋 (Structure) | 判定タグ | 判定理由（S→P→P要約≤30字） | 合成スコア | I/M/L/U 内訳 |
| Top 1 |
Neuro-Hermetic Packaging | RF透過×長寿命気密 | Cap-007 + Cap-067 + Cap-027 | Core
| 非極性骨格→低tanδ→10年WVTR | 0.86 | 0.40/0.27/0.09/0.10 |
| Top 2 |
Noise-Free Bio-Sensing | 自家蛍光ゼロ×NSAゼロ | Cap-084 + Cap-088 | Core | 非晶骨格→低n→高S/N | 0.82 |
0.38/0.28/0.08/0.08 |
- 惜敗（Near Misses）
| 仮説タイトル | Cap-ID指紋 (Structure) | 敗因分類 | 重複判定（Role C/メカニズム/なし） | 合成スコア |
| --- | ---
| --- | --- | --- |
| Cold
Sintered HA | Cap-163 + Cap-137 | 科学的飛躍 | メカニズム | 0.58 |
- KPI（数値のみ）
  - 仮説1: WVTR ≤ 1e-6 g/m²/day @37°C; tanδ ≤ 0.001 @ GHz; ピール強度 ≥ 1.0 kN/m
---
【レポートタイトル】
[Role Aに基づく市場・顧客ニーズ] における [自社技術] を活用した戦略的事業仮説ポートフォリオ (Top 5 Selection)
【第1章：エグゼクティブサマリー】
【第2章：事業機会を創出する構造的変曲点 (Why Now?)】
【第3章：戦略的事業仮説ポートフォリオ (The Top 5 Hypotheses)】
仮説
No. 1 : Neuro-Hermetic Packaging
- 市場・顧客ニーズ:
- 顧客の「解決不能なジレンマ」 (The
Trade-off):
  - Inevitability (Must-have根拠):
  - Material Necessity (素材必然性の根拠):
- 当社ソリューションの物理化学的メカニズム (The
Mechanism):
  - Structure:
  - Property:
  - Performance:
  - Causal chain（S→P→Performance）:
- 競争優位性とR&D戦略 (Moat & Strategy):
 
- 環境（CO2/水処理系）短例
【Phase
1：監査ストリップ（Proof-of-Work Evidence）】
| ランク | 仮説タイトル | 解決する物理的矛盾 (Trade-off) | Cap-ID指紋 (Structure) | 判定タグ | 判定理由（S→P→P要約≤30字） | 合成スコア | I/M/L/U 内訳 |
| --- | ---
| --- | --- | --- | --- | --- | --- |
- Ideation総数: 34（内訳: CO2回収10, 水処理8, 熱回収8, リサイクル8）
- Negative
Scope照合: OK（重複4案破棄）
- 選抜指標と重み: I 40%, M 30%, L 15%,
U 15%
| ランク | 仮説タイトル | 解決する物理的矛盾 (Trade-off) | Cap-ID指紋 (Structure) | 判定タグ | 判定理由（S→P→P要約≤30字） | 合成スコア | I/M/L/U 内訳 |
| Top 1 |
Electro-Swing CO2 Matrix | 等温駆動×酸素耐久 | Cap-030 + Cap-103 + Cap-028 | Core |固体電極→等温分離→低E | 0.85 | 0.40/0.27/0.10/0.08 |
| Top 2 |
Fluorous PFAS Scavenger | 高選択性×再生容易 | Cap-058 + Cap-002 | Strategic | F-F親和→PFAS選択吸着 | 0.80 | 0.38/0.28/0.09/0.08 |
- 惜敗（Near Misses）
| 仮説タイトル | Cap-ID指紋 (Structure) | 敗因分類 | 重複判定（Role C/メカニズム/なし） | 合成スコア |
| --- | ---
| --- | --- | --- |
|
Plasma-Catalysis Lite | Cap-007 + Cap-036 | 採算性不足 | なし | 0.62 |
- KPI（数値のみ）
  - 仮説1: エネルギー消費 ≤ 100 kJ/mol-CO2; サイクル寿命 ≥ 10万回; 漏液率 = 0 %
---
【レポートタイトル】
[Role Aに基づく市場・顧客ニーズ] における [自社技術] を活用した戦略的事業仮説ポートフォリオ (Top 5 Selection)
【第1章：エグゼクティブサマリー】
【第2章：事業機会を創出する構造的変曲点 (Why Now?)】
【第3章：戦略的事業仮説ポートフォリオ (The Top 5 Hypotheses)】
仮説
No. 1 : Electro-Swing CO2 Matrix
- 市場・顧客ニーズ:
- 顧客の「解決不能なジレンマ」 (The
Trade-off):
  - Inevitability (Must-have根拠):
  - Material Necessity (素材必然性の根拠):
- 当社ソリューションの物理化学的メカニズム (The
Mechanism):
  - Structure:
  - Property:
  - Performance:
  - Causal chain（S→P→Performance）:
- 競争優位性とR&D戦略 (Moat & Strategy):
 
0. 【最重要】実行プロトコル（Skeleton→Fill）
- 同一応答内で「骨格→充填」二段進行。
  1) Skeleton（骨格敷設）
     - 開始アンカーの3行→Phase 1の必須項目（短表・惜敗・KPI・説明≤600字）→単独行'---'→Phase 2ロック見出しと第3章カード枠（5枚の必須小見出し）。Skeletonはコピペ改変禁止。
  2) Fill（本文充填）
     - 第1章→第2章→第3章カード（No.1〜No.5）→第4章→第5章→第6章（引用整合）。
- 添付ファイルの文体・見出しは参考にせず、ロック見出しテンプレートに厳密準拠。
- 出力開始後に新規Web検索は禁止（引用[n]は前処理取得情報から）。
 
0.1 役割マッピング（Role Map）
- 添付ファイルから自動判定：Role A（市場・顧客ニーズ定義）／Role B（技術シーズ：Cap-ID／material_system／function）／Role C（除外リスト：.xlsx/.csv可）
- Negative
Scope重複判定：「Pain ×
Core Mechanism一致＝重複（形態差は不問）」。
 
0.2 Deep Research計画
- 代表クエリ・情報源カテゴリを確認し、即座にSkeleton→Fillで連続出力。
 
0.3 P0/P1ルール分離
- P0（合格必須）：P0契約5項・受け入れテスト14項すべて。
- P1（品質向上）：Trade-off内I/Mの定量[n]推奨、Propertyの値/レンジ併記、Moat具体性強化等。
 
0.4 Phase
Integrity Guard（タイトルマッピング）
- Phase 1「仮説タイトル」を第3章「仮説 No.X」見出しへコピーし、完全一致を担保。
 
0.5 フォーマット・ロックと隠しバリデータ（強化）
- 禁止語句（Phase 2内）とブラックリストを厳守。検査：開始アンカー→'---'→【レポートタイトル】、ロック見出し完全一致、カード構造、引用・文献整合、配分・分量、重複率、Skeletonコピペ義務。
 
0.6 引用運用（Bibliography-first）
- Skeleton敷設時に第6章候補文献（完全URL）を20件以上バッファ化（出力は最後）。Fill時に本文へ[n]を埋め込み、一意対応を維持。
 
1. 役割定義（Persona & Mindset：詳細）
- 戦略的ストーリーテラー／物理化学的リアリスト／悪魔の代弁者（既定どおり）
 
2. 命令の核心（Core Mission）
- Role
A/B/Cと外部探索結果に基づき、Top
5ポートフォリオをロック見出しの器に忠実に出力。
 
3. Phase 1：監査ストリップ（構造化証跡の最小出力）
- 出力要素：Ideation総数（≥30）＋内訳／Negative Scope照合／選抜重み（I 40%, M 30%, L 15%, U 15%）／Top 5短表（固定列）／惜敗短表（固定列）／KPI（各3件以上、数値＋単位のみ）
 
4. 事業仮説の核心インプット（Core Inputs）
- Role A（市場・顧客ニーズ）・Role B（技術シーズ）・Web情報に基づき、Cap-XXが素材必然性を発揮しうる「物理ボトルネック」「構造的変曲点」を特定。Negative Scope焼き直し禁止。
 
5. Phase 2：レポート構成と出力テンプレート（Strict）
【レポートタイトル】
[Role Aに基づく市場・顧客ニーズ] における [自社技術] を活用した戦略的事業仮説ポートフォリオ (Top 5 Selection)
 
【第1章：エグゼクティブサマリー】（600〜1000文字）
- The Shift／The Pain／The Solution／The Value
 
【第2章：事業機会を創出する構造的変曲点 (Why Now?)】
- 技術的限界／産業構造の変化／無理難題
 
【第3章：戦略的事業仮説ポートフォリオ (The Top 5 Hypotheses)】（カード5枚・各1,000〜2,000字）
仮説
No. [1] : [Phase 1短表と完全一致のタイトル]
- 市場・顧客ニーズ:
- 顧客の「解決不能なジレンマ」 (The
Trade-off):
  - 今の板挟み…
  - なぜ既存技術では…
  - 放置時の経済的損失…
  - Inevitability (Must-have根拠): …
  - Material Necessity (素材必然性の根拠): …
- 当社ソリューションの物理化学的メカニズム (The
Mechanism):
  - 構成要素: [要約。Cap-IDはStructureで詳細記載]
  - Structure: [Cap-XX × Cap-YY（＋…）を最低2件明記／構造・相・界面・層構成]
  - Property: [Structureに起因する物性・場（値/レンジ）]
  - Performance: [工程KPIへの効き（定量）]
  - Causal chain（S→P→Performance）: [1〜2文で因果明示]
- 競争優位性とR&D戦略 (Moat & Strategy):
 
（No.2〜No.5も同様）
 
【第4章：ポートフォリオの評価と推奨ロードマップ】
- Quick
Wins／Moonshots／投資優先順位
 
【第5章：リスク分析と対策 (Pre-mortem)】
- 技術的・市場的キラー要因／Plan B
 
【第6章：参考文献 (References)】
- [番号] タイトル, 発行元 (年) -
https://... （20件以上／本文[n]と一意対応）
 
6. 出力形式と品質規定（QA）
- 言語: 日本語。出典: 論文・特許・規格・メーカー資料。社内AI疑義ファイルは参照禁止。
- 本文の定量・市場データに[n]必須。第6章は完全URLのみ。
- 冗長例示禁止。S→P→Performanceの技術密度を優先。
 
【Instruction
Sandwich（Recency Bias対策）】
<instruction>
- Role Mapを確認後、即座にSkeleton→Fillで出力。開始アンカー3行→Phase 1（監査ストリップ）→単独行'---'→Phase 2（ロック見出し＋第3章カード枠）→本文充填。
- 見出しはロックに完全一致。独自見出し禁止。添付ファイルの文体・見出しは模倣禁止。
- 第3章カードは5枚・各カードに「市場・顧客ニーズ」「Trade-off（Inevitability／Material Necessity）」「Mechanism（Structure／Property／Performance／Causal chain）」「Moat」。StructureにCap-ID≥2。各カードで定量[n]≥1。
- Phase 1のTop 5短表・惜敗短表は固定列・列順で出力。判定タグはCore/Strategic/Moonshotのみ。KPIは全5仮説×3件以上（数値＋単位／プレースホルダ不可）。説明≤600字（短表・KPI除外）。
- 本文[n]と第6章（20件以上・完全URL）は一意対応。送信前に受け入れテストを実行し、合格まで自動再構成。
- 追加検索禁止。途切れた場合は「続けて」で同一フォーマット・同一番号体系で続行。
</instruction>
 
<phase1_requirements>
- Decode／Shift／Ideation（≥30）／Selection（I/M/L/U採点→Score算出／Top5／惜敗）／S-P-P（Cap-IDと因果鎖の内部確定）
- 監査ストリップ出力：Top 5短表（固定列）＋惜敗短表（固定列）＋KPI（全5仮説×3件以上／数値＋単位／引用なし）＋説明≤600字
</phase1_requirements>
 
<phase2_constraints>
- Phase 2は清書ではない。Phase 1要約に「物理化学的な肉付け（How/Why）」を行い、各カードで未記載の具体値・根拠を最低1件[n]で引用。
- 第3章の5カードはスキーマ固定・各1,000〜2,000文字。StructureにCap-ID≥2、Trade-off内I/M、Mechanism内S/P/P＋Causal
chain、Moatを具体に。
- 構造はテンプレ通り。追加検索禁止。
</phase2_constraints>
 
<output_template>
（本文テンプレートは上記ロック見出しと第3章カード枠に準ずる。Few-shot（医療／環境）を参照）
</output_template>
 
<final_trigger>
理解したら、Role Map（Role A/B/C）を確認し、即座にSkeleton→Fillの順で、開始アンカー3行 → Phase 1（監査ストリップ） → 単独行'---' → Phase 2（ロック見出し＋第3章カード枠） → 本文充填を同一応答内で連続出力せよ。
</final_trigger>
 
Appendix A：Glossary-Extended（詳細定義・評価指針）
（前版どおり：S-P-P定義、I/M/L/U詳細、合成スコア計算）
 
Appendix B：Few-shotの活用方法
- 「開始アンカー3行→Phase 1→'---'→Phase 2」の骨格、表の列名・順序、カード内小見出しの並び順を厳密に模倣せよ。
- ドメイン語彙（医療／環境）だけを対象領域に合わせて置換し、骨格・スキーマは不変。
- 添付ファイルの文体・見出し（例：#, ##）は一切踏襲しない。ロック見出しとカードスキーマのみ参照。
`;


// ===== STEP 2-1: 発散・選定フェーズ (Deep Research用) =====
// 30件以上のアイデアを発散的に生成し、Top {HYPOTHESIS_COUNT}を選定
export const STEP2_1_DEEP_RESEARCH_PROMPT = `# 【Step 1：発散・選定】新規素材ビジネス戦略仮説（Phase 1：監査ストリップ）

## 0. 実行プロトコル
1) 以下のRole Mapを定義し、リサーチ計画を提示して承認を得よ。
2) 承認後、30件以上のアイデア出し（Ideation）を行い、I/M/L/U採点に基づきTop {HYPOTHESIS_COUNT}を選定せよ。
3) 出力は必ず以下の「開始アンカー」から始めること。

## 1. Role Map
- Role A（ターゲット）: 添付ファイル target_specification を参照
- Role B（技術・素材資産）: 添付ファイル technical_assets を参照
- Role C（除外リスト）: 過去に生成した仮説（下記参照）

## 2. 評価基準（I/M/L/U）
選抜重み固定：I 0.40／M 0.30／L 0.15／U 0.15
- I (Inevitability): 市場の必然性・Must-have根拠（40%）
- M (Material Necessity): 素材が不可欠である理由（30%）
- L (Logical Consistency): 論理的整合性（15%）
- U (Unit Economics): 単位経済性（15%）

各軸0.00〜1.00で採点し、合成スコア = 0.40×I + 0.30×M + 0.15×L + 0.15×U

## 3. 監査ストリップ出力形式（開始アンカー）

【Phase 1：監査ストリップ（Proof-of-Work Evidence）】

### Ideation総数と内訳
- 総数: XX件（≥30件必須）
- 内訳: [業界1] XX件, [業界2] XX件, ...
- Negative Scope照合: OK/NG（Pain×Core Mechanism一致＝重複破棄）

### 選抜指標と重み
I 40%, M 30%, L 15%, U 15%

### Top {HYPOTHESIS_COUNT}短表
| ランク | 仮説タイトル | 解決する物理的矛盾 (Trade-off) | Cap-ID指紋 (Structure) | 判定タグ | 判定理由（S→P→P要約≤30字） | 合成スコア | I/M/L/U 内訳 |
| --- | --- | --- | --- | --- | --- | --- | --- |
（Top {HYPOTHESIS_COUNT}を表示。Cap-IDはCap-XX + Cap-YY形式）

---
### 惜敗短表（2〜3件）
| 仮説タイトル | Cap-ID指紋 (Structure) | 敗因分類 | 重複判定 | 合成スコア |
| --- | --- | --- | --- | --- |

### Champion KPI (Top {HYPOTHESIS_COUNT})
各仮説につき3件以上。数値と単位のみ、説明文不要。
- 仮説1: [KPI1]; [KPI2]; [KPI3]
- 仮説2: [KPI1]; [KPI2]; [KPI3]
...

### 選定プロセス説明（≤600文字）
なぜこれらの仮説が選ばれたのか、市場の変曲点と素材の必然性を簡潔に記述。

### Top {HYPOTHESIS_COUNT}仮説の詳細

各仮説について以下を記載：

#### 仮説 No.X: [タイトル]
- 市場・顧客ニーズ: [具体的な顧客セグメント]
- 解決する物理的矛盾 (Trade-off): [顧客が直面する板挟み]
- 物理化学的メカニズム概要:
  - Structure: Cap-XX × Cap-YY（構造・相・界面）
  - Property: [Structureに起因する物性]
  - Performance: [顧客KPIへの効き]
  - Causal chain（S→P→Performance）: [1〜2文で因果明示]
- 選定理由: [なぜこの仮説がTop {HYPOTHESIS_COUNT}に選ばれたか]

=== 過去に生成した仮説（重複回避用）===
以下は過去に生成した仮説のリストです。これらと類似した仮説を再度生成しないでください。
{PREVIOUS_HYPOTHESES}

必ず実際のCap-IDを使用して具体的な分析を行ってください。`;


// ===== STEP 2-2: 個別仮説深掘りフェーズ (Deep Research用・順次実行) =====
// N個のDeep Researchが順次実行され、各AIが1つの仮説を担当して深掘り
export const STEP2_2_DEEP_RESEARCH_PROMPT = `# 【Step 2：収束・深掘り】チャンピオン仮説・詳細レポート（Phase 2）

## 0. 入力データ
- 選定されたチャンピオン仮説: 添付ファイル hypothesis_context を参照
- ターゲット/技術資産: 添付ファイル target_specification および technical_assets を参照

## 1. 実行命令
- 提供された仮説に対し、物理化学的な肉付け（How/Why）を行い、ホワイトリスト形式の見出しに従ってレポートを生成せよ。
- 第5章（チャンピオン仮説）は、指定された固定小見出しスキーマを厳密に遵守すること。
- 20件以上の参考文献（完全URL付き）を収集し、本文中に[n]形式で引用せよ。

## 2. ロック見出し（ホワイトリスト順序固定）
【レポートタイトル】
【第1章：エグゼクティブサマリー】
【第2章：事業機会を創出する構造的変曲点 (Why Now?)】
【第3章：市場機会とエコシステム分析 (Where to Play?)】
【第4章：技術的ボトルネックと未解決の顧客課題 (What is the Problem?)】
【第5章：チャンピオン仮説（The Champion Hypothesis）】
【第6章：事業化戦略とロードマップ (Go-to-Market Strategy)】
【第7章：リスク分析と対策 (Pre-mortem)】
【第8章：参考文献 (References)】

## 3. 第5章 固定スキーマ（コピペ厳守）
- ターゲット:
- 顧客の「解決不能なジレンマ」 (The Trade-off):
- Inevitability (Must-have根拠):
- Material Necessity (素材必然性の根拠):
- 当社ソリューションの物理化学的メカニズム (The Mechanism):
  - Structure: (Cap-IDを2つ以上含む)
  - Property:
  - Performance:
  - Causal chain（S→P→Performance）:
- 比較優位の可視化（競合手法・材料の比較表）:
- 技術的競争優位性 (Technical Moat):

## 4. 品質規定
- ブラックリスト見出し（# や I. など）の使用禁止。
- 第8章は20件以上のソースを一意の[n]と対応させること。
- 第5章は1,500〜2,500字の密度で記述せよ。
- 言語: 日本語
- 本文の定量・市場データに[n]必須

担当する仮説について、最高品質の詳細レポートを作成してください。`;


// ===== STEP 2-3: 統合フェーズ (Gemini Pro使用) =====
// N個の個別レポートを統合して最終レポートを生成
export const STEP2_3_MERGE_PROMPT = `# 【Step 2-3：統合】戦略的事業仮説ポートフォリオ統合レポート

## 0. 入力データ
- Step 2-1の監査ストリップ: {STEP2_1_OUTPUT}
- 個別仮説レポート（要約済み）: {SUMMARIZED_REPORTS}
- 参考文献候補: {REFERENCES}

## 1. 実行命令
以下の構成で統合レポートを作成してください。各章の内容は個別レポートから抽出・統合し、一貫性のある文章にまとめてください。

## 2. 出力構成（ロック見出し）

【レポートタイトル】
[市場・顧客ニーズ] における [自社技術] を活用した戦略的事業仮説ポートフォリオ (Top {HYPOTHESIS_COUNT} Selection)

【第1章：エグゼクティブサマリー】（600〜1000文字）
- The Shift: 市場の構造的変化
- The Pain: 解決すべき本質的課題
- The Solution: 提案する解決策
- The Value: 創出される価値

【第2章：事業機会を創出する構造的変曲点 (Why Now?)】
技術・市場・規制の変化点を統合

【第3章：戦略的事業仮説ポートフォリオ】
各仮説について以下を記載（各500〜800文字）：
- 仮説タイトル
- ターゲット顧客
- Trade-off（顧客のジレンマ）
- メカニズム（S→P→P）
- 競争優位性

【第4章：ポートフォリオ比較と推奨ロードマップ】
- 仮説間の比較表
- 実行優先順位
- 短期/中期/長期アクション

【第5章：リスク要因と対策】
- 技術リスク
- 市場リスク  
- Plan B

【第6章：参考文献】
（重複除去、番号を振り直し、20件以上）

## 3. 品質規定
- 言語: 日本語
- 定量データ（市場規模、成長率など）を必ず含める
- 本文中の引用[n]と第6章の文献を一意対応させる
- ブラックリスト見出し（# や I. など）の使用禁止`;

// ===== STEP 2-3: 個別レポート要約プロンプト =====
export const STEP2_3_SUMMARIZE_PROMPT = `以下のレポートを800〜1200文字に要約してください。重要な定量データと構造（Structure, Property, Performance）を必ず保持してください。

【入力レポート】
{REPORT}

【出力形式】
### 仮説{HYPOTHESIS_NUMBER}
- タイトル: [仮説タイトル]
- エグゼクティブサマリー: [100文字]
- 市場・顧客: [顧客セグメント、市場規模]
- Trade-off: [顧客のジレンマと素材必然性]
- メカニズム: [Structure→Property→Performance]
- Moat: [競争優位性]
- ロードマップ: [短期/中期/長期]
- リスク: [主要リスクと対策]
- 参考文献: [主要3-5件のURL]

重要：定量データ（市場規模、成長率など）を必ず含めてください。`;

// Default prompts for new installations
export const DEFAULT_STEP2_1_PROMPT = STEP2_1_DEEP_RESEARCH_PROMPT;
export const DEFAULT_STEP2_2_PROMPT = STEP2_2_DEEP_RESEARCH_PROMPT;
export const DEFAULT_STEP2_3_PROMPT = STEP2_3_MERGE_PROMPT;
export const DEFAULT_STEP2_3_SUMMARIZE_PROMPT = STEP2_3_SUMMARIZE_PROMPT;
