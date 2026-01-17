import type { Step3ParsedData, ParseResult } from './types';

/**
 * Step3の8軸スコアラベルと対応する正規表現パターン
 */
const STEP3_SCORE_PATTERNS = {
  scientificValidity: /科学的妥当性（20％）[：:]\s*[［\[]?(\d)[］\]]?/,
  manufacturingFeasibility: /製造実現性（15％）[：:]\s*[［\[]?(\d)[］\]]?/,
  performanceAdvantage: /性能優位（20％）[：:]\s*[［\[]?(\d)[］\]]?/,
  grossMargin: /粗利率（20％）[：:]\s*[［\[]?(\d)[］\]]?/,
  marketAttractiveness: /市場魅力度（10％）[：:]\s*[［\[]?(\d)[］\]]?/,
  regulatorySafety: /規制・安全環境（5％）[：:]\s*[［\[]?(\d)[］\]]?/,
  ipProtection: /知財防衛（5％）[：:]\s*[［\[]?(\d)[］\]]?/,
  strategicFit: /戦略適合（5％）[：:]\s*[［\[]?(\d)[］\]]?/,
} as const;

/**
 * 魅力度判定の正規表現パターン
 * - 当該テーマの魅力度：高／中（戦略要修正）／低
 */
const ATTRACTIVENESS_PATTERN = /当該テーマの魅力度[：:]\s*(高|中（戦略要修正）|低)/;

/**
 * 加重合計の正規表現パターン
 * - 8項目の加重合計（100点満点）：XX.X
 */
const WEIGHTED_TOTAL_PATTERN = /8項目の加重合計（100点満点）[：:]\s*(\d+(?:\.\d)?)/;

/**
 * 切迫度の正規表現パターン
 */
const URGENCY_PATTERN = /顧客にとっての切迫度[（(][^）)]+[）)][：:]\s*(ぜひ欲しい|あると良い|無くても困らない)/;

/**
 * 最低限達成すべき技術水準の正規表現パターン
 */
const MIN_TECH_LEVEL_PATTERN = /最低限達成すべき技術水準[：:]\s*(.+?)(?:\n|$)/;

/**
 * 総評の正規表現パターン
 */
const SUMMARY_PATTERN = /当該テーマについての総評[：:]\s*(.+?)(?=\n(?:顧客にとっての切迫度|スコア詳細|$))/s;

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
 * 切迫度を抽出
 */
function extractUrgency(text: string): string | undefined {
  const match = text.match(URGENCY_PATTERN);
  return match ? match[1] : undefined;
}

/**
 * 最低限達成すべき技術水準を抽出
 */
function extractMinTechLevel(text: string): string | undefined {
  const match = text.match(MIN_TECH_LEVEL_PATTERN);
  return match ? match[1].trim() : undefined;
}

/**
 * 総評を抽出
 */
function extractSummary(text: string): string | undefined {
  const match = text.match(SUMMARY_PATTERN);
  return match ? match[1].trim() : undefined;
}

/**
 * Step3のテキスト出力をパースして構造化データに変換
 */
export function parseStep3Output(text: string): ParseResult<Step3ParsedData> {
  const errors: string[] = [];

  // 8軸スコアを抽出
  const scores = {
    scientificValidity: extractScore(text, STEP3_SCORE_PATTERNS.scientificValidity),
    manufacturingFeasibility: extractScore(text, STEP3_SCORE_PATTERNS.manufacturingFeasibility),
    performanceAdvantage: extractScore(text, STEP3_SCORE_PATTERNS.performanceAdvantage),
    grossMargin: extractScore(text, STEP3_SCORE_PATTERNS.grossMargin),
    marketAttractiveness: extractScore(text, STEP3_SCORE_PATTERNS.marketAttractiveness),
    regulatorySafety: extractScore(text, STEP3_SCORE_PATTERNS.regulatorySafety),
    ipProtection: extractScore(text, STEP3_SCORE_PATTERNS.ipProtection),
    strategicFit: extractScore(text, STEP3_SCORE_PATTERNS.strategicFit),
  };

  // 欠損スコアをエラーに追加
  const scoreLabels: Record<keyof typeof scores, string> = {
    scientificValidity: '科学的妥当性',
    manufacturingFeasibility: '製造実現性',
    performanceAdvantage: '性能優位',
    grossMargin: '粗利率',
    marketAttractiveness: '市場魅力度',
    regulatorySafety: '規制・安全環境',
    ipProtection: '知財防衛',
    strategicFit: '戦略適合',
  };

  for (const [key, label] of Object.entries(scoreLabels)) {
    if (scores[key as keyof typeof scores] === null) {
      errors.push(`${label}のスコアを抽出できませんでした`);
    }
  }

  // 魅力度判定を抽出
  const attractiveness = extractAttractiveness(text);
  if (attractiveness === null) {
    errors.push('当該テーマの魅力度を抽出できませんでした');
  }

  // 加重合計を抽出
  const weightedTotal = extractWeightedTotal(text);
  if (weightedTotal === null) {
    errors.push('8項目の加重合計を抽出できませんでした');
  }

  // その他項目を抽出
  const urgency = extractUrgency(text);
  const minimumTechLevel = extractMinTechLevel(text);
  const summary = extractSummary(text);

  const data: Step3ParsedData = {
    attractiveness,
    scores,
    weightedTotal,
    urgency,
    minimumTechLevel,
    summary,
  };

  return {
    success: errors.length === 0,
    data,
    errors,
    rawText: text,
  };
}

/**
 * Step3スコアから加重合計を計算（検証用）
 * 式: round( (20×科学的妥当性 + 15×製造実現性 + 20×性能優位 + 20×粗利率 + 10×市場魅力度 + 5×規制・安全環境 + 5×知財防衛 + 5×戦略適合) / 5 , 1 )
 */
export function calculateStep3WeightedTotal(
  scores: Step3ParsedData['scores']
): number | null {
  const {
    scientificValidity,
    manufacturingFeasibility,
    performanceAdvantage,
    grossMargin,
    marketAttractiveness,
    regulatorySafety,
    ipProtection,
    strategicFit,
  } = scores;

  // すべてのスコアが必要
  if (
    scientificValidity === null ||
    manufacturingFeasibility === null ||
    performanceAdvantage === null ||
    grossMargin === null ||
    marketAttractiveness === null ||
    regulatorySafety === null ||
    ipProtection === null ||
    strategicFit === null
  ) {
    return null;
  }

  const weighted =
    20 * scientificValidity +
    15 * manufacturingFeasibility +
    20 * performanceAdvantage +
    20 * grossMargin +
    10 * marketAttractiveness +
    5 * regulatorySafety +
    5 * ipProtection +
    5 * strategicFit;

  return Math.round((weighted / 5) * 10) / 10;
}
