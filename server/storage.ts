import {
  type Project,
  type InsertProject,
  type Resource,
  type InsertResource,
  type HypothesisRun,
  type InsertHypothesisRun,
  type Hypothesis,
  type InsertHypothesis,
  projects,
  resources,
  hypothesisRuns,
  hypotheses,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, max } from "drizzle-orm";

export interface IStorage {
  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  deleteProject(id: number): Promise<void>;

  // Resources
  getResourcesByProject(projectId: number): Promise<Resource[]>;
  getResource(id: number): Promise<Resource | undefined>;
  createResource(resource: InsertResource): Promise<Resource>;
  deleteResource(id: number): Promise<void>;

  // Hypothesis Runs
  getRunsByProject(projectId: number): Promise<HypothesisRun[]>;
  getRun(id: number): Promise<HypothesisRun | undefined>;
  createRun(run: InsertHypothesisRun): Promise<HypothesisRun>;
  updateRun(id: number, updates: Partial<HypothesisRun>): Promise<HypothesisRun | undefined>;

  // Hypotheses
  getHypothesesByProject(projectId: number): Promise<Hypothesis[]>;
  createHypothesis(hypothesis: InsertHypothesis): Promise<Hypothesis>;
  createHypotheses(hypothesesData: InsertHypothesis[]): Promise<Hypothesis[]>;
  deleteHypothesis(id: number): Promise<void>;
  getNextHypothesisNumber(projectId: number): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // Projects
  async getProjects(): Promise<Project[]> {
    return db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }

  async deleteProject(id: number): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  // Resources
  async getResourcesByProject(projectId: number): Promise<Resource[]> {
    return db.select().from(resources).where(eq(resources.projectId, projectId)).orderBy(desc(resources.createdAt));
  }

  async getResource(id: number): Promise<Resource | undefined> {
    const [resource] = await db.select().from(resources).where(eq(resources.id, id));
    return resource;
  }

  async createResource(resource: InsertResource): Promise<Resource> {
    const [created] = await db.insert(resources).values(resource).returning();
    return created;
  }

  async deleteResource(id: number): Promise<void> {
    await db.delete(resources).where(eq(resources.id, id));
  }

  // Hypothesis Runs
  async getRunsByProject(projectId: number): Promise<HypothesisRun[]> {
    return db.select().from(hypothesisRuns).where(eq(hypothesisRuns.projectId, projectId)).orderBy(desc(hypothesisRuns.createdAt));
  }

  async getRun(id: number): Promise<HypothesisRun | undefined> {
    const [run] = await db.select().from(hypothesisRuns).where(eq(hypothesisRuns.id, id));
    return run;
  }

  async createRun(run: InsertHypothesisRun): Promise<HypothesisRun> {
    const [created] = await db.insert(hypothesisRuns).values(run).returning();
    return created;
  }

  async updateRun(id: number, updates: Partial<HypothesisRun>): Promise<HypothesisRun | undefined> {
    const [updated] = await db.update(hypothesisRuns).set(updates).where(eq(hypothesisRuns.id, id)).returning();
    return updated;
  }

  // Hypotheses
  async getHypothesesByProject(projectId: number): Promise<Hypothesis[]> {
    return db.select().from(hypotheses).where(eq(hypotheses.projectId, projectId)).orderBy(desc(hypotheses.createdAt));
  }

  async createHypothesis(hypothesis: InsertHypothesis): Promise<Hypothesis> {
    const [created] = await db.insert(hypotheses).values(hypothesis).returning();
    return created;
  }

  async createHypotheses(hypothesesData: InsertHypothesis[]): Promise<Hypothesis[]> {
    if (hypothesesData.length === 0) return [];
    const created = await db.insert(hypotheses).values(hypothesesData).returning();
    return created;
  }

  async deleteHypothesis(id: number): Promise<void> {
    await db.delete(hypotheses).where(eq(hypotheses.id, id));
  }

  async getNextHypothesisNumber(projectId: number): Promise<number> {
    const result = await db
      .select({ maxNumber: max(hypotheses.hypothesisNumber) })
      .from(hypotheses)
      .where(eq(hypotheses.projectId, projectId));
    
    const currentMax = result[0]?.maxNumber ?? 0;
    return currentMax + 1;
  }
}

export const storage = new DatabaseStorage();
