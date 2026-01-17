import { describe, it, expect } from 'vitest';
import {
  parseStep3Output,
  calculateStep3WeightedTotal,
  parseStep4Output,
  calculateStep4WeightedTotal,
} from './index';

describe('Step3 Parser', () => {
  describe('parseStep3Output', () => {
    it('parses complete Step3 output correctly', () => {
      const input = `
仮説タイトル：高熱伝導性セラミックス複合材料

- 当該テーマの魅力度：高
- 最低限達成すべき技術水準：熱伝導率50W/mK以上、電気絶縁性1014オーム・cm以上
- 8項目の加重合計（100点満点）：78.0
- 当該テーマについての総評：本仮説は高い技術的妥当性と市場ニーズの合致を示している。

顧客にとっての切迫度（課題解決の不可避性；ソリューション不問）：ぜひ欲しい

スコア詳細（8軸）
- 科学的妥当性（20％）：4
- 理由: 熱伝導メカニズムは物理的に確立されている。
- 製造実現性（15％）：3
- 理由: 量産化には追加の設備投資が必要。
- 性能優位（20％）：5
- 理由: 競合製品と比較して明確な性能優位がある。
- 粗利率（20％）：4
- 理由: 原価率35%以下で粗利率40%以上を確保可能。
- 市場魅力度（10％）：4
- 理由: 半導体市場の成長に伴い需要増加が見込まれる。
- 規制・安全環境（5％）：4
- 理由: 主要な規制障壁はない。
- 知財防衛（5％）：3
- 理由: 基本特許は取得可能だが競合の特許網に注意が必要。
- 戦略適合（5％）：4
- 理由: 既存のセラミック事業との親和性が高い。
`;

      const result = parseStep3Output(input);

      expect(result.success).toBe(true);
      expect(result.data).not.toBeNull();
      expect(result.data!.attractiveness).toBe('高');
      expect(result.data!.weightedTotal).toBe(78.0);
      expect(result.data!.urgency).toBe('ぜひ欲しい');
      expect(result.data!.minimumTechLevel).toContain('熱伝導率50W/mK以上');

      // スコア検証
      expect(result.data!.scores.scientificValidity).toBe(4);
      expect(result.data!.scores.manufacturingFeasibility).toBe(3);
      expect(result.data!.scores.performanceAdvantage).toBe(5);
      expect(result.data!.scores.grossMargin).toBe(4);
      expect(result.data!.scores.marketAttractiveness).toBe(4);
      expect(result.data!.scores.regulatorySafety).toBe(4);
      expect(result.data!.scores.ipProtection).toBe(3);
      expect(result.data!.scores.strategicFit).toBe(4);
    });

    it('parses attractiveness "中（戦略要修正）"', () => {
      const input = `
- 当該テーマの魅力度：中（戦略要修正）
- 8項目の加重合計（100点満点）：65.0
- 科学的妥当性（20％）：3
- 製造実現性（15％）：3
- 性能優位（20％）：3
- 粗利率（20％）：3
- 市場魅力度（10％）：3
- 規制・安全環境（5％）：3
- 知財防衛（5％）：3
- 戦略適合（5％）：3
`;

      const result = parseStep3Output(input);

      expect(result.data!.attractiveness).toBe('中（戦略要修正）');
    });

    it('parses attractiveness "低"', () => {
      const input = `
- 当該テーマの魅力度：低
- 8項目の加重合計（100点満点）：40.0
- 科学的妥当性（20％）：2
- 製造実現性（15％）：2
- 性能優位（20％）：2
- 粗利率（20％）：2
- 市場魅力度（10％）：2
- 規制・安全環境（5％）：2
- 知財防衛（5％）：2
- 戦略適合（5％）：2
`;

      const result = parseStep3Output(input);

      expect(result.data!.attractiveness).toBe('低');
    });

    it('handles bracket notation for scores [1-5]', () => {
      const input = `
- 当該テーマの魅力度：高
- 8項目の加重合計（100点満点）：80.0
- 科学的妥当性（20％）：［4］
- 製造実現性（15％）：[3]
- 性能優位（20％）：5
- 粗利率（20％）：4
- 市場魅力度（10％）：4
- 規制・安全環境（5％）：4
- 知財防衛（5％）：3
- 戦略適合（5％）：4
`;

      const result = parseStep3Output(input);

      expect(result.data!.scores.scientificValidity).toBe(4);
      expect(result.data!.scores.manufacturingFeasibility).toBe(3);
    });

    it('returns errors for missing scores', () => {
      const input = `
- 当該テーマの魅力度：高
- 科学的妥当性（20％）：4
`;

      const result = parseStep3Output(input);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain('製造実現性のスコアを抽出できませんでした');
    });

    it('returns error for missing attractiveness', () => {
      const input = `
- 8項目の加重合計（100点満点）：80.0
- 科学的妥当性（20％）：4
`;

      const result = parseStep3Output(input);

      expect(result.errors).toContain('当該テーマの魅力度を抽出できませんでした');
    });
  });

  describe('calculateStep3WeightedTotal', () => {
    it('calculates weighted total correctly', () => {
      const scores = {
        scientificValidity: 4,
        manufacturingFeasibility: 3,
        performanceAdvantage: 5,
        grossMargin: 4,
        marketAttractiveness: 4,
        regulatorySafety: 4,
        ipProtection: 3,
        strategicFit: 4,
      };

      // (20*4 + 15*3 + 20*5 + 20*4 + 10*4 + 5*4 + 5*3 + 5*4) / 5
      // = (80 + 45 + 100 + 80 + 40 + 20 + 15 + 20) / 5
      // = 400 / 5 = 80.0
      const result = calculateStep3WeightedTotal(scores);
      expect(result).toBe(80.0);
    });

    it('calculates with all 5s', () => {
      const scores = {
        scientificValidity: 5,
        manufacturingFeasibility: 5,
        performanceAdvantage: 5,
        grossMargin: 5,
        marketAttractiveness: 5,
        regulatorySafety: 5,
        ipProtection: 5,
        strategicFit: 5,
      };

      // (20*5 + 15*5 + 20*5 + 20*5 + 10*5 + 5*5 + 5*5 + 5*5) / 5
      // = (100 + 75 + 100 + 100 + 50 + 25 + 25 + 25) / 5
      // = 500 / 5 = 100.0
      const result = calculateStep3WeightedTotal(scores);
      expect(result).toBe(100.0);
    });

    it('calculates with all 1s', () => {
      const scores = {
        scientificValidity: 1,
        manufacturingFeasibility: 1,
        performanceAdvantage: 1,
        grossMargin: 1,
        marketAttractiveness: 1,
        regulatorySafety: 1,
        ipProtection: 1,
        strategicFit: 1,
      };

      // (20*1 + 15*1 + 20*1 + 20*1 + 10*1 + 5*1 + 5*1 + 5*1) / 5
      // = 100 / 5 = 20.0
      const result = calculateStep3WeightedTotal(scores);
      expect(result).toBe(20.0);
    });

    it('returns null if any score is null', () => {
      const scores = {
        scientificValidity: 4,
        manufacturingFeasibility: null,
        performanceAdvantage: 5,
        grossMargin: 4,
        marketAttractiveness: 4,
        regulatorySafety: 4,
        ipProtection: 3,
        strategicFit: 4,
      };

      const result = calculateStep3WeightedTotal(scores);
      expect(result).toBeNull();
    });
  });
});

