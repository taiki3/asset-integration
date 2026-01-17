-- =====================================================
-- Supabase pg_cron + pg_net Setup for Process Nudging
-- =====================================================
-- Run this in Supabase Dashboard > SQL Editor
--
-- This creates a cron job that checks for stuck runs
-- and nudges them via HTTP to continue processing.
-- =====================================================

-- Step 1: Enable extensions (usually already enabled on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step 2: Create config table for storing API secrets
-- (Alternative to Supabase Vault for simpler setup)
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Insert config values (REPLACE WITH YOUR VALUES)
-- For Staging:
INSERT INTO app_config (key, value) VALUES
  ('vercel_url', 'https://asset-integration-git-staging-agc-bdd.vercel.app'),
  ('cron_secret', 'YOUR_CRON_SECRET_HERE'),
  ('bypass_secret', 'YOUR_BYPASS_SECRET_HERE')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Step 4: Create the nudge function
CREATE OR REPLACE FUNCTION nudge_running_runs()
RETURNS TABLE(run_id INT, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  running_run RECORD;
  v_vercel_url TEXT;
  v_cron_secret TEXT;
  v_bypass_secret TEXT;
  v_request_id BIGINT;
BEGIN
  -- Get config
  SELECT value INTO v_vercel_url FROM app_config WHERE key = 'vercel_url';
  SELECT value INTO v_cron_secret FROM app_config WHERE key = 'cron_secret';
  SELECT value INTO v_bypass_secret FROM app_config WHERE key = 'bypass_secret';

  IF v_vercel_url IS NULL OR v_cron_secret IS NULL THEN
    RETURN QUERY SELECT -1, 'Config not found'::TEXT;
    RETURN;
  END IF;

  -- Find runs that need nudging
  -- - Status is 'running'
  -- - Haven't been updated in over 2 minutes (stuck)
  FOR running_run IN
    SELECT r.id, r.job_name, r.updated_at
    FROM runs r
    WHERE r.status = 'running'
      AND r.updated_at < NOW() - INTERVAL '2 minutes'
    ORDER BY r.updated_at ASC
    LIMIT 3
  LOOP
    -- Make async HTTP request
    SELECT net.http_post(
      url := v_vercel_url || '/api/runs/' || running_run.id || '/process',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', v_cron_secret,
        'x-vercel-protection-bypass', v_bypass_secret
      ),
      body := '{}'::jsonb
    ) INTO v_request_id;

    RETURN QUERY SELECT running_run.id, 'nudged (request_id: ' || v_request_id || ')'::TEXT;
  END LOOP;

  -- Return empty if no runs need nudging
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 'No stuck runs found'::TEXT;
  END IF;
END;
$$;

-- Step 5: Schedule the cron job (every minute)
SELECT cron.schedule(
  'nudge-running-runs',
  '* * * * *',
  $$SELECT * FROM nudge_running_runs()$$
);

-- =====================================================
-- Verification & Management Commands
-- =====================================================

-- View all scheduled jobs:
-- SELECT * FROM cron.job;

-- View recent job runs:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Manually test the nudge function:
-- SELECT * FROM nudge_running_runs();

-- Unschedule the job:
-- SELECT cron.unschedule('nudge-running-runs');

-- Check pg_net request status:
-- SELECT * FROM net._http_response ORDER BY created DESC LIMIT 10;
