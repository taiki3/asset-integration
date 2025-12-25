import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertResourceSchema, insertHypothesisRunSchema, insertPromptVersionSchema } from "@shared/schema";
import { STEP2_PROMPT, STEP2_1_DEEP_RESEARCH_PROMPT, STEP2_2_DEEP_RESEARCH_PROMPT, STEP3_PROMPT, STEP4_PROMPT, STEP5_PROMPT } from "./prompts";
import { executeGMethodPipeline, requestPause, requestResume, requestStop, resumePipeline } from "./gmethod-pipeline";
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
      
      // Generate default job name if not provided (YYMMDDHHMM format)
      if (!runData.jobName) {
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        runData.jobName = `${yy}${mm}${dd}${hh}${min}`;
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

  // Prompt Management API
  const DEFAULT_PROMPTS: Record<number, string> = {
    21: STEP2_1_DEEP_RESEARCH_PROMPT,
    22: STEP2_2_DEEP_RESEARCH_PROMPT,
    2: STEP2_PROMPT,
    3: STEP3_PROMPT,
    4: STEP4_PROMPT,
    5: STEP5_PROMPT,
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
