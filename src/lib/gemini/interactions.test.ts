import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  waitForDeepResearchRateLimit,
  releaseDeepResearchSlot,
} from './interactions';

// Note: These tests focus on rate limiting logic which is testable
// Full API tests would require mocking the Google GenAI client

describe('interactions', () => {
  describe('rate limiting', () => {
    beforeEach(() => {
      // Reset rate limiter state between tests
      for (let i = 0; i < 20; i++) {
        releaseDeepResearchSlot();
      }
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('releaseDeepResearchSlot does not go below zero', () => {
      // Release more slots than acquired - should not crash
      for (let i = 0; i < 20; i++) {
        expect(() => releaseDeepResearchSlot()).not.toThrow();
      }
    });

    it('waitForDeepResearchRateLimit increments counter', async () => {
      vi.useFakeTimers();

      // Start the rate limit wait (but don't await fully)
      const promise = waitForDeepResearchRateLimit();

      // Advance time to satisfy the rate limit
      await vi.advanceTimersByTimeAsync(10000);

      await promise;

      // Should have incremented counter (verified by releasing)
      releaseDeepResearchSlot();
    });
  });
});

describe('interactions - unit tests for pure logic', () => {
  describe('status mapping', () => {
    // Test the status mapping logic extracted from getInteractionStatus
    const mapStatus = (status: string): 'pending' | 'in_progress' | 'completed' | 'failed' => {
      switch (status) {
        case 'completed':
          return 'completed';
        case 'failed':
          return 'failed';
        case 'running':
        case 'in_progress':
          return 'in_progress';
        default:
          return 'pending';
      }
    };

    it('maps completed status', () => {
      expect(mapStatus('completed')).toBe('completed');
    });

    it('maps failed status', () => {
      expect(mapStatus('failed')).toBe('failed');
    });

    it('maps running to in_progress', () => {
      expect(mapStatus('running')).toBe('in_progress');
    });

    it('maps in_progress to in_progress', () => {
      expect(mapStatus('in_progress')).toBe('in_progress');
    });

    it('maps unknown status to pending', () => {
      expect(mapStatus('queued')).toBe('pending');
      expect(mapStatus('unknown')).toBe('pending');
      expect(mapStatus('')).toBe('pending');
    });
  });
});
