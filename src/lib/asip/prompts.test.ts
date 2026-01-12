import { describe, it, expect } from 'vitest';
import { formatPrompt, buildInstructionDocument } from './prompts';

describe('prompts', () => {
  describe('formatPrompt', () => {
    it('replaces single placeholder', () => {
      const result = formatPrompt('Hello {NAME}!', { NAME: 'World' });
      expect(result).toBe('Hello World!');
    });

    it('replaces multiple occurrences of same placeholder', () => {
      const result = formatPrompt('{X} + {X} = 2{X}', { X: 'Y' });
      expect(result).toBe('Y + Y = 2Y');
    });

    it('replaces multiple different placeholders', () => {
      const result = formatPrompt('{A} and {B}', { A: 'Alpha', B: 'Beta' });
      expect(result).toBe('Alpha and Beta');
    });

    it('handles numeric values', () => {
      const result = formatPrompt('Count: {COUNT}', { COUNT: 5 });
      expect(result).toBe('Count: 5');
    });

    it('leaves unmatched placeholders unchanged', () => {
      const result = formatPrompt('{KNOWN} and {UNKNOWN}', { KNOWN: 'value' });
      expect(result).toBe('value and {UNKNOWN}');
    });

    it('handles empty replacements object', () => {
      const result = formatPrompt('No {CHANGES}', {});
      expect(result).toBe('No {CHANGES}');
    });

    it('handles HYPOTHESIS_COUNT in actual prompts', () => {
      const template = 'Generate {HYPOTHESIS_COUNT} hypotheses';
      const result = formatPrompt(template, { HYPOTHESIS_COUNT: 10 });
      expect(result).toBe('Generate 10 hypotheses');
    });
  });

  describe('buildInstructionDocument', () => {
    it('includes hypothesis count in output', () => {
      const result = buildInstructionDocument(5, false);
      expect(result).toContain('5件の新しい事業仮説');
    });

    it('excludes previous hypotheses reference when hasPreviousHypotheses is false', () => {
      const result = buildInstructionDocument(5, false);
      expect(result).not.toContain('過去に生成した仮説と重複しないこと');
    });

    it('includes previous hypotheses reference when hasPreviousHypotheses is true', () => {
      const result = buildInstructionDocument(5, true);
      expect(result).toContain('過去に生成した仮説と重複しないこと');
      expect(result).toContain('previous_hypotheses参照');
    });

    it('includes required sections', () => {
      const result = buildInstructionDocument(3, false);
      expect(result).toContain('【タスク】');
      expect(result).toContain('【各仮説に必要な要素】');
      expect(result).toContain('【条件】');
      expect(result).toContain('【重要】');
    });

    it('includes key requirements', () => {
      const result = buildInstructionDocument(3, false);
      expect(result).toContain('仮説タイトル');
      expect(result).toContain('業界・分野');
      expect(result).toContain('事業仮説概要');
      expect(result).toContain('顧客の解決不能な課題');
      expect(result).toContain('素材が活躍する舞台');
      expect(result).toContain('素材の役割');
    });
  });
});
