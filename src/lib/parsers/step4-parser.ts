import type { Step4ParsedData, ParseResult } from './types';

/**
 * Step4の7軸スコアラベルと対応する正規表現パターン
 */
const STEP4_SCORE_PATTERNS = {
  assetTransferability: /資産転用性（AGC視点）（20％）[：:]\s*[［\[]?(\d)[］\]]?/,
  investmentRecovery: /投資・運転と回収見通し（AGC視点）（20％）[：:]\s*[［\[]?(\d)[］\]]?/,
  supplyChainFeasibility: /サプライチェーン実現性（AGC視点）（15％）[：:]\s*[［\[]?(\d)[］\]]?/,
  regulatoryCompliance: /規制・安全適合（AGC視点）（15％）[：:]\s*[［\[]?(\d)[］\]]?/,
  ftoIpFreedom: /FTO／知財自由度（AGC視点）（10％）[：:]\s*[［\[]?(\d)[］\]]?/,
  channelFit: /チャネル適合（AGC視点）（10％）[：:]\s*[［\[]?(\d)[］\]]?/,
  partnerAvailability: /パートナー入手性（AGC視点）（10％）[：:]\s*[［\[]?(\d)[］\]]?/,
} as const;

/**
 * AGCの事業価値×参入確率に基づく魅力度の正規表現パターン
 */
const ATTRACTIVENESS_PATTERN =
  /AGCの事業価値×参入確率に基づく魅力度[：:]\s*(高|中（戦略要修正）|低)/;

/**
 * AGCの参入確率の正規表現パターン
 */
const ENTRY_PROBABILITY_PATTERN = /AGCの参入確率[：:]\s*(高|中|低)/;

/**
 * 加重合計の正規表現パターン
 * - 7項目の加重合計（100点満点）：XX.X
 */
const WEIGHTED_TOTAL_PATTERN = /7項目の加重合計（100点満点）[：:]\s*(\d+(?:\.\d)?)/;

/**
 * AGCの参入方式の正規表現パターン
 */
const ENTRY_METHOD_PATTERN =
  /AGCの参入方式[：:]\s*(自社開発（内製）|共同推進（パートナー連携）|外部調達（買収・ライセンス・OEM）)(?:（([^）]+)）)?/;

/**
 * 想定競合の正規表現パターン
 */
const COMPETITORS_PATTERN = /想定競合[：:]\s*(.+?)(?:\n|$)/;

/**
 * AGCの開発期間の正規表現パターン
 */
const DEV_PERIOD_PATTERN = /AGCの開発期間[：:]\s*(.+?)(?:\n|$)/;

/**
 * AGCの開発コストの正規表現パターン
 */
const DEV_COST_PATTERN = /AGCの開発コスト[：:]\s*(.+?)(?:\n|$)/;

/**
 * 業界の参入障壁高さの正規表現パターン
 */
const BARRIER_HEIGHT_PATTERN = /業界の参入障壁高さ[：:]\s*(高|中|低)/;

/**
 * スコア値を抽出してバリデーション（1-5の整数）
 */
function extractScore(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  if (!match) return null;

  const score = parseInt(match[1], 10);
  if (score >= 1 && score <= 5) {
    return score;
  }
  return null;
}

/**
 * 魅力度判定を抽出
 */
function extractAttractiveness(
  text: string
): '高' | '中（戦略要修正）' | '低' | null {
  const match = text.match(ATTRACTIVENESS_PATTERN);
  if (!match) return null;

  const value = match[1];
  if (value === '高' || value === '中（戦略要修正）' || value === '低') {
    return value;
  }
  return null;
}

/**
 * 参入確率を抽出
 */
function extractEntryProbability(text: string): '高' | '中' | '低' | null {
  const match = text.match(ENTRY_PROBABILITY_PATTERN);
  if (!match) return null;

  const value = match[1];
  if (value === '高' || value === '中' || value === '低') {
    return value;
  }
  return null;
}

/**
 * 加重合計を抽出
 */
function extractWeightedTotal(text: string): number | null {
  const match = text.match(WEIGHTED_TOTAL_PATTERN);
  if (!match) return null;

  const value = parseFloat(match[1]);
  if (!isNaN(value) && value >= 0 && value <= 100) {
    return value;
  }
  return null;
}

/**
 * 参入方式を抽出
 */
function extractEntryMethod(text: string): string | undefined {
  const match = text.match(ENTRY_METHOD_PATTERN);
  if (!match) return undefined;

  // ラベル（理由）形式で返す
  if (match[2]) {
    return `${match[1]}（${match[2]}）`;
  }
  return match[1];
}

/**
 * 想定競合を抽出（、区切りで配列化）
 */
