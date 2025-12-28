import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Re-export auth models (users and sessions tables for Replit Auth)
export * from "./models/auth";

// ============= TABLE DEFINITIONS (declared first) =============

// Projects - Top level management unit
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: timestamp("deleted_at"), // Soft delete timestamp
});

// Resources - Input data (Target Specs and Technical Assets)
export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'target_spec' or 'technical_assets'
  name: text("name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Hypothesis Runs - ASIP execution history
export const hypothesisRuns = pgTable("hypothesis_runs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  targetSpecId: integer("target_spec_id").notNull().references(() => resources.id),
  technicalAssetsId: integer("technical_assets_id").notNull().references(() => resources.id),
  jobName: text("job_name"), // Job name for identification (default: YYYYMMDDHHMM, with -n suffix for loops)
  loopIndex: integer("loop_index").default(0), // This run's loop index (0 for single, 1-N for multi-loop batches)
  hypothesisCount: integer("hypothesis_count").notNull().default(5), // Number of hypotheses per loop
  loopCount: integer("loop_count").notNull().default(1), // Number of generation loops
  reprocessMode: integer("reprocess_mode").default(0), // 1 = reprocessing mode, 0 = normal mode
  reprocessUploadedContent: text("reprocess_uploaded_content"), // Content of uploaded file for reprocessing
  reprocessCustomPrompt: text("reprocess_custom_prompt"), // Custom prompt for document splitting
  reprocessModelChoice: text("reprocess_model_choice"), // 'pro' or 'flash' for reprocessing
  status: text("status").notNull().default("pending"), // 'pending', 'running', 'completed', 'error'
  currentStep: integer("current_step").default(0), // 0-5 (0=not started, 2-5 = ASIP steps)
  currentLoop: integer("current_loop").default(0), // Current loop iteration (1-based)
  totalLoops: integer("total_loops").default(1), // Total loops to run
  step2_1Output: text("step2_1_output"), // Step 2-1: Divergent selection phase
  step2_2Output: text("step2_2_output"), // Step 2-2: Convergent deep-dive phase (merged)
  step2_2IndividualOutputs: jsonb("step2_2_individual_outputs"), // Step 2-2: Individual hypothesis reports array
  step2_2IndividualTitles: jsonb("step2_2_individual_titles"), // Step 2-2: Individual hypothesis titles array (parallel to outputs)
  step2Output: text("step2_output"), // Combined output of 2-1 and 2-2 (legacy, kept for backward compatibility)
  step3Output: text("step3_output"), // Legacy batch output (kept for backward compatibility)
  step3IndividualOutputs: jsonb("step3_individual_outputs"), // Step 3: Per-hypothesis scientific evaluation
  step4Output: text("step4_output"), // Legacy batch output (kept for backward compatibility)
  step4IndividualOutputs: jsonb("step4_individual_outputs"), // Step 4: Per-hypothesis strategic audit
  step5Output: text("step5_output"), // Legacy batch output (kept for backward compatibility)
  step5IndividualOutputs: jsonb("step5_individual_outputs"), // Step 5: Per-hypothesis TSV row output
  integratedList: jsonb("integrated_list"), // Parsed TSV data
  validationMetadata: jsonb("validation_metadata"), // Deep Research validation results
  progressInfo: jsonb("progress_info"), // Detailed progress info (planning result, step timings, etc.)
  executionTiming: jsonb("execution_timing"), // Detailed timing: per-hypothesis durations, step totals, overall duration
  debugPrompts: jsonb("debug_prompts"), // Debug: actual prompts sent (after parameter substitution) and attachments
  resumeCount: integer("resume_count").default(0), // Number of times this run has been resumed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at"),
});

