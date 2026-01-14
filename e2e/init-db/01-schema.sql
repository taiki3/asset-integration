-- ============================================
-- ASIP Database Schema for E2E Testing
-- Combined from migrations
-- ============================================

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  user_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_deleted_at ON projects(deleted_at) WHERE deleted_at IS NULL;

-- Resources (Target Spec / Technical Assets)
CREATE TABLE IF NOT EXISTS resources (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('target_spec', 'technical_assets')),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_resources_project_id ON resources(project_id);

-- Runs (ASIP Pipeline Execution)
CREATE TABLE IF NOT EXISTS runs (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_spec_id INTEGER REFERENCES resources(id),
  technical_assets_id INTEGER REFERENCES resources(id),

  -- Run configuration
  job_name TEXT NOT NULL,
  hypothesis_count INTEGER NOT NULL DEFAULT 5,
  loop_count INTEGER NOT NULL DEFAULT 1,
  loop_index INTEGER NOT NULL DEFAULT 0,
  model_choice TEXT NOT NULL DEFAULT 'pro' CHECK (model_choice IN ('pro', 'flash')),

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'error', 'cancelled')),
  current_step INTEGER NOT NULL DEFAULT 0,
  current_loop INTEGER NOT NULL DEFAULT 1,

  -- Gemini Interactions tracking (for async polling)
  gemini_interactions JSONB DEFAULT '[]'::jsonb,

  -- Step outputs
  step2_1_output TEXT,
  step2_2_individual_outputs JSONB,
  step2_2_individual_titles JSONB,
  step3_individual_outputs JSONB,
  step4_individual_outputs JSONB,
  step5_individual_outputs JSONB,
  integrated_list JSONB,

  -- Metadata
  progress_info JSONB,
  execution_timing JSONB,
  debug_prompts JSONB,
  error_message TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_runs_project_id ON runs(project_id);
CREATE INDEX idx_runs_status ON runs(status);

-- Hypotheses
CREATE TABLE IF NOT EXISTS hypotheses (
  id SERIAL PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL UNIQUE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id INTEGER REFERENCES runs(id) ON DELETE SET NULL,
  hypothesis_number INTEGER NOT NULL,
  index_in_run INTEGER NOT NULL DEFAULT 0,
  display_title TEXT,
  content_hash TEXT,

  -- Step outputs per hypothesis
  step2_1_summary TEXT,
  step2_2_output TEXT,
  step3_output TEXT,
  step4_output TEXT,
  step5_output TEXT,

  -- Processing status
  processing_status TEXT DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'step2_2', 'step3', 'step4', 'step5', 'completed', 'error')),
  current_interaction_id TEXT,
  error_message TEXT,

  full_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_hypotheses_project_id ON hypotheses(project_id);
CREATE INDEX idx_hypotheses_run_id ON hypotheses(run_id);
CREATE INDEX idx_hypotheses_uuid ON hypotheses(uuid);
CREATE INDEX idx_hypotheses_processing_status ON hypotheses(processing_status);
CREATE INDEX idx_hypotheses_content_hash ON hypotheses(content_hash);

-- Prompt Versions
CREATE TABLE IF NOT EXISTS prompt_versions (
  id SERIAL PRIMARY KEY,
  step_number INTEGER NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_prompt_versions_step ON prompt_versions(step_number);
CREATE INDEX idx_prompt_versions_active ON prompt_versions(step_number, is_active) WHERE is_active = true;

-- Step File Attachments
CREATE TABLE IF NOT EXISTS step_file_attachments (
  id SERIAL PRIMARY KEY,
  step_number INTEGER NOT NULL UNIQUE,
  attached_files JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Note: RLS is disabled for E2E testing to simplify test setup
-- In production, RLS policies are applied via Supabase
