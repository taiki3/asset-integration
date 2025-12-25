import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertResourceSchema, insertHypothesisRunSchema, insertPromptVersionSchema } from "@shared/schema";
import { STEP2_PROMPT, STEP3_PROMPT, STEP4_PROMPT, STEP5_PROMPT } from "./prompts";
import { executeGMethodPipeline, requestPause, requestResume, requestStop, resumePipeline } from "./gmethod-pipeline";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";

// Server start time for version tracking
const SERVER_START_TIME = new Date().toISOString();

// Domain restriction middleware - only allow @agc.com emails (and gmail.com in development)
// Additional emails can be whitelisted via ALLOWED_EMAILS environment variable (comma-separated)
const requireAgcDomain: RequestHandler = (req, res, next) => {
  const user = req.user as any;
  const email = user?.claims?.email?.toLowerCase();
  
  if (!email) {
    return res.status(403).json({ 
      error: "アクセスが拒否されました", 
      message: "メールアドレスが確認できません。" 
    });
  }
  
  // Check whitelisted emails first (case-insensitive)
  const allowedEmails = (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0);
  
  if (allowedEmails.includes(email)) {
    return next();
  }
  
  // Check allowed domains
  const allowedDomains = ["@agc.com"];
  
  // Allow gmail.com in development mode
  if (process.env.NODE_ENV === "development") {
    allowedDomains.push("@gmail.com");
  }
  
  const isAllowed = allowedDomains.some(domain => email.endsWith(domain));
  
  if (!isAllowed) {
    return res.status(403).json({ 
      error: "アクセスが拒否されました", 
      message: "このアプリはagc.comドメインのメールアドレスでのみ利用可能です。" 
    });
  }
  
  next();
};

