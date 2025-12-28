-- ============================================
-- ASIP Database Schema
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
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id INTEGER REFERENCES runs(id) ON DELETE SET NULL,
  hypothesis_number INTEGER NOT NULL,
  index_in_run INTEGER NOT NULL DEFAULT 0,
  display_title TEXT,
  content_hash TEXT,
  full_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_hypotheses_project_id ON hypotheses(project_id);
CREATE INDEX idx_hypotheses_run_id ON hypotheses(run_id);
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

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypotheses ENABLE ROW LEVEL SECURITY;

-- Projects: Users can only access their own projects
CREATE POLICY "Users can view own projects" ON projects
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own projects" ON projects
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own projects" ON projects
  FOR DELETE USING (auth.uid()::text = user_id);

-- Resources: Access through project ownership
CREATE POLICY "Users can access resources of own projects" ON resources
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = resources.project_id
      AND projects.user_id = auth.uid()::text
    )
  );

-- Runs: Access through project ownership
CREATE POLICY "Users can access runs of own projects" ON runs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = runs.project_id
      AND projects.user_id = auth.uid()::text
    )
  );

-- Hypotheses: Access through project ownership
CREATE POLICY "Users can access hypotheses of own projects" ON hypotheses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = hypotheses.project_id
      AND projects.user_id = auth.uid()::text
    )
  );

-- ============================================
-- Realtime subscriptions
-- ============================================

-- Enable realtime for runs table (for live progress updates)
ALTER PUBLICATION supabase_realtime ADD TABLE runs;
