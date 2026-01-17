-- pg_cron + pg_net Setup for Process Nudging
-- Nudges stuck runs every minute via HTTP

-- Extensions should already be enabled via Supabase Dashboard

-- Config table for API secrets (values inserted manually, not in git)
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nudge function
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
    RETURN QUERY SELECT -1, 'Config not found - run setup_app_config()'::TEXT;
    RETURN;
  END IF;

  -- Find stuck runs (running but not updated for 2+ minutes)
  FOR running_run IN
    SELECT r.id, r.job_name, r.updated_at
    FROM runs r
    WHERE r.status = 'running'
      AND r.updated_at < NOW() - INTERVAL '2 minutes'
    ORDER BY r.updated_at ASC
    LIMIT 3
  LOOP
    -- Async HTTP POST to process endpoint
    SELECT net.http_post(
      url := v_vercel_url || '/api/runs/' || running_run.id || '/process',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', v_cron_secret,
        'x-vercel-protection-bypass', v_bypass_secret
      ),
      body := '{}'::jsonb
    ) INTO v_request_id;

    RETURN QUERY SELECT running_run.id, 'nudged'::TEXT;
  END LOOP;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 'No stuck runs'::TEXT;
  END IF;
END;
$$;

-- Schedule cron job (every minute)
SELECT cron.schedule(
  'nudge-running-runs',
  '* * * * *',
  $$SELECT * FROM nudge_running_runs()$$
);

-- NOTE: After migration, run this SQL manually with actual values:
-- INSERT INTO app_config (key, value) VALUES
--   ('vercel_url', 'https://your-app.vercel.app'),
--   ('cron_secret', 'your-cron-secret'),
--   ('bypass_secret', 'your-bypass-secret')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
