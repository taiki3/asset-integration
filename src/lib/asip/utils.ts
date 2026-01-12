/**
 * ASIP Pipeline Utility Functions
 * Pure functions extracted for testability
 */

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Parsed hypothesis structure
 */
export interface ParsedHypothesis {
  title: string;
  summary: string;
}

/**
 * Parse hypotheses from Step 2-1 output text
 * Uses multiple strategies to extract structured hypotheses
 */
export function parseHypothesesFromOutput(output: string): ParsedHypothesis[] {
  const results: ParsedHypothesis[] = [];

  // Strategy 1: 【仮説N】 pattern
  const pattern1 = /【仮説(\d+)】\s*([^\n]+)([\s\S]*?)(?=【仮説\d+】|$)/g;
  let match;

  while ((match = pattern1.exec(output)) !== null) {
    const title = match[2].trim();
    const summary = match[3].trim().slice(0, 2000);
    if (title && title.length > 0) {
      results.push({ title, summary });
    }
  }

  // Strategy 2: Markdown headers ### 仮説 N or ## 仮説N
  if (results.length === 0) {
    const pattern2 = /#{2,3}\s*仮説\s*(\d+)[：:]*\s*([^\n]+)([\s\S]*?)(?=#{2,3}\s*仮説|$)/g;
    while ((match = pattern2.exec(output)) !== null) {
      const title = match[2].trim();
      const summary = match[3].trim().slice(0, 2000);
      if (title && title.length > 0) {
        results.push({ title, summary });
      }
    }
  }

  // Strategy 3: Numbered patterns (1. or 1)
  if (results.length === 0) {
    const pattern3 = /(?:^|\n)(\d+)[.）)]\s*(?:\*\*)?([^\n*]+)(?:\*\*)?([\s\S]*?)(?=(?:^|\n)\d+[.）)]|$)/gm;
    while ((match = pattern3.exec(output)) !== null) {
      const title = match[2].trim();
      const summary = match[3].trim().slice(0, 2000);
      if (title && title.length > 5 && title.length < 200) {
        results.push({ title, summary });
      }
    }
  }

  // Remove duplicates by title
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract JSON from a string that may contain other text
 * Useful for parsing AI responses that include JSON
 */
export function extractJsonFromResponse<T>(
  response: string,
  validator: (data: unknown) => data is T
): T | null {
  // Try to find JSON object with "hypotheses" key
  const jsonMatch = response.match(/\{[\s\S]*"hypotheses"[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (validator(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Type guard for hypothesis JSON response
 */
export interface HypothesesResponse {
  hypotheses: Array<{ title: string; summary: string }>;
}

export function isHypothesesResponse(data: unknown): data is HypothesesResponse {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.hypotheses)) return false;
  return obj.hypotheses.every(
    (h: unknown) =>
      h &&
      typeof h === 'object' &&
      typeof (h as Record<string, unknown>).title === 'string' &&
      typeof (h as Record<string, unknown>).summary === 'string'
  );
}

/**
 * Validate and clean hypothesis data
 */
export function validateAndCleanHypotheses(
  hypotheses: Array<{ title?: string; summary?: string }>
): ParsedHypothesis[] {
  return hypotheses
    .filter(
      (h): h is { title: string; summary: string } =>
        typeof h.title === 'string' &&
        typeof h.summary === 'string' &&
        h.title.length > 0
    )
    .map((h) => ({
      title: h.title.trim().slice(0, 100),
      summary: h.summary.trim().slice(0, 2000),
    }));
}

/**
 * Build context string for hypothesis evaluation
 */
export function buildHypothesisContext(params: {
  displayTitle: string | null;
  uuid: string;
  step2_1Summary?: string | null;
  step2_2Output?: string | null;
  targetSpecContent: string;
  technicalAssetsContent: string;
}): string {
  const { displayTitle, uuid, step2_1Summary, step2_2Output, targetSpecContent, technicalAssetsContent } = params;

  return `
=== 仮説情報 ===
タイトル: ${displayTitle || ''}
UUID: ${uuid}

=== 仮説概要 (Step 2-1) ===
${step2_1Summary || ''}

=== 詳細調査レポート (Step 2-2) ===
${step2_2Output || ''}

=== 市場・顧客ニーズ ===
${targetSpecContent}

=== 技術資産 ===
${technicalAssetsContent}
`;
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