async function recoverInterruptedRuns(): Promise<void> {
  try {
    const interruptedRuns = await storage.getInterruptedRuns();
    if (interruptedRuns.length === 0) {
      console.log("[Recovery] No interrupted runs found");
      return;
    }
    
    console.log(`[Recovery] Found ${interruptedRuns.length} interrupted run(s)`);
    
    for (const run of interruptedRuns) {
      const wasRunning = run.status === "running";
      const errorMessage = wasRunning 
        ? "サーバー再起動により中断されました。再実行してください。"
        : "一時停止中にサーバーが再起動しました。再実行してください。";
      
      await storage.updateRun(run.id, {
        status: "interrupted",
        errorMessage,
      });
      
      console.log(`[Recovery] Run ${run.id} marked as interrupted (was ${run.status}, step ${run.currentStep}, loop ${run.currentLoop})`);
    }
  } catch (error) {
    console.error("[Recovery] Error recovering interrupted runs:", error);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Recover any runs that were interrupted by server restart
  await recoverInterruptedRuns();
  
  // Setup auth BEFORE other routes
  await setupAuth(app);
  registerAuthRoutes(app);

  // Version info endpoint (public)
  app.get("/api/version", (req, res) => {
    res.json({ serverStartTime: SERVER_START_TIME });
  });

  // Projects CRUD (protected routes)
  app.get("/api/projects", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const result = insertProjectSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid project data", details: result.error });
      }
      const project = await storage.createProject(result.data);
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.delete("/api/projects/:id", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteProject(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Resources CRUD
  app.get("/api/projects/:projectId/resources", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const resources = await storage.getResourcesByProject(projectId);
      res.json(resources);
    } catch (error) {
      console.error("Error fetching resources:", error);
      res.status(500).json({ error: "Failed to fetch resources" });
    }
  });

  app.post("/api/projects/:projectId/resources", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const result = insertResourceSchema.safeParse({ ...req.body, projectId });
      if (!result.success) {
        return res.status(400).json({ error: "Invalid resource data", details: result.error });
      }
      const resource = await storage.createResource(result.data);
      res.status(201).json(resource);
    } catch (error) {
      console.error("Error creating resource:", error);
      res.status(500).json({ error: "Failed to create resource" });
    }
  });

  app.patch("/api/projects/:projectId/resources/:id", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const projectId = parseInt(req.params.projectId);
      const { name, content } = req.body;
      
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Name is required and must be non-empty" });
      }
      if (!content || typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ error: "Content is required and must be non-empty" });
      }
      
      const updated = await storage.updateResource(id, projectId, { name: name.trim(), content: content.trim() });
      if (!updated) {
        return res.status(404).json({ error: "Resource not found or does not belong to this project" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating resource:", error);
      res.status(500).json({ error: "Failed to update resource" });
    }
  });

  app.delete("/api/projects/:projectId/resources/:id", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteResource(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting resource:", error);
      res.status(500).json({ error: "Failed to delete resource" });
    }
  });

  app.get("/api/projects/:projectId/importable-resources", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const projectsWithResources = await storage.getProjectsWithResourcesExcept(projectId);
      res.json(projectsWithResources);
    } catch (error) {
      console.error("Error fetching importable resources:", error);
      res.status(500).json({ error: "Failed to fetch importable resources" });
    }
  });

  app.post("/api/projects/:projectId/resources/import", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { resourceIds } = req.body;
      
      if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
        return res.status(400).json({ error: "resourceIds must be a non-empty array" });
      }
      
      if (!resourceIds.every((id: any) => typeof id === "number" && Number.isInteger(id))) {
        return res.status(400).json({ error: "All resourceIds must be integers" });
      }
      
      const imported = await storage.importResources(projectId, resourceIds);
      res.status(201).json(imported);
    } catch (error) {
      console.error("Error importing resources:", error);
      res.status(500).json({ error: "Failed to import resources" });
    }
  });

  // Hypothesis Runs
  app.get("/api/projects/:projectId/runs", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const runs = await storage.getRunsByProject(projectId);
      res.json(runs);
    } catch (error) {
      console.error("Error fetching runs:", error);
      res.status(500).json({ error: "Failed to fetch runs" });
    }
  });

  app.post("/api/projects/:projectId/runs", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { existingFilter, ...runData } = req.body;
      const result = insertHypothesisRunSchema.safeParse({ ...runData, projectId });
      if (!result.success) {
        return res.status(400).json({ error: "Invalid run data", details: result.error });
      }
      
      // Validate existingFilter structure if provided
      let validatedFilter = undefined;
      if (existingFilter && typeof existingFilter === "object") {
        const enabled = typeof existingFilter.enabled === "boolean" ? existingFilter.enabled : false;
        const targetSpecIds = Array.isArray(existingFilter.targetSpecIds) 
          ? existingFilter.targetSpecIds.filter((id: unknown): id is number => typeof id === "number")
          : [];
        const technicalAssetsIds = Array.isArray(existingFilter.technicalAssetsIds)
          ? existingFilter.technicalAssetsIds.filter((id: unknown): id is number => typeof id === "number")
          : [];
        validatedFilter = { enabled, targetSpecIds, technicalAssetsIds };
      }
      
      const run = await storage.createRun(result.data);
      
      // Start pipeline execution asynchronously with optional existing hypothesis filter
      executeGMethodPipeline(run.id, undefined, validatedFilter).catch((error) => {
        console.error("Pipeline execution error:", error);
      });
      
      res.status(201).json(run);
    } catch (error) {
      console.error("Error creating run:", error);
      res.status(500).json({ error: "Failed to create run" });
    }
  });

  app.get("/api/runs/:id", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const run = await storage.getRun(id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      res.json(run);
    } catch (error) {
      console.error("Error fetching run:", error);
      res.status(500).json({ error: "Failed to fetch run" });
    }
  });

  // Pause a running pipeline (will pause after current step completes)
  app.post("/api/runs/:id/pause", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const run = await storage.getRun(id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      if (run.status !== "running") {
        return res.status(400).json({ error: "Run is not running" });
      }
      requestPause(id);
      res.json({ message: "Pause requested. Will pause after current step." });
    } catch (error) {
      console.error("Error pausing run:", error);
      res.status(500).json({ error: "Failed to pause run" });
    }
  });

  // Resume a paused pipeline
  app.post("/api/runs/:id/resume", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const run = await storage.getRun(id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      if (run.status !== "paused") {
        return res.status(400).json({ error: "Run is not paused" });
      }
      requestResume(id);
      // Resume pipeline execution
      resumePipeline(run.id).catch((error) => {
        console.error("Pipeline resume error:", error);
      });
      res.json({ message: "Pipeline resumed" });
    } catch (error) {
      console.error("Error resuming run:", error);
      res.status(500).json({ error: "Failed to resume run" });
    }
  });

  // Stop a running or paused pipeline (cannot be resumed)
  app.post("/api/runs/:id/stop", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const run = await storage.getRun(id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      if (run.status !== "running" && run.status !== "paused") {
        return res.status(400).json({ error: "Run is not running or paused" });
      }
      requestStop(id);
      // If paused, update status immediately
      if (run.status === "paused") {
        await storage.updateRun(id, { status: "error", errorMessage: "ユーザーにより停止されました" });
      }
      res.json({ message: "Stop requested" });
    } catch (error) {
      console.error("Error stopping run:", error);
      res.status(500).json({ error: "Failed to stop run" });
    }
  });

  // Hypotheses
  app.get("/api/projects/:projectId/hypotheses", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const hypotheses = await storage.getHypothesesByProject(projectId);
      res.json(hypotheses);
    } catch (error) {
      console.error("Error fetching hypotheses:", error);
      res.status(500).json({ error: "Failed to fetch hypotheses" });
    }
  });

  app.delete("/api/hypotheses/:id", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteHypothesis(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting hypothesis:", error);
      res.status(500).json({ error: "Failed to delete hypothesis" });
    }
  });

  // Download endpoints
  app.get("/api/runs/:id/download", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const format = req.query.format as string || "tsv";
      const run = await storage.getRun(id);
      
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      if (run.status !== "completed" || !run.step5Output) {
        return res.status(400).json({ error: "Run not completed or no output available" });
      }

      if (format === "tsv") {
        res.setHeader("Content-Type", "text/tab-separated-values");
        res.setHeader("Content-Disposition", `attachment; filename="hypothesis-run-${id}.tsv"`);
        res.send(run.step5Output);
      } else if (format === "xlsx") {
        // For Excel, we'll send the TSV with xlsx content type
        // In a production app, you'd use a library like xlsx to generate proper Excel files
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="hypothesis-run-${id}.xlsx"`);
        // Convert TSV to simple Excel-compatible format (CSV with tabs works in Excel)
        res.send(run.step5Output);
      } else {
        res.status(400).json({ error: "Invalid format. Use 'tsv' or 'xlsx'" });
      }
    } catch (error) {
      console.error("Error downloading run:", error);
      res.status(500).json({ error: "Failed to download run" });
    }
  });

  // Prompt Management API
  const DEFAULT_PROMPTS: Record<number, string> = {
    2: STEP2_PROMPT,
    3: STEP3_PROMPT,
    4: STEP4_PROMPT,
    5: STEP5_PROMPT,
  };

  app.get("/api/prompts/steps", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const steps = [2, 3, 4, 5].map(stepNumber => ({
        stepNumber,
        name: `Step ${stepNumber}`,
      }));
      res.json(steps);
    } catch (error) {
      console.error("Error fetching steps:", error);
      res.status(500).json({ error: "Failed to fetch steps" });
    }
  });

  app.get("/api/prompts/:stepNumber", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const stepNumber = parseInt(req.params.stepNumber);
      if (![2, 3, 4, 5].includes(stepNumber)) {
        return res.status(400).json({ error: "Invalid step number" });
      }

      const versions = await storage.getPromptVersionsByStep(stepNumber);
      const activePrompt = await storage.getActivePrompt(stepNumber);

      res.json({
        stepNumber,
        versions,
        activeVersion: activePrompt?.version ?? null,
        activeId: activePrompt?.id ?? null,
        defaultPrompt: DEFAULT_PROMPTS[stepNumber],
      });
    } catch (error) {
      console.error("Error fetching prompt versions:", error);
      res.status(500).json({ error: "Failed to fetch prompt versions" });
    }
  });

  app.post("/api/prompts/:stepNumber", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const stepNumber = parseInt(req.params.stepNumber);
      if (![2, 3, 4, 5].includes(stepNumber)) {
        return res.status(400).json({ error: "Invalid step number" });
      }

      const parsed = insertPromptVersionSchema.safeParse({
        ...req.body,
        stepNumber,
      });

      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error });
      }

      const created = await storage.createPromptVersion(parsed.data);
      const activated = await storage.activatePromptVersion(created.id);
      res.status(201).json(activated);
    } catch (error) {
      console.error("Error creating prompt version:", error);
      res.status(500).json({ error: "Failed to create prompt version" });
    }
  });

  app.post("/api/prompts/:stepNumber/activate/:id", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const activated = await storage.activatePromptVersion(id);
      
      if (!activated) {
        return res.status(404).json({ error: "Prompt version not found" });
      }

      res.json(activated);
    } catch (error) {
      console.error("Error activating prompt version:", error);
      res.status(500).json({ error: "Failed to activate prompt version" });
    }
  });

  app.post("/api/prompts/:stepNumber/reset", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const stepNumber = parseInt(req.params.stepNumber);
      if (![2, 3, 4, 5].includes(stepNumber)) {
        return res.status(400).json({ error: "Invalid step number" });
      }

      const versions = await storage.getPromptVersionsByStep(stepNumber);
      for (const v of versions) {
        if (v.isActive === 1) {
          await storage.activatePromptVersion(v.id);
          break;
        }
      }

      res.json({ message: "Reset to default prompt (no active version)" });
    } catch (error) {
      console.error("Error resetting prompt:", error);
      res.status(500).json({ error: "Failed to reset prompt" });
    }
  });

  return httpServer;
}
