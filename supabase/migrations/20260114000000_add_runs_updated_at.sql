-- Add updated_at column to runs table for tracking stale runs
ALTER TABLE runs ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index for efficient stale run queries
CREATE INDEX idx_runs_status_updated_at ON runs(status, updated_at) WHERE status = 'running';

-- Set initial value for existing rows
UPDATE runs SET updated_at = created_at WHERE updated_at IS NULL;

-- Make column NOT NULL after setting initial values
ALTER TABLE runs ALTER COLUMN updated_at SET NOT NULL;