// Prompt Versions - Version-controlled prompts for each step
export const promptVersions = pgTable("prompt_versions", {
  id: serial("id").primaryKey(),
  stepNumber: integer("step_number").notNull(), // 2, 3, 4, or 5
  version: integer("version").notNull().default(1),
  content: text("content").notNull(),
  isActive: integer("is_active").notNull().default(0), // 1 = active, 0 = inactive
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Step File Attachments - Configuration for which files to attach via File Search per step
export const stepFileAttachments = pgTable("step_file_attachments", {
  id: serial("id").primaryKey(),
  stepNumber: integer("step_number").notNull().unique(), // 21, 22, 3, 4, 5
  attachedFiles: jsonb("attached_files").notNull().default([]), // Array of file IDs to attach
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Hypotheses - Stored hypotheses from completed runs for deduplication
// Flexible schema: fullData (JSONB) stores all columns dynamically based on STEP5 prompt output
export const hypotheses = pgTable("hypotheses", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  runId: integer("run_id").references(() => hypothesisRuns.id, { onDelete: "set null" }),
  targetSpecId: integer("target_spec_id").references(() => resources.id, { onDelete: "set null" }),
  technicalAssetsId: integer("technical_assets_id").references(() => resources.id, { onDelete: "set null" }),
  hypothesisNumber: integer("hypothesis_number").notNull(),
  indexInRun: integer("index_in_run"), // 0-based index within run's step2_2IndividualOutputs array
  displayTitle: text("display_title"), // First text column from TSV for display/dedup (auto-extracted)
  contentHash: text("content_hash"), // Hash of fullData for efficient deduplication
  fullData: jsonb("full_data").notNull(), // Complete row data from Step5 - all columns stored here
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: timestamp("deleted_at"), // Soft delete timestamp
});

// ============= RELATIONS (declared after tables) =============

export const projectsRelations = relations(projects, ({ many }) => ({
  resources: many(resources),
  hypothesisRuns: many(hypothesisRuns),
  hypotheses: many(hypotheses),
}));

export const resourcesRelations = relations(resources, ({ one }) => ({
  project: one(projects, {
    fields: [resources.projectId],
    references: [projects.id],
  }),
}));

export const hypothesisRunsRelations = relations(hypothesisRuns, ({ one, many }) => ({
  project: one(projects, {
    fields: [hypothesisRuns.projectId],
    references: [projects.id],
  }),
  targetSpec: one(resources, {
    fields: [hypothesisRuns.targetSpecId],
    references: [resources.id],
  }),
  technicalAssets: one(resources, {
    fields: [hypothesisRuns.technicalAssetsId],
    references: [resources.id],
  }),
  hypotheses: many(hypotheses),
}));

export const hypothesesRelations = relations(hypotheses, ({ one }) => ({
  project: one(projects, {
    fields: [hypotheses.projectId],
    references: [projects.id],
  }),
  run: one(hypothesisRuns, {
    fields: [hypotheses.runId],
    references: [hypothesisRuns.id],
  }),
  targetSpec: one(resources, {
    fields: [hypotheses.targetSpecId],
    references: [resources.id],
  }),
  technicalAssets: one(resources, {
    fields: [hypotheses.technicalAssetsId],
    references: [resources.id],
  }),
}));

// ============= INSERT SCHEMAS =============

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
});

export const insertResourceSchema = createInsertSchema(resources).omit({
  id: true,
  createdAt: true,
});

export const insertHypothesisRunSchema = createInsertSchema(hypothesisRuns).omit({
  id: true,
  createdAt: true,
  completedAt: true,
  step2Output: true,
  step3Output: true,
  step4Output: true,
  step5Output: true,
  integratedList: true,
  validationMetadata: true,
  progressInfo: true,
  errorMessage: true,
  currentStep: true,
  currentLoop: true,
  status: true,
});

export const insertHypothesisSchema = createInsertSchema(hypotheses).omit({
  id: true,
  createdAt: true,
});

export const insertPromptVersionSchema = createInsertSchema(promptVersions).omit({
  id: true,
  createdAt: true,
});

export const insertStepFileAttachmentSchema = createInsertSchema(stepFileAttachments).omit({
  id: true,
  updatedAt: true,
});

// ============= TYPES =============

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Resource = typeof resources.$inferSelect;
export type InsertResource = z.infer<typeof insertResourceSchema>;
export type HypothesisRun = typeof hypothesisRuns.$inferSelect;
export type InsertHypothesisRun = z.infer<typeof insertHypothesisRunSchema>;
export type Hypothesis = typeof hypotheses.$inferSelect;
export type InsertHypothesis = z.infer<typeof insertHypothesisSchema>;
export type PromptVersion = typeof promptVersions.$inferSelect;
export type InsertPromptVersion = z.infer<typeof insertPromptVersionSchema>;
export type StepFileAttachment = typeof stepFileAttachments.$inferSelect;
export type InsertStepFileAttachment = z.infer<typeof insertStepFileAttachmentSchema>;

// Re-export chat models for Gemini integration
export * from "./models/chat";
