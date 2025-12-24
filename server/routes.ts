import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertResourceSchema, insertHypothesisRunSchema } from "@shared/schema";
import { executeGMethodPipeline } from "./gmethod-pipeline";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Projects CRUD
  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
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

  app.post("/api/projects", async (req, res) => {
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

  app.delete("/api/projects/:id", async (req, res) => {
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
  app.get("/api/projects/:projectId/resources", async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const resources = await storage.getResourcesByProject(projectId);
      res.json(resources);
    } catch (error) {
      console.error("Error fetching resources:", error);
      res.status(500).json({ error: "Failed to fetch resources" });
    }
  });

  app.post("/api/projects/:projectId/resources", async (req, res) => {
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

  app.delete("/api/projects/:projectId/resources/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteResource(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting resource:", error);
      res.status(500).json({ error: "Failed to delete resource" });
    }
  });

  // Hypothesis Runs
  app.get("/api/projects/:projectId/runs", async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const runs = await storage.getRunsByProject(projectId);
      res.json(runs);
    } catch (error) {
      console.error("Error fetching runs:", error);
      res.status(500).json({ error: "Failed to fetch runs" });
    }
  });

  app.post("/api/projects/:projectId/runs", async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const result = insertHypothesisRunSchema.safeParse({ ...req.body, projectId });
      if (!result.success) {
        return res.status(400).json({ error: "Invalid run data", details: result.error });
      }
      
      const run = await storage.createRun(result.data);
      
      // Start pipeline execution asynchronously
      executeGMethodPipeline(run.id).catch((error) => {
        console.error("Pipeline execution error:", error);
      });
      
      res.status(201).json(run);
    } catch (error) {
      console.error("Error creating run:", error);
      res.status(500).json({ error: "Failed to create run" });
    }
  });

  app.get("/api/runs/:id", async (req, res) => {
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

  // Hypotheses
  app.get("/api/projects/:projectId/hypotheses", async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const hypotheses = await storage.getHypothesesByProject(projectId);
      res.json(hypotheses);
    } catch (error) {
      console.error("Error fetching hypotheses:", error);
      res.status(500).json({ error: "Failed to fetch hypotheses" });
    }
  });

  app.delete("/api/hypotheses/:id", async (req, res) => {
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
  app.get("/api/runs/:id/download", async (req, res) => {
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

  return httpServer;
}
