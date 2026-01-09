-- ============================================
-- Add UUID tracking to hypotheses for pipeline
-- ============================================

-- Add new columns to hypotheses table
ALTER TABLE hypotheses ADD COLUMN IF NOT EXISTS uuid VARCHAR(36) UNIQUE;
ALTER TABLE hypotheses ADD COLUMN IF NOT EXISTS step2_1_summary TEXT;
ALTER TABLE hypotheses ADD COLUMN IF NOT EXISTS step2_2_output TEXT;
ALTER TABLE hypotheses ADD COLUMN IF NOT EXISTS step3_output TEXT;
ALTER TABLE hypotheses ADD COLUMN IF NOT EXISTS step4_output TEXT;
ALTER TABLE hypotheses ADD COLUMN IF NOT EXISTS step5_output TEXT;
ALTER TABLE hypotheses ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending'
  CHECK (processing_status IN ('pending', 'step2_2', 'step3', 'step4', 'step5', 'completed', 'error'));
ALTER TABLE hypotheses ADD COLUMN IF NOT EXISTS current_interaction_id TEXT;
ALTER TABLE hypotheses ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Create index for UUID lookups
CREATE INDEX IF NOT EXISTS idx_hypotheses_uuid ON hypotheses(uuid);
CREATE INDEX IF NOT EXISTS idx_hypotheses_processing_status ON hypotheses(processing_status);

-- Update existing rows with UUIDs if any exist
UPDATE hypotheses SET uuid = gen_random_uuid()::text WHERE uuid IS NULL;

-- Make UUID required for new rows
ALTER TABLE hypotheses ALTER COLUMN uuid SET NOT NULL;
