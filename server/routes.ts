import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertResourceSchema, insertHypothesisRunSchema, insertPromptVersionSchema } from "@shared/schema";
import { STEP2_PROMPT, STEP2_1_DEEP_RESEARCH_PROMPT, STEP2_2_DEEP_RESEARCH_PROMPT, STEP3_INDIVIDUAL_PROMPT, STEP4_INDIVIDUAL_PROMPT, STEP5_INDIVIDUAL_PROMPT } from "./prompts";
import { executeGMethodPipeline, requestPause, requestResume, requestStop, resumePipeline, isRunActive, getActiveRunIds, forceReleaseAllLocks } from "./gmethod-pipeline";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, TableRow, TableCell, Table, WidthType, BorderStyle } from "docx";

// Server start time for version tracking
const SERVER_START_TIME = new Date().toISOString();

// Font configuration for Word documents
const WORD_FONT = "Meiryo UI";

// Helper function to convert markdown to Word document
async function convertMarkdownToWord(markdown: string, title: string): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  
  // Add title
  children.push(
    new Paragraph({
      children: [new TextRun({ text: title, font: WORD_FONT, size: 32, bold: true })],
      heading: HeadingLevel.TITLE,
      spacing: { after: 400 },
    })
  );
  
  const lines = markdown.split('\n');
  let inTable = false;
  let tableRows: string[][] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Skip empty lines
    if (!trimmedLine) {
      if (inTable && tableRows.length > 0) {
        // End of table, render it
        children.push(createWordTable(tableRows));
        tableRows = [];
        inTable = false;
      }
      children.push(new Paragraph({ children: [new TextRun({ text: "", font: WORD_FONT })] }));
      continue;
    }
    
    // Check for table row (starts with |)
    if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
      // Skip separator rows (| --- | --- |)
      if (trimmedLine.includes('---')) continue;
      
      inTable = true;
      const cells = trimmedLine.split('|').filter(c => c.trim()).map(c => c.trim());
      tableRows.push(cells);
      continue;
    }
    
    // If we were in a table, render it
    if (inTable && tableRows.length > 0) {
      children.push(createWordTable(tableRows));
      tableRows = [];
      inTable = false;
    }
    
    // Parse headings
    if (trimmedLine.startsWith('### ')) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: trimmedLine.substring(4), font: WORD_FONT, bold: true })],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 300, after: 100 },
        })
      );
    } else if (trimmedLine.startsWith('## ')) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: trimmedLine.substring(3), font: WORD_FONT, bold: true })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 150 },
        })
      );
    } else if (trimmedLine.startsWith('# ')) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: trimmedLine.substring(2), font: WORD_FONT, bold: true })],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 500, after: 200 },
        })
      );
    } else if (trimmedLine.startsWith('【') || trimmedLine.startsWith('---')) {
      // Japanese section headers or horizontal rule
      if (trimmedLine === '---') {
        children.push(
          new Paragraph({
            border: { bottom: { color: "auto", space: 1, size: 6, style: BorderStyle.SINGLE } },
            spacing: { before: 200, after: 200 },
          })
        );
      } else {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: trimmedLine, font: WORD_FONT, bold: true })],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 150 },
          })
        );
      }
    } else if (trimmedLine.startsWith('- ')) {
      // Bullet point
      children.push(
        new Paragraph({
          children: [new TextRun({ text: trimmedLine.substring(2), font: WORD_FONT })],
          bullet: { level: 0 },
          spacing: { before: 50, after: 50 },
        })
      );
    } else if (/^\d+\.\s/.test(trimmedLine)) {
      // Numbered list
      const text = trimmedLine.replace(/^\d+\.\s/, '');
      children.push(
        new Paragraph({
          children: [new TextRun({ text, font: WORD_FONT })],
          numbering: { level: 0, reference: "default-numbering" },
          spacing: { before: 50, after: 50 },
        })
      );
    } else {
      // Regular paragraph - handle bold text
      const textRuns: TextRun[] = [];
      const boldRegex = /\*\*(.+?)\*\*/g;
      let lastIndex = 0;
      let match;
      
      while ((match = boldRegex.exec(trimmedLine)) !== null) {
        if (match.index > lastIndex) {
          textRuns.push(new TextRun({ text: trimmedLine.substring(lastIndex, match.index), font: WORD_FONT }));
        }
        textRuns.push(new TextRun({ text: match[1], bold: true, font: WORD_FONT }));
        lastIndex = match.index + match[0].length;
      }
      
      if (lastIndex < trimmedLine.length) {
        textRuns.push(new TextRun({ text: trimmedLine.substring(lastIndex), font: WORD_FONT }));
      }
      
      if (textRuns.length === 0) {
        textRuns.push(new TextRun({ text: trimmedLine, font: WORD_FONT }));
      }
      
      children.push(
        new Paragraph({
          children: textRuns,
          spacing: { before: 100, after: 100 },
        })
      );
    }
  }
  
  // Handle any remaining table
  if (inTable && tableRows.length > 0) {
    children.push(createWordTable(tableRows));
  }
  
  const doc = new Document({
    sections: [{ children }],
    numbering: {
      config: [{
        reference: "default-numbering",
        levels: [{
          level: 0,
          format: "decimal",
          text: "%1.",
          alignment: "start",
        }],
      }],
    },
  });
  
  return await Packer.toBuffer(doc);
}