function extractCompetitors(text: string): string[] | undefined {
  const match = text.match(COMPETITORS_PATTERN);
  if (!match) return undefined;

  const competitorsStr = match[1].trim();
  if (!competitorsStr) return undefined;

  // 「、」または「,」で分割
  return competitorsStr
    .split(/[、,]/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/**
 * 開発期間を抽出
 */
function extractDevPeriod(text: string): string | undefined {
  const match = text.match(DEV_PERIOD_PATTERN);
  return match ? match[1].trim() : undefined;
}

/**
 * 開発コストを抽出
 */
function extractDevCost(text: string): string | undefined {
  const match = text.match(DEV_COST_PATTERN);
  return match ? match[1].trim() : undefined;
}

/**
 * 業界の参入障壁高さを抽出
 */
function extractBarrierHeight(text: string): '高' | '中' | '低' | null {
  const match = text.match(BARRIER_HEIGHT_PATTERN);
  if (!match) return null;

  const value = match[1];
  if (value === '高' || value === '中' || value === '低') {
    return value;
  }
  return null;
}

/**
 * Step4のテキスト出力をパースして構造化データに変換
 */
export function parseStep4Output(text: string): ParseResult<Step4ParsedData> {
  const errors: string[] = [];

  // 7軸スコアを抽出
  const scores = {
    assetTransferability: extractScore(text, STEP4_SCORE_PATTERNS.assetTransferability),
    investmentRecovery: extractScore(text, STEP4_SCORE_PATTERNS.investmentRecovery),
    supplyChainFeasibility: extractScore(text, STEP4_SCORE_PATTERNS.supplyChainFeasibility),
    regulatoryCompliance: extractScore(text, STEP4_SCORE_PATTERNS.regulatoryCompliance),
    ftoIpFreedom: extractScore(text, STEP4_SCORE_PATTERNS.ftoIpFreedom),
    channelFit: extractScore(text, STEP4_SCORE_PATTERNS.channelFit),
    partnerAvailability: extractScore(text, STEP4_SCORE_PATTERNS.partnerAvailability),
  };

  // 欠損スコアをエラーに追加
  const scoreLabels: Record<keyof typeof scores, string> = {
    assetTransferability: '資産転用性（AGC視点）',
    investmentRecovery: '投資・運転と回収見通し（AGC視点）',
    supplyChainFeasibility: 'サプライチェーン実現性（AGC視点）',
    regulatoryCompliance: '規制・安全適合（AGC視点）',
    ftoIpFreedom: 'FTO／知財自由度（AGC視点）',
    channelFit: 'チャネル適合（AGC視点）',
    partnerAvailability: 'パートナー入手性（AGC視点）',
  };

  for (const [key, label] of Object.entries(scoreLabels)) {
    if (scores[key as keyof typeof scores] === null) {
      errors.push(`${label}のスコアを抽出できませんでした`);
    }
  }

  // 魅力度判定を抽出
  const attractiveness = extractAttractiveness(text);
  if (attractiveness === null) {
    errors.push('AGCの事業価値×参入確率に基づく魅力度を抽出できませんでした');
  }

  // 参入確率を抽出
  const entryProbability = extractEntryProbability(text);
  if (entryProbability === null) {
    errors.push('AGCの参入確率を抽出できませんでした');
  }

  // 加重合計を抽出
  const weightedTotal = extractWeightedTotal(text);
  if (weightedTotal === null) {
    errors.push('7項目の加重合計を抽出できませんでした');
  }

  // その他項目を抽出
  const entryMethod = extractEntryMethod(text);
  const competitors = extractCompetitors(text);
  const developmentPeriod = extractDevPeriod(text);
  const developmentCost = extractDevCost(text);
  const barrierHeight = extractBarrierHeight(text);

  const data: Step4ParsedData = {
    attractiveness,
    entryProbability,
    scores,
    weightedTotal,
    entryMethod,
    competitors,
    developmentPeriod,
    developmentCost,
    barrierHeight,
  };

  return {
    success: errors.length === 0,
    data,
    errors,
    rawText: text,
  };
}

/**
 * Step4スコアから加重合計を計算（検証用）
 * 式: round( (20×資産転用性 + 20×投資・運転と回収見通し(AGC視点) + 15×サプライチェーン実現性 + 15×規制・安全適合 + 10×FTO/知財自由度 + 10×チャネル適合 + 10×パートナー入手性) / 5 , 1 )
 */
export function calculateStep4WeightedTotal(
  scores: Step4ParsedData['scores']
): number | null {
  const {
    assetTransferability,
    investmentRecovery,
    supplyChainFeasibility,
    regulatoryCompliance,
    ftoIpFreedom,
    channelFit,
    partnerAvailability,
  } = scores;

  // すべてのスコアが必要
  if (
    assetTransferability === null ||
    investmentRecovery === null ||
    supplyChainFeasibility === null ||
    regulatoryCompliance === null ||
    ftoIpFreedom === null ||
    channelFit === null ||
    partnerAvailability === null
  ) {
    return null;
  }

  const weighted =
    20 * assetTransferability +
    20 * investmentRecovery +
    15 * supplyChainFeasibility +
    15 * regulatoryCompliance +
    10 * ftoIpFreedom +
    10 * channelFit +
    10 * partnerAvailability;

  return Math.round((weighted / 5) * 10) / 10;
}