describe('Step4 Parser', () => {
  describe('parseStep4Output', () => {
    it('parses complete Step4 output correctly', () => {
      const input = `
仮説タイトル：高熱伝導性セラミックス複合材料

- AGCの事業価値×参入確率に基づく魅力度：高
- AGCの参入方式：共同推進（パートナー連携）（装置メーカーとの協業により市場投入を加速）
- AGCの参入確率：高
- AGCとしての結論：本仮説はAGCのセラミック技術を活用可能であり、参入障壁も低い。
- 業界の参入障壁高さ：低
- AGCの技術段階（1〜9）：TRL6=プロトタイプ完成
- 想定競合：京セラ、村田製作所、TDK
- AGCの開発期間：18-24ヶ月
- AGCの開発コスト：20-50億円
- 7項目の加重合計（100点満点）：82.0

スコア詳細（7軸＝「7項目の加重合計（100点満点）」の構成）
- 資産転用性（AGC視点）（20％）：4
- 理由: 既存設備の60%を転用可能。
- 投資・運転と回収見通し（AGC視点）（20％）：4
- 理由: 24ヶ月以内での回収見通し。
- サプライチェーン実現性（AGC視点）（15％）：4
- 理由: 主要原材料の調達ルートは確立済み。
- 規制・安全適合（AGC視点）（15％）：5
- 理由: 主要な規制対応は完了。
- FTO／知財自由度（AGC視点）（10％）：3
- 理由: 一部特許に注意が必要だが回避可能。
- チャネル適合（AGC視点）（10％）：4
- 理由: 既存顧客への横展開が可能。
- パートナー入手性（AGC視点）（10％）：4
- 理由: 有力パートナー候補が複数存在。
`;

      const result = parseStep4Output(input);

      expect(result.success).toBe(true);
      expect(result.data).not.toBeNull();
      expect(result.data!.attractiveness).toBe('高');
      expect(result.data!.entryProbability).toBe('高');
      expect(result.data!.weightedTotal).toBe(82.0);
      expect(result.data!.entryMethod).toContain('共同推進（パートナー連携）');
      expect(result.data!.competitors).toEqual(['京セラ', '村田製作所', 'TDK']);
      expect(result.data!.developmentPeriod).toBe('18-24ヶ月');
      expect(result.data!.developmentCost).toBe('20-50億円');
      expect(result.data!.barrierHeight).toBe('低');

      // スコア検証
      expect(result.data!.scores.assetTransferability).toBe(4);
      expect(result.data!.scores.investmentRecovery).toBe(4);
      expect(result.data!.scores.supplyChainFeasibility).toBe(4);
      expect(result.data!.scores.regulatoryCompliance).toBe(5);
      expect(result.data!.scores.ftoIpFreedom).toBe(3);
      expect(result.data!.scores.channelFit).toBe(4);
      expect(result.data!.scores.partnerAvailability).toBe(4);
    });

    it('parses attractiveness "中（戦略要修正）"', () => {
      const input = `
- AGCの事業価値×参入確率に基づく魅力度：中（戦略要修正）
- AGCの参入確率：中
- 7項目の加重合計（100点満点）：65.0
- 資産転用性（AGC視点）（20％）：3
- 投資・運転と回収見通し（AGC視点）（20％）：3
- サプライチェーン実現性（AGC視点）（15％）：3
- 規制・安全適合（AGC視点）（15％）：3
- FTO／知財自由度（AGC視点）（10％）：3
- チャネル適合（AGC視点）（10％）：3
- パートナー入手性（AGC視点）（10％）：3
`;

      const result = parseStep4Output(input);

      expect(result.data!.attractiveness).toBe('中（戦略要修正）');
      expect(result.data!.entryProbability).toBe('中');
    });

    it('parses attractiveness "低" and entry probability "低"', () => {
      const input = `
- AGCの事業価値×参入確率に基づく魅力度：低
- AGCの参入確率：低
- 7項目の加重合計（100点満点）：40.0
- 資産転用性（AGC視点）（20％）：2
- 投資・運転と回収見通し（AGC視点）（20％）：2
- サプライチェーン実現性（AGC視点）（15％）：2
- 規制・安全適合（AGC視点）（15％）：2
- FTO／知財自由度（AGC視点）（10％）：2
- チャネル適合（AGC視点）（10％）：2
- パートナー入手性（AGC視点）（10％）：2
`;

      const result = parseStep4Output(input);

      expect(result.data!.attractiveness).toBe('低');
      expect(result.data!.entryProbability).toBe('低');
    });

    it('handles bracket notation for scores', () => {
      const input = `
- AGCの事業価値×参入確率に基づく魅力度：高
- AGCの参入確率：高
- 7項目の加重合計（100点満点）：80.0
- 資産転用性（AGC視点）（20％）：［4］
- 投資・運転と回収見通し（AGC視点）（20％）：[4]
- サプライチェーン実現性（AGC視点）（15％）：4
- 規制・安全適合（AGC視点）（15％）：4
- FTO／知財自由度（AGC視点）（10％）：4
- チャネル適合（AGC視点）（10％）：4
- パートナー入手性（AGC視点）（10％）：4
`;

      const result = parseStep4Output(input);

      expect(result.data!.scores.assetTransferability).toBe(4);
      expect(result.data!.scores.investmentRecovery).toBe(4);
    });

    it('returns errors for missing scores', () => {
      const input = `
- AGCの事業価値×参入確率に基づく魅力度：高
- AGCの参入確率：高
- 資産転用性（AGC視点）（20％）：4
`;

      const result = parseStep4Output(input);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain(
        '投資・運転と回収見通し（AGC視点）のスコアを抽出できませんでした'
      );
    });

    it('parses competitors with various delimiters', () => {
      const input1 = `- 想定競合：京セラ、村田製作所、TDK`;
      const input2 = `- 想定競合：京セラ,村田製作所,TDK`;

      const result1 = parseStep4Output(input1 + `
- AGCの事業価値×参入確率に基づく魅力度：高
- AGCの参入確率：高
- 7項目の加重合計（100点満点）：80.0
- 資産転用性（AGC視点）（20％）：4
- 投資・運転と回収見通し（AGC視点）（20％）：4
- サプライチェーン実現性（AGC視点）（15％）：4
- 規制・安全適合（AGC視点）（15％）：4
- FTO／知財自由度（AGC視点）（10％）：4
- チャネル適合（AGC視点）（10％）：4
- パートナー入手性（AGC視点）（10％）：4
`);
      const result2 = parseStep4Output(input2 + `
- AGCの事業価値×参入確率に基づく魅力度：高
- AGCの参入確率：高
- 7項目の加重合計（100点満点）：80.0
- 資産転用性（AGC視点）（20％）：4
- 投資・運転と回収見通し（AGC視点）（20％）：4
- サプライチェーン実現性（AGC視点）（15％）：4
- 規制・安全適合（AGC視点）（15％）：4
- FTO／知財自由度（AGC視点）（10％）：4
- チャネル適合（AGC視点）（10％）：4
- パートナー入手性（AGC視点）（10％）：4
`);

      expect(result1.data!.competitors).toEqual(['京セラ', '村田製作所', 'TDK']);
      expect(result2.data!.competitors).toEqual(['京セラ', '村田製作所', 'TDK']);
    });
  });

  describe('calculateStep4WeightedTotal', () => {
    it('calculates weighted total correctly', () => {
      const scores = {
        assetTransferability: 4,
        investmentRecovery: 4,
        supplyChainFeasibility: 4,
        regulatoryCompliance: 5,
        ftoIpFreedom: 3,
        channelFit: 4,
        partnerAvailability: 4,
      };

      // (20*4 + 20*4 + 15*4 + 15*5 + 10*3 + 10*4 + 10*4) / 5
      // = (80 + 80 + 60 + 75 + 30 + 40 + 40) / 5
      // = 405 / 5 = 81.0
      const result = calculateStep4WeightedTotal(scores);
      expect(result).toBe(81.0);
    });

    it('calculates with all 5s', () => {
      const scores = {
        assetTransferability: 5,
        investmentRecovery: 5,
        supplyChainFeasibility: 5,
        regulatoryCompliance: 5,
        ftoIpFreedom: 5,
        channelFit: 5,
        partnerAvailability: 5,
      };

      // (20*5 + 20*5 + 15*5 + 15*5 + 10*5 + 10*5 + 10*5) / 5
      // = (100 + 100 + 75 + 75 + 50 + 50 + 50) / 5
      // = 500 / 5 = 100.0
      const result = calculateStep4WeightedTotal(scores);
      expect(result).toBe(100.0);
    });

    it('calculates with all 1s', () => {
      const scores = {
        assetTransferability: 1,
        investmentRecovery: 1,
        supplyChainFeasibility: 1,
        regulatoryCompliance: 1,
        ftoIpFreedom: 1,
        channelFit: 1,
        partnerAvailability: 1,
      };

      // (20*1 + 20*1 + 15*1 + 15*1 + 10*1 + 10*1 + 10*1) / 5
      // = 100 / 5 = 20.0
      const result = calculateStep4WeightedTotal(scores);
      expect(result).toBe(20.0);
    });

    it('returns null if any score is null', () => {
      const scores = {
        assetTransferability: 4,
        investmentRecovery: null,
        supplyChainFeasibility: 4,
        regulatoryCompliance: 5,
        ftoIpFreedom: 3,
        channelFit: 4,
        partnerAvailability: 4,
      };

      const result = calculateStep4WeightedTotal(scores);
      expect(result).toBeNull();
    });
  });
});
