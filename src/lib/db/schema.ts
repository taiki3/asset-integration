import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  varchar,
  boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

// ============================================
// Projects
// ============================================
export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  userId: varchar('user_id', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

export const projectsRelations = relations(projects, ({ many }) => ({
  resources: many(resources),
  runs: many(runs),
  hypotheses: many(hypotheses),
}));

// ============================================
// Resources (Target Spec / Technical Assets)
// ============================================
export const resources = pgTable('resources', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .references(() => projects.id)
    .notNull(),
  type: text('type', { enum: ['target_spec', 'technical_assets'] }).notNull(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const resourcesRelations = relations(resources, ({ one }) => ({
  project: one(projects, {
    fields: [resources.projectId],
    references: [projects.id],
  }),
}));

// ============================================
// Runs (ASIP Pipeline Execution)
// ============================================
export type RunStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'error'
  | 'cancelled';

export type StepStatus = 'pending' | 'running' | 'completed' | 'error';

export const runs = pgTable('runs', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .references(() => projects.id)
    .notNull(),
  targetSpecId: integer('target_spec_id').references(() => resources.id),
  technicalAssetsId: integer('technical_assets_id').references(
    () => resources.id
  ),

  // Run configuration
  jobName: text('job_name').notNull(),
  hypothesisCount: integer('hypothesis_count').notNull().default(5),
  loopCount: integer('loop_count').notNull().default(1),
  loopIndex: integer('loop_index').notNull().default(0),
  modelChoice: text('model_choice', { enum: ['pro', 'flash'] })
    .notNull()
    .default('pro'),

  // Status tracking
  status: text('status', {
    enum: ['pending', 'running', 'paused', 'completed', 'error', 'cancelled'],
  })
    .notNull()
    .default('pending'),
  currentStep: integer('current_step').notNull().default(0),
  currentLoop: integer('current_loop').notNull().default(1),

  // Gemini Interactions tracking (for async polling)
  geminiInteractions: jsonb('gemini_interactions').$type<
    Array<{
      step: string;
      interactionId: string;
      status: 'pending' | 'running' | 'completed' | 'failed';
      startedAt: string;
      completedAt?: string;
    }>
  >().default([]),

  // Step outputs
  step2_1Output: text('step2_1_output'),
  step2_2IndividualOutputs: jsonb('step2_2_individual_outputs').$type<
    string[]
  >(),
  step2_2IndividualTitles: jsonb('step2_2_individual_titles').$type<string[]>(),
  step3IndividualOutputs: jsonb('step3_individual_outputs').$type<string[]>(),
  step4IndividualOutputs: jsonb('step4_individual_outputs').$type<string[]>(),
  step5IndividualOutputs: jsonb('step5_individual_outputs').$type<string[]>(),
  integratedList: jsonb('integrated_list'),

  // Metadata
  progressInfo: jsonb('progress_info'),
  executionTiming: jsonb('execution_timing'),
  debugPrompts: jsonb('debug_prompts'),
  errorMessage: text('error_message'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export const runsRelations = relations(runs, ({ one, many }) => ({
  project: one(projects, {
    fields: [runs.projectId],
    references: [projects.id],
  }),
  targetSpec: one(resources, {
    fields: [runs.targetSpecId],
    references: [resources.id],
  }),
  technicalAssets: one(resources, {
    fields: [runs.technicalAssetsId],
    references: [resources.id],
  }),
  hypotheses: many(hypotheses),
}));

// ============================================
// Hypotheses
// ============================================
export const hypotheses = pgTable('hypotheses', {
  id: serial('id').primaryKey(),
  uuid: varchar('uuid', { length: 36 }).notNull().unique(), // UUID for tracking through pipeline
  projectId: integer('project_id')
    .references(() => projects.id)
    .notNull(),
  runId: integer('run_id').references(() => runs.id),
  hypothesisNumber: integer('hypothesis_number').notNull(),
  indexInRun: integer('index_in_run').notNull().default(0),
  displayTitle: text('display_title'),
  contentHash: text('content_hash'),

  // Step outputs per hypothesis (UUID-tracked)
  step2_1Summary: text('step2_1_summary'), // Initial summary from Step 2-1
  step2_2Output: text('step2_2_output'),   // Deep Research detail
  step3Output: text('step3_output'),       // Technical evaluation
  step4Output: text('step4_output'),       // Competitive analysis
  step5Output: text('step5_output'),       // Integration evaluation

  // Processing status per hypothesis
  processingStatus: text('processing_status', {
    enum: ['pending', 'step2_2', 'step3', 'step4', 'step5', 'completed', 'error'],
  }).default('pending'),
  currentInteractionId: text('current_interaction_id'), // Active Gemini interaction
  errorMessage: text('error_message'),

  fullData: jsonb('full_data'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

export const hypothesesRelations = relations(hypotheses, ({ one }) => ({
  project: one(projects, {
    fields: [hypotheses.projectId],
    references: [projects.id],
  }),
  run: one(runs, {
    fields: [hypotheses.runId],
    references: [runs.id],
  }),
}));

// ============================================
// Prompt Versions
// ============================================
export const promptVersions = pgTable('prompt_versions', {
  id: serial('id').primaryKey(),
  stepNumber: integer('step_number').notNull(),
  version: integer('version').notNull(),
  content: text('content').notNull(),
  isActive: boolean('is_active').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================
// File Attachments (per step)
// ============================================
export const stepFileAttachments = pgTable('step_file_attachments', {
  id: serial('id').primaryKey(),
  stepNumber: integer('step_number').notNull().unique(),
  attachedFiles: jsonb('attached_files').$type<string[]>().default([]),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================
// Zod Schemas
// ============================================
export const insertProjectSchema = createInsertSchema(projects);
export const selectProjectSchema = createSelectSchema(projects);

export const insertResourceSchema = createInsertSchema(resources);
export const selectResourceSchema = createSelectSchema(resources);

export const insertRunSchema = createInsertSchema(runs);
export const selectRunSchema = createSelectSchema(runs);

export const insertHypothesisSchema = createInsertSchema(hypotheses);
export const selectHypothesisSchema = createSelectSchema(hypotheses);

// ============================================
// Types
// ============================================
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;

export type Hypothesis = typeof hypotheses.$inferSelect;
export type NewHypothesis = typeof hypotheses.$inferInsert;

export type PromptVersion = typeof promptVersions.$inferSelect;
export type StepFileAttachment = typeof stepFileAttachments.$inferSelect;
