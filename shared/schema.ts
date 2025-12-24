import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// ============= TABLE DEFINITIONS (declared first) =============

// Keep existing user schema for compatibility
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Projects - Top level management unit
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
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

// Hypothesis Runs - G-Method execution history
export const hypothesisRuns = pgTable("hypothesis_runs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  targetSpecId: integer("target_spec_id").notNull().references(() => resources.id),
  technicalAssetsId: integer("technical_assets_id").notNull().references(() => resources.id),
  status: text("status").notNull().default("pending"), // 'pending', 'running', 'completed', 'error'
  currentStep: integer("current_step").default(0), // 0-5 (0=not started, 2-5 = G-Method steps)
  step2Output: text("step2_output"),
  step3Output: text("step3_output"),
  step4Output: text("step4_output"),
  step5Output: text("step5_output"),
  integratedList: jsonb("integrated_list"), // Parsed TSV data
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at"),
});

// ============= RELATIONS (declared after tables) =============

export const projectsRelations = relations(projects, ({ many }) => ({
  resources: many(resources),
  hypothesisRuns: many(hypothesisRuns),
}));

export const resourcesRelations = relations(resources, ({ one }) => ({
  project: one(projects, {
    fields: [resources.projectId],
    references: [projects.id],
  }),
}));

export const hypothesisRunsRelations = relations(hypothesisRuns, ({ one }) => ({
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
}));

// ============= INSERT SCHEMAS =============

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

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
  errorMessage: true,
  currentStep: true,
  status: true,
});

// ============= TYPES =============

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Resource = typeof resources.$inferSelect;
export type InsertResource = z.infer<typeof insertResourceSchema>;
export type HypothesisRun = typeof hypothesisRuns.$inferSelect;
export type InsertHypothesisRun = z.infer<typeof insertHypothesisRunSchema>;

// Re-export chat models for Gemini integration
export * from "./models/chat";
