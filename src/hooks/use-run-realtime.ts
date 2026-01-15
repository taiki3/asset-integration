'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Run } from '@/lib/db/schema';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseRunRealtimeOptions {
  /** Initial run data */
  initialRun?: Run | null;
  /** Whether to enable realtime subscription */
  enabled?: boolean;
  /** Callback when run is updated */
  onUpdate?: (run: Run) => void;
}

interface UseRunRealtimeResult {
  /** Current run data */
  run: Run | null;
  /** Whether realtime is connected */
  isConnected: boolean;
  /** Error if any */
  error: Error | null;
  /** Manually refresh run data */
  refresh: () => Promise<void>;
}

/**
 * Hook to subscribe to realtime updates for a specific run
 *
 * Uses Supabase Realtime to get instant updates when the run status changes.
 * Falls back to polling if realtime is not available.
 */
export function useRunRealtime(
  runId: number | null,
  options: UseRunRealtimeOptions = {}
): UseRunRealtimeResult {
  const { initialRun = null, enabled = true, onUpdate } = options;

  const [run, setRun] = useState<Run | null>(initialRun);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Manually fetch run data
  const refresh = useCallback(async () => {
    if (!runId) return;

    try {
      const response = await fetch(`/api/runs/${runId}`);
      if (response.ok) {
        const data = await response.json();
        setRun(data);
        onUpdate?.(data);
      }
    } catch (err) {
      console.error('[Realtime] Failed to refresh run:', err);
    }
  }, [runId, onUpdate]);

  useEffect(() => {
    if (!runId || !enabled) return;

    let channel: RealtimeChannel | null = null;
    let pollInterval: NodeJS.Timeout | null = null;

    const setupRealtime = async () => {
      try {
        const supabase = createClient();

        // Subscribe to changes on the runs table for this specific run
        channel = supabase
          .channel(`run-${runId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'runs',
              filter: `id=eq.${runId}`,
            },
            (payload) => {
              console.log('[Realtime] Run updated:', payload.new);
              const newRun = payload.new as Run;
              setRun(newRun);
              onUpdate?.(newRun);
            }
          )
          .subscribe((status) => {
            console.log('[Realtime] Subscription status:', status);
            if (status === 'SUBSCRIBED') {
              setIsConnected(true);
              setError(null);
            } else if (status === 'CHANNEL_ERROR') {
              setIsConnected(false);
              setError(new Error('Realtime subscription failed'));
              // Fall back to polling
              startPolling();
            }
          });
      } catch (err) {
        console.error('[Realtime] Failed to setup realtime:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        // Fall back to polling
        startPolling();
      }
    };

    const startPolling = () => {
      if (pollInterval) return;

      console.log('[Realtime] Falling back to polling');
      pollInterval = setInterval(async () => {
        await refresh();
      }, 3000); // Poll every 3 seconds
    };

    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    setupRealtime();

    // Cleanup
    return () => {
      stopPolling();
      if (channel) {
        const supabase = createClient();
        supabase.removeChannel(channel);
      }
    };
  }, [runId, enabled, onUpdate, refresh]);

  // Update run when initialRun changes
  useEffect(() => {
    if (initialRun) {
      setRun(initialRun);
    }
  }, [initialRun]);

  return { run, isConnected, error, refresh };
}

/**
 * Hook to subscribe to realtime updates for all runs in a project
 */
export function useProjectRunsRealtime(
  projectId: number | null,
  options: { enabled?: boolean; onUpdate?: (runs: Run[]) => void } = {}
): {
  isConnected: boolean;
  error: Error | null;
} {
  const { enabled = true, onUpdate } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!projectId || !enabled) return;

    let channel: RealtimeChannel | null = null;

    const setupRealtime = async () => {
      try {
        const supabase = createClient();

        channel = supabase
          .channel(`project-${projectId}-runs`)
          .on(
            'postgres_changes',
            {
              event: '*', // INSERT, UPDATE, DELETE
              schema: 'public',
              table: 'runs',
              filter: `project_id=eq.${projectId}`,
            },
            async () => {
              // Refetch all runs when any change occurs
              try {
                const response = await fetch(`/api/projects/${projectId}/runs`);
                if (response.ok) {
                  const runs = await response.json();
                  onUpdate?.(runs);
                }
              } catch (err) {
                console.error('[Realtime] Failed to fetch runs:', err);
              }
            }
          )
          .subscribe((status) => {
            console.log('[Realtime] Project runs subscription status:', status);
            if (status === 'SUBSCRIBED') {
              setIsConnected(true);
              setError(null);
            } else if (status === 'CHANNEL_ERROR') {
              setIsConnected(false);
              setError(new Error('Realtime subscription failed'));
            }
          });
      } catch (err) {
        console.error('[Realtime] Failed to setup realtime:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
      }
    };

    setupRealtime();

    return () => {
      if (channel) {
        const supabase = createClient();
        supabase.removeChannel(channel);
      }
    };
  }, [projectId, enabled, onUpdate]);

  return { isConnected, error };
}
