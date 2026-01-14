import { describe, it, expect } from 'vitest';
import {
  ASIPError,
  RunNotFoundError,
  MissingResourceError,
  HypothesisNotFoundError,
  DeepResearchError,
  ContentGenerationError,
  HypothesisParsingError,
  RateLimitError,
  TimeoutError,
  isASIPError,
  getErrorMessage,
  wrapError,
} from './errors';

describe('errors', () => {
  describe('ASIPError', () => {
    it('creates error with message, code, and details', () => {
      const error = new ASIPError('Test message', 'TEST_CODE', { key: 'value' });

      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toEqual({ key: 'value' });
      expect(error.name).toBe('ASIPError');
    });

    it('serializes to JSON', () => {
      const error = new ASIPError('Test', 'CODE', { data: 123 });
      const json = error.toJSON();

      expect(json).toEqual({
        name: 'ASIPError',
        code: 'CODE',
        message: 'Test',
        details: { data: 123 },
      });
    });

    it('is instanceof Error', () => {
      const error = new ASIPError('Test', 'CODE');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('RunNotFoundError', () => {
    it('creates error with run ID', () => {
      const error = new RunNotFoundError(123);

      expect(error.message).toBe('Run 123 not found');
      expect(error.code).toBe('RUN_NOT_FOUND');
      expect(error.details).toEqual({ runId: 123 });
      expect(error.name).toBe('RunNotFoundError');
    });
  });

  describe('MissingResourceError', () => {
    it('creates error for target_spec', () => {
      const error = new MissingResourceError('target_spec');
      expect(error.message).toBe('ターゲット仕様が見つかりません');
      expect(error.code).toBe('MISSING_RESOURCE');
    });

    it('creates error for technical_assets', () => {
      const error = new MissingResourceError('technical_assets');
      expect(error.message).toBe('技術資産が見つかりません');
    });

    it('creates error for both', () => {
      const error = new MissingResourceError('both');
      expect(error.message).toBe('ターゲット仕様と技術資産の両方が見つかりません');
    });
  });

  describe('HypothesisNotFoundError', () => {
    it('creates error with UUID', () => {
      const error = new HypothesisNotFoundError('abc-123');

      expect(error.message).toBe('Hypothesis abc-123 not found');
      expect(error.code).toBe('HYPOTHESIS_NOT_FOUND');
      expect(error.details).toEqual({ uuid: 'abc-123' });
    });
  });

  describe('DeepResearchError', () => {
    it('creates error with step and cause', () => {
      const cause = new Error('API timeout');
      const error = new DeepResearchError('Failed to connect', 'step2_1', cause);

      expect(error.message).toBe('Deep Research 失敗 (step2_1): Failed to connect');
      expect(error.code).toBe('DEEP_RESEARCH_ERROR');
      expect(error.details).toEqual({ step: 'step2_1', cause: 'API timeout' });
    });

    it('handles missing cause', () => {
      const error = new DeepResearchError('Timeout', 'step2_2');
      expect(error.details?.cause).toBeUndefined();
    });
  });

  describe('ContentGenerationError', () => {
    it('creates error with step info', () => {
      const error = new ContentGenerationError('Model refused', 'step3');

      expect(error.message).toBe('コンテンツ生成失敗 (step3): Model refused');
      expect(error.code).toBe('CONTENT_GENERATION_ERROR');
    });
  });

  describe('HypothesisParsingError', () => {
    it('creates error with message', () => {
      const error = new HypothesisParsingError('No valid hypotheses found');

      expect(error.message).toBe('仮説パース失敗: No valid hypotheses found');
      expect(error.code).toBe('HYPOTHESIS_PARSING_ERROR');
    });
  });

  describe('RateLimitError', () => {
    it('creates error with retry time', () => {
      const error = new RateLimitError(60);

      expect(error.message).toBe('レート制限に達しました。60秒後に再試行してください');
      expect(error.details).toEqual({ retryAfterSeconds: 60 });
    });

    it('creates error without retry time', () => {
      const error = new RateLimitError();

      expect(error.message).toBe('レート制限に達しました');
    });
  });

  describe('TimeoutError', () => {
    it('creates error with operation and timeout', () => {
      const error = new TimeoutError('Deep Research', 30000);

      expect(error.message).toBe('操作がタイムアウトしました: Deep Research (30000ms)');
      expect(error.details).toEqual({ operation: 'Deep Research', timeoutMs: 30000 });
    });
  });

  describe('isASIPError', () => {
    it('returns true for ASIPError', () => {
      expect(isASIPError(new ASIPError('Test', 'CODE'))).toBe(true);
    });

    it('returns true for ASIPError subclasses', () => {
      expect(isASIPError(new RunNotFoundError(1))).toBe(true);
      expect(isASIPError(new MissingResourceError('both'))).toBe(true);
    });

    it('returns false for regular Error', () => {
      expect(isASIPError(new Error('Test'))).toBe(false);
    });

    it('returns false for non-errors', () => {
      expect(isASIPError('string')).toBe(false);
      expect(isASIPError(null)).toBe(false);
      expect(isASIPError(undefined)).toBe(false);
      expect(isASIPError(123)).toBe(false);
    });
  });

  describe('getErrorMessage', () => {
    it('extracts message from ASIPError', () => {
      const error = new ASIPError('ASIP message', 'CODE');
      expect(getErrorMessage(error)).toBe('ASIP message');
    });

    it('extracts message from Error', () => {
      const error = new Error('Standard message');
      expect(getErrorMessage(error)).toBe('Standard message');
    });

    it('returns string as-is', () => {
      expect(getErrorMessage('string error')).toBe('string error');
    });

    it('returns "Unknown error" for other types', () => {
      expect(getErrorMessage(null)).toBe('Unknown error');
      expect(getErrorMessage(undefined)).toBe('Unknown error');
      expect(getErrorMessage({})).toBe('Unknown error');
    });
  });

  describe('wrapError', () => {
    it('returns ASIPError as-is', () => {
      const original = new RunNotFoundError(1);
      const wrapped = wrapError(original, 'Context');
      expect(wrapped).toBe(original);
    });

    it('wraps Error with context', () => {
      const original = new Error('Original');
      const wrapped = wrapError(original, 'Context');

      expect(wrapped).toBeInstanceOf(ASIPError);
      expect(wrapped.message).toBe('Context: Original');
      expect(wrapped.code).toBe('UNKNOWN_ERROR');
    });

    it('wraps string with context', () => {
      const wrapped = wrapError('String error', 'Context');

      expect(wrapped.message).toBe('Context: String error');
    });
  });
});
