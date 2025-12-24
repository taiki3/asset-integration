import { GoogleGenAI } from "@google/genai";
import { storage } from "./storage";
import { STEP2_PROMPT, STEP3_PROMPT, STEP4_PROMPT, STEP5_PROMPT } from "./prompts";

// Check for required environment variables
function checkAIConfiguration(): boolean {
  return !!(
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY &&
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
  );
}

// Initialize Gemini client using Replit AI Integrations (lazy initialization)
let ai: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!checkAIConfiguration()) {
    throw new Error("AI integration not configured. Please ensure Gemini API credentials are set up.");
  }
  
  if (!ai) {
    ai = new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY!,
      httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL!,
      },
    });
  }
  
  return ai;
}

interface PipelineContext {
  targetSpec: string;
  technicalAssets: string;
  step2Output?: string;
  step3Output?: string;
  step4Output?: string;
  step5Output?: string;
}

async function generateWithGemini(prompt: string): Promise<string> {
  try {
    const client = getAIClient();
    const response = await client.models.generateContent({
      model: "gemini-2.5-pro",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        maxOutputTokens: 8192,
      },
    });
    
    return response.text || "";
  } catch (error) {
    console.error("Gemini API error:", error);
    throw error;
  }
}

async function executeStep2(context: PipelineContext): Promise<string> {
  const prompt = STEP2_PROMPT
    .replace("{TARGET_SPEC}", context.targetSpec)
    .replace("{TECHNICAL_ASSETS}", context.technicalAssets);
  
  return generateWithGemini(prompt);
}

async function executeStep3(context: PipelineContext): Promise<string> {
  const prompt = STEP3_PROMPT
    .replace("{TECHNICAL_ASSETS}", context.technicalAssets)
    .replace("{STEP2_OUTPUT}", context.step2Output || "");
  
  return generateWithGemini(prompt);
}

async function executeStep4(context: PipelineContext): Promise<string> {
  const prompt = STEP4_PROMPT
    .replace("{TECHNICAL_ASSETS}", context.technicalAssets)
    .replace("{STEP2_OUTPUT}", context.step2Output || "")
    .replace("{STEP3_OUTPUT}", context.step3Output || "");
  
  return generateWithGemini(prompt);
}

async function executeStep5(context: PipelineContext): Promise<string> {
  const prompt = STEP5_PROMPT
    .replace("{STEP2_OUTPUT}", context.step2Output || "")
    .replace("{STEP3_OUTPUT}", context.step3Output || "")
    .replace("{STEP4_OUTPUT}", context.step4Output || "");
  
  return generateWithGemini(prompt);
}

function parseTSVToJSON(tsv: string): Record<string, string>[] {
  const lines = tsv.trim().split("\n");
  if (lines.length < 2) return [];
  
  const headers = lines[0].split("\t");
  const data: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split("\t");
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header.trim()] = values[index]?.trim() || "";
    });
    data.push(row);
  }
  
  return data;
}

export async function executeGMethodPipeline(runId: number): Promise<void> {
  try {
    // Check AI configuration before starting
    if (!checkAIConfiguration()) {
      await storage.updateRun(runId, {
        status: "error",
        errorMessage: "AI integration not configured. Please contact administrator to set up Gemini API credentials.",
      });
      return;
    }

    // Get the run details
    const run = await storage.getRun(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    // Get the resources
    const targetSpec = await storage.getResource(run.targetSpecId);
    const technicalAssets = await storage.getResource(run.technicalAssetsId);

    if (!targetSpec || !technicalAssets) {
      throw new Error("Resources not found");
    }

    const context: PipelineContext = {
      targetSpec: targetSpec.content,
      technicalAssets: technicalAssets.content,
    };

    // Update status to running
    await storage.updateRun(runId, { status: "running", currentStep: 2 });

    // Step 2: Proposal
    console.log(`[Run ${runId}] Starting Step 2...`);
    context.step2Output = await executeStep2(context);
    await storage.updateRun(runId, { step2Output: context.step2Output, currentStep: 3 });

    // Step 3: Scientific Evaluation
    console.log(`[Run ${runId}] Starting Step 3...`);
    context.step3Output = await executeStep3(context);
    await storage.updateRun(runId, { step3Output: context.step3Output, currentStep: 4 });

    // Step 4: Strategic Audit
    console.log(`[Run ${runId}] Starting Step 4...`);
    context.step4Output = await executeStep4(context);
    await storage.updateRun(runId, { step4Output: context.step4Output, currentStep: 5 });

    // Step 5: Integration
    console.log(`[Run ${runId}] Starting Step 5...`);
    context.step5Output = await executeStep5(context);
    
    // Parse TSV to JSON for structured storage
    const integratedList = parseTSVToJSON(context.step5Output);
    
    await storage.updateRun(runId, {
      step5Output: context.step5Output,
      integratedList,
      status: "completed",
      completedAt: new Date(),
      currentStep: 5,
    });

    console.log(`[Run ${runId}] Pipeline completed successfully`);
  } catch (error) {
    console.error(`[Run ${runId}] Pipeline error:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    await storage.updateRun(runId, {
      status: "error",
      errorMessage: errorMessage,
    });
  }
}
