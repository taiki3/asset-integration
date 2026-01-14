'use client';

import { useState, useEffect } from 'react';

/**
 * Custom hook for tracking elapsed time
 *
 * @param isActive - Whether the timer should be running
 * @param startTime - The start time in milliseconds (Date.now() or timestamp)
 * @returns elapsed time in seconds
 */
export function useElapsedTime(isActive: boolean, startTime?: number): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setElapsedSeconds(0);
      return;
    }

    const start = startTime || Date.now();

    const updateElapsed = () => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      setElapsedSeconds(elapsed);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [isActive, startTime]);

  return elapsedSeconds;
}

/**
 * Format elapsed time in Japanese
 *
 * @param seconds - elapsed time in seconds
 * @returns formatted string like "1分30秒" or "30秒"
 */
export function formatElapsedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}分${secs}秒`;
  }
  return `${secs}秒`;
}

/**
 * Format time in milliseconds
 *
 * @param ms - time in milliseconds
 * @returns formatted string like "1.5秒" or "500ms"
 */
export function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}秒`;
  return `${(ms / 60000).toFixed(1)}分`;
}
