import { describe, it, expect } from 'vitest';
import {
  generateUUID,
  parseHypothesesFromOutput,
  extractJsonFromResponse,
  isHypothesesResponse,
  validateAndCleanHypotheses,
  buildHypothesisContext,
  truncateText,
} from './utils';

describe('utils', () => {
  describe('generateUUID', () => {
    it('generates a valid UUID v4 format', () => {
      const uuid = generateUUID();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });

    it('generates unique UUIDs', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(100);
    });

    it('has correct length', () => {
      const uuid = generateUUID();
      expect(uuid.length).toBe(36);
    });
  });

  describe('parseHypothesesFromOutput', () => {
    it('parses 【仮説N】 pattern', () => {
      const output = `
【仮説1】 電子機器用高放熱セラミックス
この仮説は放熱性能を向上させる新素材についてです。

【仮説2】 自動車向け軽量構造材料
軽量化と強度を両立する革新的な材料です。
`;
      const results = parseHypothesesFromOutput(output);
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('電子機器用高放熱セラミックス');
      expect(results[1].title).toBe('自動車向け軽量構造材料');
    });

    it('parses markdown header pattern', () => {
      const output = `
## 仮説 1: 高性能断熱材
概要説明がここに入ります。

### 仮説2: 環境対応塗料
環境に優しい塗料の提案です。
`;
      const results = parseHypothesesFromOutput(output);
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('高性能断熱材');
      expect(results[1].title).toBe('環境対応塗料');
    });

    it('parses numbered list pattern', () => {
      const output = `
1. **新規フッ素コーティング材**
耐久性に優れた表面処理材料

2. **高透明導電フィルム**
次世代ディスプレイ向けの材料
`;
      const results = parseHypothesesFromOutput(output);
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('新規フッ素コーティング材');
      expect(results[1].title).toBe('高透明導電フィルム');
    });

    it('removes duplicates', () => {
      const output = `
【仮説1】 重複するタイトル
説明1

【仮説2】 重複するタイトル
説明2
`;
      const results = parseHypothesesFromOutput(output);
      expect(results).toHaveLength(1);
    });

    it('truncates long summaries', () => {
      const longSummary = 'a'.repeat(3000);
      const output = `【仮説1】 タイトル\n${longSummary}`;
      const results = parseHypothesesFromOutput(output);
      expect(results[0].summary.length).toBeLessThanOrEqual(2000);
    });

    it('returns empty array for unrecognized format', () => {
      const output = 'This is just plain text with no structure.';
      const results = parseHypothesesFromOutput(output);
      expect(results).toHaveLength(0);
    });

    it('ignores short titles in numbered pattern', () => {
      const output = `
1. ABC
Short description

2. 正しい長さのタイトルです
Proper description
`;
      const results = parseHypothesesFromOutput(output);
      // Short title "ABC" should be filtered out (length <= 5)
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('正しい長さのタイトルです');
    });
  });

  describe('extractJsonFromResponse', () => {
    it('extracts valid JSON from mixed content', () => {
      const response = `
Here's the analysis:

{
  "hypotheses": [
    {"title": "Test", "summary": "Description"}
  ]
}

Additional notes here.
`;
      const result = extractJsonFromResponse(response, isHypothesesResponse);
      expect(result).not.toBeNull();
      expect(result?.hypotheses).toHaveLength(1);
    });

    it('returns null for invalid JSON', () => {
      const response = 'No JSON here';
      const result = extractJsonFromResponse(response, isHypothesesResponse);
      expect(result).toBeNull();
    });

    it('returns null for JSON that fails validation', () => {
      const response = '{"hypotheses": "not an array"}';
      const result = extractJsonFromResponse(response, isHypothesesResponse);
      expect(result).toBeNull();
    });
  });

  describe('isHypothesesResponse', () => {
    it('validates correct structure', () => {
      const valid = {
        hypotheses: [
          { title: 'Title', summary: 'Summary' },
        ],
      };
      expect(isHypothesesResponse(valid)).toBe(true);
    });

    it('rejects missing hypotheses', () => {
      expect(isHypothesesResponse({})).toBe(false);
    });

    it('rejects non-array hypotheses', () => {
      expect(isHypothesesResponse({ hypotheses: 'string' })).toBe(false);
    });

    it('rejects items missing title', () => {
      const invalid = {
        hypotheses: [{ summary: 'Summary' }],
      };
      expect(isHypothesesResponse(invalid)).toBe(false);
    });

    it('rejects items missing summary', () => {
      const invalid = {
        hypotheses: [{ title: 'Title' }],
      };
      expect(isHypothesesResponse(invalid)).toBe(false);
    });

    it('rejects null', () => {
      expect(isHypothesesResponse(null)).toBe(false);
    });

    it('accepts empty array', () => {
      expect(isHypothesesResponse({ hypotheses: [] })).toBe(true);
    });
  });

  describe('validateAndCleanHypotheses', () => {
    it('filters invalid entries', () => {
      const input = [
        { title: 'Valid', summary: 'Valid summary' },
        { title: '', summary: 'Empty title' },
        { summary: 'Missing title' } as any,
        { title: 'No summary' } as any,
      ];
      const result = validateAndCleanHypotheses(input);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Valid');
    });

    it('trims and truncates', () => {
      const input = [
        {
          title: '  Long title '.repeat(20),
          summary: '  ' + 'x'.repeat(3000) + '  ',
        },
      ];
      const result = validateAndCleanHypotheses(input);
      expect(result[0].title.length).toBeLessThanOrEqual(100);
      expect(result[0].summary.length).toBeLessThanOrEqual(2000);
      expect(result[0].title).not.toMatch(/^\s/);
      expect(result[0].summary).not.toMatch(/^\s/);
    });
  });

  describe('buildHypothesisContext', () => {
    it('builds complete context string', () => {
      const context = buildHypothesisContext({
        displayTitle: 'Test Hypothesis',
        uuid: 'test-uuid-123',
        step2_1Summary: 'Initial summary',
        step2_2Output: 'Detailed research',
        targetSpecContent: 'Market info',
        technicalAssetsContent: 'Tech assets',
      });

      expect(context).toContain('Test Hypothesis');
      expect(context).toContain('test-uuid-123');
      expect(context).toContain('Initial summary');
      expect(context).toContain('Detailed research');
      expect(context).toContain('Market info');
      expect(context).toContain('Tech assets');
    });

    it('handles null optional fields', () => {
      const context = buildHypothesisContext({
        displayTitle: 'Title',
        uuid: 'uuid',
        step2_1Summary: null,
        step2_2Output: null,
        targetSpecContent: 'Market',
        technicalAssetsContent: 'Tech',
      });

      expect(context).toContain('Title');
      expect(context).not.toContain('null');
    });
  });

  describe('truncateText', () => {
    it('returns text unchanged if under limit', () => {
      const text = 'Short text';
      expect(truncateText(text, 100)).toBe(text);
    });

    it('truncates with ellipsis', () => {
      const text = 'This is a long text that needs truncation';
      const result = truncateText(text, 20);
      expect(result.length).toBe(20);
      expect(result.endsWith('...')).toBe(true);
    });

    it('handles exact length', () => {
      const text = 'Exact';
      expect(truncateText(text, 5)).toBe('Exact');
    });
  });
});
