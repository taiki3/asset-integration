-- ============================================
-- E2E Test Seed Data
-- ============================================

-- Test user ID (mock auth user)
-- This matches the mock auth user ID used in NEXT_PUBLIC_MOCK_AUTH=true mode

-- Insert test project
-- user_id must match mock-user-001 from src/lib/auth/mock.ts
INSERT INTO projects (id, name, description, user_id, created_at)
VALUES
  (1, 'E2E Test Project', 'A project for E2E testing', 'mock-user-001', NOW()),
  (2, 'Sample Innovation Project', 'Sample project with completed data', 'mock-user-001', NOW());

-- Reset sequence
SELECT setval('projects_id_seq', 10);

-- Insert test resources for project 1
INSERT INTO resources (id, project_id, type, name, content, created_at)
VALUES
  (1, 1, 'target_spec', 'テスト市場仕様', '## ターゲット市場
- 市場規模: 1000億円
- 成長率: 年率15%
- 主要顧客: 製造業、自動車産業

## 顧客ニーズ
- 軽量化
- コスト削減
- 環境対応', NOW()),
  (2, 1, 'technical_assets', 'テスト技術資産', '## 技術資産一覧

### コア技術
- 高機能セラミックス製造技術
- 独自のコーティング技術
- ナノ材料合成技術

### 製造能力
- 年間生産能力: 10,000トン
- 品質管理: ISO 9001認証', NOW());

-- Reset sequence
SELECT setval('resources_id_seq', 10);

-- Insert a completed run for project 2
INSERT INTO runs (id, project_id, target_spec_id, technical_assets_id, job_name, hypothesis_count, status, current_step, created_at, completed_at)
VALUES
  (1, 2, 1, 2, 'サンプル分析', 3, 'completed', 5, NOW() - INTERVAL '1 day', NOW());

-- Reset sequence
SELECT setval('runs_id_seq', 10);

-- Insert sample hypotheses with full content for Word export testing
INSERT INTO hypotheses (uuid, project_id, run_id, hypothesis_number, index_in_run, display_title, processing_status, step2_1_summary, step2_2_output, step3_output, step4_output, step5_output, created_at)
VALUES
  ('e2e-hypo-001', 2, 1, 1, 0, '電気自動車向け軽量バッテリーケース', 'completed',
   '電気自動車市場の急成長に伴い、バッテリーケースの軽量化ニーズが高まっています。当社のセラミックス技術を活用することで、従来のアルミ製ケースより30%軽量化が可能です。',
   '## 詳細調査結果

### 市場動向
- EV市場は2030年までに年平均20%成長が予測される
- バッテリーケースの軽量化は航続距離延長に直結

### 技術的検討
- セラミックス複合材料の採用により軽量化と強度を両立
- 熱伝導性の最適化が課題

### 競合状況
| 企業 | 技術 | 市場シェア |
|------|------|-----------|
| A社 | アルミ | 40% |
| B社 | カーボン | 25% |
| 当社 | セラミックス | 対象 |',
   '## テーマ魅力度評価

**総合判定: A（有望）**

### 評価軸スコア
- 革新性 (I): 4.2/5
- 市場性 (M): 4.5/5
- 実現可能性 (C): 3.8/5
- 優位性 (L): 4.0/5

### 総合スコア: 4.13',
   '## AGC参入検討

### 参入魅力度: High

#### 7軸評価
1. 市場規模: 1,500億円（2030年予測）
2. 成長性: 年率18%
3. 競争優位性: 中〜高
4. 差別化可能性: 高
5. シナジー: 高（既存顧客基盤活用）
6. 実現可能性: 中
7. 戦略適合性: 高',
   '## 統合評価

### 最終判定
**推奨度: ★★★★☆**

本テーマは当社の技術資産を活かしつつ、成長市場への参入機会を提供する有望案件である。', NOW()),
  ('e2e-hypo-002', 2, 1, 2, 1, '半導体製造装置向け高純度部材', 'completed',
   '半導体微細化の進展により、製造装置の高純度化要求が厳しくなっています。当社のナノ材料技術を応用した高純度セラミックス部材で、パーティクル発生を90%削減できます。',
   '## 詳細調査

半導体製造における高純度部材の需要は増加傾向にある。',
   '## 技術評価

総合スコア: 3.9/5',
   '## 参入魅力度

中〜高の参入魅力度',
   '## 統合評価

継続検討を推奨', NOW()),
  ('e2e-hypo-003', 2, 1, 3, 2, '医療機器向け生体適合性材料', 'completed',
   '高齢化社会の進展に伴い、医療機器市場は拡大を続けています。当社のコーティング技術を医療機器に応用することで、生体適合性と耐久性を両立した製品を提供できます。',
   NULL, NULL, NULL, NULL, NOW());

-- Reset sequence
SELECT setval('hypotheses_id_seq', 10);

-- Insert test prompt versions
INSERT INTO prompt_versions (id, step_number, version, content, is_active, created_at)
VALUES
  (1, 21, 1, 'Test prompt for Step 2-1 version 1', false, NOW() - INTERVAL '2 days'),
  (2, 21, 2, 'Test prompt for Step 2-1 version 2 - active', true, NOW() - INTERVAL '1 day');

-- Reset sequence
SELECT setval('prompt_versions_id_seq', 10);

-- Grant all privileges to postgres user for E2E testing
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