// Helper function to create a Word table from rows
function createWordTable(rows: string[][]): Table {
  const tableRows = rows.map((row, rowIndex) => {
    return new TableRow({
      children: row.map(cell => {
        return new TableCell({
          children: [new Paragraph({
            children: [new TextRun({
              text: cell,
              bold: rowIndex === 0,
              font: WORD_FONT,
            })],
          })],
          width: { size: 100 / row.length, type: WidthType.PERCENTAGE },
        });
      }),
    });
  });
  
  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

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

  app.patch("/api/projects/:id", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, description } = req.body;
      
      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ error: "Name must be a non-empty string" });
      }
      
      const updates: { name?: string; description?: string } = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description;
      
      const updated = await storage.updateProject(id, updates);
      if (!updated) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.softDeleteProject(id);
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
      
      // Generate default job name if not provided (YYYYMMDDHHMM format)
      if (!runData.jobName) {
        const now = new Date();
        const yyyy = String(now.getFullYear());
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        runData.jobName = `${yyyy}${mm}${dd}${hh}${min}`;
      }
      
      // Set totalLoops from loopCount for pipeline execution
      if (runData.loopCount && runData.loopCount > 1) {
        runData.totalLoops = runData.loopCount;
      }
      
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

  // Resume an interrupted pipeline (restart from where it stopped)
  app.post("/api/runs/:id/resume-interrupted", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Check if run is already active (prevents duplicate execution)
      if (isRunActive(id)) {
        return res.status(409).json({ error: "このパイプラインは既に実行中です" });
      }
      
      const run = await storage.getRun(id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      if (run.status !== "interrupted") {
        return res.status(400).json({ error: "Run is not interrupted" });
      }
      
      // Determine which step to resume from based on completed outputs
      // Use currentStep as primary indicator (set by pipeline during execution)
      // Falls back to output-based detection for older runs
      let resumeStep = run.currentStep || 2;
      
      if (run.step5Output) {
        // Shouldn't happen - already completed
        return res.status(400).json({ error: "Run already completed" });
      } else if (run.step4Output) {
        resumeStep = 5;
      } else if (run.step3Output) {
        resumeStep = 4;
      } else if (run.step2Output) {
        // Step 2 complete, resume from step 3
        resumeStep = 3;
      } else {
        // Step 2 not complete - must restart from beginning of Step 2
        // The pipeline will use any existing step2_1Output/step2_2IndividualOutputs
        // to avoid re-running completed Deep Research substeps
        resumeStep = 2;
      }
      
      // Increment resume count and reset status
      const resumeCount = (run.resumeCount || 0) + 1;
      await storage.updateRun(id, {
        status: "running",
        resumeCount,
        errorMessage: null,
        currentStep: resumeStep,
      });
      
      console.log(`[Run ${id}] Resuming interrupted run (attempt ${resumeCount}) from step ${resumeStep}`);
      
      // Resume pipeline execution
      resumePipeline(id).catch((error) => {
        console.error("Pipeline resume error:", error);
      });
      
      res.json({ message: `パイプラインをステップ${resumeStep}から再開しました`, resumeStep, resumeCount });
    } catch (error) {
      console.error("Error resuming interrupted run:", error);
      res.status(500).json({ error: "Failed to resume interrupted run" });
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

  // Force reset a stuck run (emergency recovery)
  app.post("/api/runs/:id/force-reset", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const run = await storage.getRun(id);
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      // Force reset the run to interrupted status
      await storage.updateRun(id, {
        status: "interrupted",
        errorMessage: "強制リセットにより中断されました",
      });
      
      // Also request stop in case pipeline is still running
      requestStop(id);
      
      console.log(`[Run ${id}] Force reset to interrupted status`);
      res.json({ message: "ランを強制リセットしました。再開するには「途中から再開」をクリックしてください。" });
    } catch (error) {
      console.error("Error force resetting run:", error);
      res.status(500).json({ error: "Failed to force reset run" });
    }
  });

  // Get active run IDs (for debugging)
  app.get("/api/debug/active-runs", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const activeRuns = getActiveRunIds();
      res.json({ activeRuns, count: activeRuns.length });
    } catch (error) {
      console.error("Error getting active runs:", error);
      res.status(500).json({ error: "Failed to get active runs" });
    }
  });

  // Force release all run locks (emergency recovery)
  app.post("/api/debug/force-release-locks", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      forceReleaseAllLocks();
      res.json({ message: "全てのロックを解放しました" });
    } catch (error) {
      console.error("Error releasing locks:", error);
      res.status(500).json({ error: "Failed to release locks" });
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
      await storage.softDeleteHypothesis(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting hypothesis:", error);
      res.status(500).json({ error: "Failed to delete hypothesis" });
    }
  });

  // Import hypotheses from CSV
  app.post("/api/projects/:projectId/hypotheses/import", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const { rows, columnMapping } = req.body as {
        rows: Record<string, string>[];
        columnMapping: Record<string, string>; // app column -> CSV column
      };

      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "No data rows provided" });
      }

      // Get next hypothesis number
      let nextNumber = await storage.getNextHypothesisNumber(projectId);

      // Transform rows based on column mapping
      const hypothesesToCreate = rows.map((row) => {
        const fullData: Record<string, string> = {};
        
        // Map app columns from CSV columns
        for (const [appCol, csvCol] of Object.entries(columnMapping)) {
          if (csvCol && row[csvCol] !== undefined) {
            fullData[appCol] = row[csvCol];
          }
        }

        // Extract display title from first text column
        const displayTitle = Object.values(fullData)[0] || "";

        return {
          projectId,
          hypothesisNumber: nextNumber++,
          displayTitle: String(displayTitle).slice(0, 200),
          fullData,
        };
      });

      const created = await storage.createHypotheses(hypothesesToCreate);
      res.json({ imported: created.length, hypotheses: created });
    } catch (error) {
      console.error("Error importing hypotheses:", error);
      res.status(500).json({ error: "Failed to import hypotheses" });
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
        // Generate proper Excel file using xlsx library
        const XLSX = await import("xlsx");
        
        // Parse TSV data
        const lines = run.step5Output.split("\n").filter(line => line.trim());
        const data = lines.map(line => line.split("\t"));
        
        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        
        // Auto-size columns (approximate)
        const colWidths = data[0]?.map((_, colIndex) => {
          const maxLen = Math.max(...data.map(row => (row[colIndex] || "").length));
          return { wch: Math.min(maxLen + 2, 50) };
        }) || [];
        ws["!cols"] = colWidths;
        
        XLSX.utils.book_append_sheet(wb, ws, "Hypotheses");
        
        // Generate buffer
        const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="hypothesis-run-${id}.xlsx"`);
        res.send(buffer);
      } else {
        res.status(400).json({ error: "Invalid format. Use 'tsv' or 'xlsx'" });
      }
    } catch (error) {
      console.error("Error downloading run:", error);
      res.status(500).json({ error: "Failed to download run" });
    }
  });

  // STEP2 Word export endpoint
  app.get("/api/runs/:id/download-step2-word", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const run = await storage.getRun(id);
      
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      if (!run.step2Output) {
        return res.status(400).json({ error: "STEP2 output not available" });
      }

      const docBuffer = await convertMarkdownToWord(run.step2Output, `STEP2 事業仮説レポート - Run #${id}`);
      
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="step2-report-${id}.docx"`);
      res.send(docBuffer);
    } catch (error) {
      console.error("Error downloading STEP2 Word:", error);
      res.status(500).json({ error: "Failed to download STEP2 Word document" });
    }
  });

  // Individual hypothesis report Word export endpoint (from STEP2-2)
  app.get("/api/runs/:id/download-individual-report/:hypothesisIndex", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const hypothesisIndex = parseInt(req.params.hypothesisIndex);
      const run = await storage.getRun(id);
      
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      const individualOutputs = run.step2_2IndividualOutputs as string[] | null;
      if (!individualOutputs || !Array.isArray(individualOutputs) || individualOutputs.length === 0) {
        return res.status(400).json({ error: "個別レポートが利用できません。このRunはSTEP2-2個別レポート機能追加前に実行された可能性があります。" });
      }
      
      if (hypothesisIndex < 0 || hypothesisIndex >= individualOutputs.length) {
        return res.status(400).json({ error: `仮説インデックスが無効です。範囲: 0-${individualOutputs.length - 1}` });
      }

      const report = individualOutputs[hypothesisIndex];
      
      // Check if report contains error message (Step 2-2 failed)
      if (report.includes("Deep Researchの実行に失敗しました") || report.includes("APIの起動に失敗しました")) {
        return res.status(400).json({ 
          error: "このレポートはStep 2-2でエラーが発生したため、詳細コンテンツがありません。",
          details: report.substring(0, 300)
        });
      }
      
      const docBuffer = await convertMarkdownToWord(report, `仮説${hypothesisIndex + 1} 個別レポート - Run #${id}`);
      
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="hypothesis-${hypothesisIndex + 1}-report-run${id}.docx"`);
      res.send(docBuffer);
    } catch (error) {
      console.error("Error downloading individual report:", error);
      res.status(500).json({ error: "Failed to download individual report" });
    }
  });

  // Get available individual reports for a run
  app.get("/api/runs/:id/individual-reports", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const run = await storage.getRun(id);
      
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      const individualOutputs = run.step2_2IndividualOutputs as string[] | null;
      if (!individualOutputs || !Array.isArray(individualOutputs)) {
        return res.json({ available: false, count: 0, reports: [] });
      }
      
      const reports = individualOutputs.map((report, index) => {
        const titleMatch = report.match(/(?:^|\n)#+\s*(?:仮説\s*\d+[:\s]*)?(.+?)(?:\n|$)/);
        let title = titleMatch ? titleMatch[1].trim().slice(0, 100) : `仮説${index + 1}`;
        
        // Check if this report has an error (Step 2-2 failed)
        const hasError = report.includes("Deep Researchの実行に失敗しました") || 
                        report.includes("APIの起動に失敗しました");
        
        // Extract title from error message format if needed
        if (hasError) {
          const errorTitleMatch = report.match(/【仮説\d+:\s*(.+?)】/);
          if (errorTitleMatch) {
            title = errorTitleMatch[1].trim();
          }
        }
        
        return {
          index,
          title,
          previewLength: report.length,
          hasError,
        };
      });
      
      res.json({ available: true, count: individualOutputs.length, reports });
    } catch (error) {
      console.error("Error fetching individual reports:", error);
      res.status(500).json({ error: "Failed to fetch individual reports" });
    }
  });

  // Get individual report content for preview
  app.get("/api/runs/:id/individual-reports/:hypothesisIndex/content", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const hypothesisIndex = parseInt(req.params.hypothesisIndex);
      const run = await storage.getRun(id);
      
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      const individualOutputs = run.step2_2IndividualOutputs as string[] | null;
      if (!individualOutputs || !Array.isArray(individualOutputs)) {
        return res.status(404).json({ error: "個別レポートが利用できません" });
      }
      
      if (hypothesisIndex < 0 || hypothesisIndex >= individualOutputs.length) {
        return res.status(400).json({ error: `仮説インデックスが無効です。範囲: 0-${individualOutputs.length - 1}` });
      }
      
      const content = individualOutputs[hypothesisIndex];
      const hasError = content.includes("Deep Researchの実行に失敗しました") || 
                       content.includes("APIの起動に失敗しました");
      
      res.json({ content, hasError });
    } catch (error) {
      console.error("Error fetching individual report content:", error);
      res.status(500).json({ error: "Failed to fetch individual report content" });
    }
  });

  // Get available STEP 3 individual reports for a run
  app.get("/api/runs/:id/step3-reports", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const run = await storage.getRun(id);
      
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      const individualOutputs = run.step3IndividualOutputs as string[] | null;
      if (!individualOutputs || !Array.isArray(individualOutputs)) {
        return res.json({ available: false, count: 0, reports: [] });
      }
      
      const reports = individualOutputs.map((report, index) => {
        const titleMatch = report.match(/(?:^|\n)#+\s*(?:仮説\s*\d+[:\s]*)?(.+?)(?:\n|$)/);
        const title = titleMatch ? titleMatch[1].trim().slice(0, 100) : `仮説${index + 1}`;
        const hasError = report.includes("エラー") || report.includes("失敗");
        
        return { index, title, previewLength: report.length, hasError };
      });
      
      res.json({ available: true, count: individualOutputs.length, reports });
    } catch (error) {
      console.error("Error fetching step3 reports:", error);
      res.status(500).json({ error: "Failed to fetch step3 reports" });
    }
  });

  // Get STEP 3 individual report content for preview
  app.get("/api/runs/:id/step3-reports/:hypothesisIndex/content", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const hypothesisIndex = parseInt(req.params.hypothesisIndex);
      const run = await storage.getRun(id);
      
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      const individualOutputs = run.step3IndividualOutputs as string[] | null;
      if (!individualOutputs || !Array.isArray(individualOutputs)) {
        return res.status(404).json({ error: "STEP3個別レポートが利用できません" });
      }
      
      if (hypothesisIndex < 0 || hypothesisIndex >= individualOutputs.length) {
        return res.status(400).json({ error: `仮説インデックスが無効です。範囲: 0-${individualOutputs.length - 1}` });
      }
      
      const content = individualOutputs[hypothesisIndex];
      const hasError = content.includes("エラー") || content.includes("失敗");
      
      res.json({ content, hasError });
    } catch (error) {
      console.error("Error fetching step3 report content:", error);
      res.status(500).json({ error: "Failed to fetch step3 report content" });
    }
  });

  // Get available STEP 4 individual reports for a run
  app.get("/api/runs/:id/step4-reports", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const run = await storage.getRun(id);
      
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      const individualOutputs = run.step4IndividualOutputs as string[] | null;
      if (!individualOutputs || !Array.isArray(individualOutputs)) {
        return res.json({ available: false, count: 0, reports: [] });
      }
      
      const reports = individualOutputs.map((report, index) => {
        const titleMatch = report.match(/(?:^|\n)#+\s*(?:仮説\s*\d+[:\s]*)?(.+?)(?:\n|$)/);
        const title = titleMatch ? titleMatch[1].trim().slice(0, 100) : `仮説${index + 1}`;
        const hasError = report.includes("エラー") || report.includes("失敗");
        
        return { index, title, previewLength: report.length, hasError };
      });
      
      res.json({ available: true, count: individualOutputs.length, reports });
    } catch (error) {
      console.error("Error fetching step4 reports:", error);
      res.status(500).json({ error: "Failed to fetch step4 reports" });
    }
  });

  // Get STEP 4 individual report content for preview
  app.get("/api/runs/:id/step4-reports/:hypothesisIndex/content", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const hypothesisIndex = parseInt(req.params.hypothesisIndex);
      const run = await storage.getRun(id);
      
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      const individualOutputs = run.step4IndividualOutputs as string[] | null;
      if (!individualOutputs || !Array.isArray(individualOutputs)) {
        return res.status(404).json({ error: "STEP4個別レポートが利用できません" });
      }
      
      if (hypothesisIndex < 0 || hypothesisIndex >= individualOutputs.length) {
        return res.status(400).json({ error: `仮説インデックスが無効です。範囲: 0-${individualOutputs.length - 1}` });
      }
      
      const content = individualOutputs[hypothesisIndex];
      const hasError = content.includes("エラー") || content.includes("失敗");
      
      res.json({ content, hasError });
    } catch (error) {
      console.error("Error fetching step4 report content:", error);
      res.status(500).json({ error: "Failed to fetch step4 report content" });
    }
  });

  // Debug Prompts API - Get actual prompts used in a run
  app.get("/api/runs/:id/debug-prompts", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const run = await storage.getRun(id);
      
      if (!run) {
        return res.status(404).json({ error: "Run not found" });
      }
      
      const debugPrompts = run.debugPrompts as { entries: Array<{ step: string; prompt: string; attachments: string[]; timestamp: string }> } | null;
      
      if (!debugPrompts || !debugPrompts.entries || debugPrompts.entries.length === 0) {
        return res.json({ 
          available: false, 
          message: "デバッグプロンプトが利用できません。このRunはプロンプト記録機能追加前に実行された可能性があります。",
          entries: [] 
        });
      }
      
      res.json({ 
        available: true, 
        entries: debugPrompts.entries 
      });
    } catch (error) {
      console.error("Error fetching debug prompts:", error);
      res.status(500).json({ error: "Failed to fetch debug prompts" });
    }
  });

  // Prompt Management API
  const DEFAULT_PROMPTS: Record<number, string> = {
    21: STEP2_1_DEEP_RESEARCH_PROMPT,
    22: STEP2_2_DEEP_RESEARCH_PROMPT,
    2: STEP2_PROMPT,
    3: STEP3_INDIVIDUAL_PROMPT,
    4: STEP4_INDIVIDUAL_PROMPT,
    5: STEP5_INDIVIDUAL_PROMPT,
  };
  
  const VALID_STEP_NUMBERS = [21, 22, 2, 3, 4, 5];

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

  // Export all active prompts as structured data (must be before :stepNumber routes)
  const STEP_NAMES_FOR_EXPORT: Record<number, string> = {
    21: "Step 2-1: 発散・選定フェーズ",
    22: "Step 2-2: 収束・深掘りフェーズ",
    3: "Step 3: 科学的評価",
    4: "Step 4: 戦略監査",
    5: "Step 5: 統合出力",
  };

  app.get("/api/prompts/export", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const exportSteps = [21, 22, 3, 4, 5];
      const results: Array<{
        stepNumber: number;
        stepName: string;
        isCustom: boolean;
        version: number | null;
        content: string;
      }> = [];

      for (const stepNumber of exportSteps) {
        const activePrompt = await storage.getActivePrompt(stepNumber);
        const defaultPrompt = DEFAULT_PROMPTS[stepNumber] || "";
        
        results.push({
          stepNumber,
          stepName: STEP_NAMES_FOR_EXPORT[stepNumber] || `Step ${stepNumber}`,
          isCustom: !!activePrompt,
          version: activePrompt?.version ?? null,
          content: activePrompt?.content || defaultPrompt,
        });
      }

      res.json(results);
    } catch (error) {
      console.error("Error exporting prompts:", error);
      res.status(500).json({ error: "Failed to export prompts" });
    }
  });

  // Available files for File Search per step
  // Each step can attach input files and/or previous step outputs
  interface AvailableFile {
    id: string;
    name: string;
    description: string;
    category: 'input' | 'step_output';
  }
  
  const AVAILABLE_FILES_BY_STEP: Record<number, AvailableFile[]> = {
    21: [
      { id: 'target_specification', name: 'ターゲット仕様書', description: '対象市場・顧客要件の仕様書', category: 'input' },
      { id: 'technical_assets', name: '技術資産リスト', description: '保有技術・素材のリスト', category: 'input' },
      { id: 'previous_hypotheses', name: '既出仮説', description: '過去に生成された仮説リスト（重複回避用、存在する場合のみ）', category: 'step_output' },
    ],
    22: [
      { id: 'target_specification', name: 'ターゲット仕様書', description: '対象市場・顧客要件の仕様書', category: 'input' },
      { id: 'technical_assets', name: '技術資産リスト', description: '保有技術・素材のリスト', category: 'input' },
      { id: 'hypothesis_context', name: '仮説コンテキスト', description: 'STEP2-1で選定された仮説の詳細', category: 'step_output' },
    ],
    3: [
      { id: 'target_specification', name: 'ターゲット仕様書', description: '対象市場・顧客要件の仕様書', category: 'input' },
      { id: 'technical_assets', name: '技術資産リスト', description: '保有技術・素材のリスト', category: 'input' },
      { id: 'step2_2_report', name: 'STEP2-2レポート', description: 'この仮説のDeep Researchレポート', category: 'step_output' },
    ],
    4: [
      { id: 'target_specification', name: 'ターゲット仕様書', description: '対象市場・顧客要件の仕様書', category: 'input' },
      { id: 'technical_assets', name: '技術資産リスト', description: '保有技術・素材のリスト', category: 'input' },
      { id: 'step2_2_report', name: 'STEP2-2レポート', description: 'この仮説のDeep Researchレポート', category: 'step_output' },
      { id: 'step3_output', name: 'STEP3出力', description: 'STEP3の科学的評価結果', category: 'step_output' },
    ],
    5: [
      { id: 'step2_2_report', name: 'STEP2-2レポート', description: 'この仮説のDeep Researchレポート', category: 'step_output' },
      { id: 'step3_output', name: 'STEP3出力', description: 'STEP3の科学的評価結果', category: 'step_output' },
      { id: 'step4_output', name: 'STEP4出力', description: 'STEP4の戦略監査結果', category: 'step_output' },
    ],
  };

  // Get available files and current attachment settings for a step
  app.get("/api/file-attachments/:stepNumber", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const stepNumber = parseInt(req.params.stepNumber);
      if (![21, 22, 3, 4, 5].includes(stepNumber)) {
        return res.status(400).json({ error: "Invalid step number" });
      }

      const availableFiles = AVAILABLE_FILES_BY_STEP[stepNumber] || [];
      const setting = await storage.getStepFileAttachment(stepNumber);
      const attachedFiles = (setting?.attachedFiles as string[]) || [];

      res.json({
        stepNumber,
        availableFiles,
        attachedFiles,
      });
    } catch (error) {
      console.error("Error fetching file attachments:", error);
      res.status(500).json({ error: "Failed to fetch file attachments" });
    }
  });

  // Update file attachment settings for a step
  app.put("/api/file-attachments/:stepNumber", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const stepNumber = parseInt(req.params.stepNumber);
      if (![21, 22, 3, 4, 5].includes(stepNumber)) {
        return res.status(400).json({ error: "Invalid step number" });
      }

      const { attachedFiles } = req.body;
      if (!Array.isArray(attachedFiles)) {
        return res.status(400).json({ error: "attachedFiles must be an array" });
      }

      // Validate that all files are valid for this step
      const availableIds = (AVAILABLE_FILES_BY_STEP[stepNumber] || []).map(f => f.id);
      const invalidFiles = attachedFiles.filter((id: string) => !availableIds.includes(id));
      if (invalidFiles.length > 0) {
        return res.status(400).json({ error: `Invalid file IDs: ${invalidFiles.join(', ')}` });
      }

      const setting = await storage.setStepFileAttachment(stepNumber, attachedFiles);
      res.json(setting);
    } catch (error) {
      console.error("Error updating file attachments:", error);
      res.status(500).json({ error: "Failed to update file attachments" });
    }
  });

  app.get("/api/prompts/:stepNumber", isAuthenticated, requireAgcDomain, async (req, res) => {
    try {
      const stepNumber = parseInt(req.params.stepNumber);
      if (!VALID_STEP_NUMBERS.includes(stepNumber)) {
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
      if (!VALID_STEP_NUMBERS.includes(stepNumber)) {
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
      if (!VALID_STEP_NUMBERS.includes(stepNumber)) {
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
