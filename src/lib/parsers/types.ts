// Step3の出力形式（8軸スコア）
export interface Step3ParsedData {
  // 判定
  attractiveness: '高' | '中（戦略要修正）' | '低' | null;

  // 8軸スコア（各1-5）
  scores: {
    scientificValidity: number | null; // 科学的妥当性 (20%)
    manufacturingFeasibility: number | null; // 製造実現性 (15%)
    performanceAdvantage: number | null; // 性能優位 (20%)
    grossMargin: number | null; // 粗利率 (20%)
    marketAttractiveness: number | null; // 市場魅力度 (10%)
    regulatorySafety: number | null; // 規制・安全環境 (5%)
    ipProtection: number | null; // 知財防衛 (5%)
    strategicFit: number | null; // 戦略適合 (5%)
  };

  // 加重合計（100点満点）
  weightedTotal: number | null;

  // その他抽出項目
  summary?: string;
  urgency?: string;
  minimumTechLevel?: string;
}

// Step4の出力形式（7軸スコア）
export interface Step4ParsedData {
  // 判定
  attractiveness: '高' | '中（戦略要修正）' | '低' | null;
  entryProbability: '高' | '中' | '低' | null;

  // 7軸スコア（各1-5）
  scores: {
    assetTransferability: number | null; // 資産転用性(AGC視点) (20%)
    investmentRecovery: number | null; // 投資・運転と回収見通し(AGC視点) (20%)
    supplyChainFeasibility: number | null; // サプライチェーン実現性 (15%)
    regulatoryCompliance: number | null; // 規制・安全適合 (15%)
    ftoIpFreedom: number | null; // FTO/知財自由度 (10%)
    channelFit: number | null; // チャネル適合 (10%)
    partnerAvailability: number | null; // パートナー入手性 (10%)
  };

  // 加重合計（100点満点）
  weightedTotal: number | null;

  // その他
  entryMethod?: string;
  competitors?: string[];
  developmentPeriod?: string;
  developmentCost?: string;
  barrierHeight?: '高' | '中' | '低' | null;
}

// パース結果のラッパー
export interface ParseResult<T> {
  success: boolean;
  data: T | null;
  errors: string[];
  rawText: string;
}
