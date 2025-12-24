import { GoogleGenAI } from "@google/genai";
import { storage } from "./storage";
import { STEP2_PROMPT, STEP3_PROMPT, STEP4_PROMPT, STEP5_PROMPT } from "./prompts";
import type { InsertHypothesis } from "@shared/schema";

function checkAIConfiguration(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

let ai: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!checkAIConfiguration()) {
    throw new Error("GEMINI_API_KEY not configured. Please set your API key in secrets.");
  }
  
  if (!ai) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!,
    });
  }
  
  return ai;
}

interface PipelineContext {
  targetSpec: string;
  technicalAssets: string;
  hypothesisCount: number;
  previousHypotheses?: string;
  step2Output?: string;
  step3Output?: string;
  step4Output?: string;
  step5Output?: string;
}

async function generateWithGemini(prompt: string): Promise<string> {
  try {
    const client = getAIClient();
    const response = await client.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        maxOutputTokens: 65536,
        temperature: 1.0,
        topP: 0.95,
        topK: 64,
      },
    });
    
    return response.text || "";
  } catch (error) {
    console.error("Gemini API error:", error);
    throw error;
  }
}

async function executeStep2(context: PipelineContext): Promise<string> {
  let prompt = STEP2_PROMPT
    .replace(/{HYPOTHESIS_COUNT}/g, context.hypothesisCount.toString())
    .replace("{TARGET_SPEC}", context.targetSpec)
    .replace("{TECHNICAL_ASSETS}", context.technicalAssets);
  
  if (context.previousHypotheses) {
    prompt = prompt.replace("{PREVIOUS_HYPOTHESES}", context.previousHypotheses);
  } else {
    prompt = prompt.replace("{PREVIOUS_HYPOTHESES}", "なし（初回実行）");
  }
  
  return generateWithGemini(prompt);
}

async function executeStep3(context: PipelineContext): Promise<string> {
  const prompt = STEP3_PROMPT
    .replace(/{HYPOTHESIS_COUNT}/g, context.hypothesisCount.toString())
    .replace("{TECHNICAL_ASSETS}", context.technicalAssets)
    .replace("{STEP2_OUTPUT}", context.step2Output || "");
  
  return generateWithGemini(prompt);
}

async function executeStep4(context: PipelineContext): Promise<string> {
  const prompt = STEP4_PROMPT
    .replace(/{HYPOTHESIS_COUNT}/g, context.hypothesisCount.toString())
    .replace("{TECHNICAL_ASSETS}", context.technicalAssets)
    .replace("{STEP2_OUTPUT}", context.step2Output || "")
    .replace("{STEP3_OUTPUT}", context.step3Output || "");
  
  return generateWithGemini(prompt);
}

async function executeStep5(context: PipelineContext): Promise<string> {
  const prompt = STEP5_PROMPT
    .replace(/{HYPOTHESIS_COUNT}/g, context.hypothesisCount.toString())
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

function extractHypothesesFromTSV(
  tsv: string,
  projectId: number,
  runId: number
): InsertHypothesis[] {
  const data = parseTSVToJSON(tsv);
  
  return data.map((row, index): InsertHypothesis => {
    const rawNumber = row["仮説番号"] || "";
    const parsedNumber = parseInt(rawNumber);
    const hypothesisNumber = isNaN(parsedNumber) ? index + 1 : parsedNumber;
    
    const parseIntOrNull = (value: string | undefined): number | null => {
      if (!value) return null;
      const parsed = parseInt(value);
      return isNaN(parsed) ? null : parsed;
    };
    
    return {
      projectId,
      runId,
      hypothesisNumber,
      title: row["仮説タイトル"] || `仮説 ${hypothesisNumber}`,
      industry: row["業界"] || null,
      field: row["分野"] || null,
      stage: row["素材が活躍する舞台"] || null,
      role: row["素材の役割"] || null,
      summary: row["事業仮説概要"] || null,
      customerProblem: row["顧客の解決不能な課題"] || null,
      scientificJudgment: row["科学×経済判定"] || null,
      scientificScore: parseIntOrNull(row["科学×経済スコア"]),
      strategicJudgment: row["戦略判定"] || row["キャッチアップ判定"] || null,
      strategicWinLevel: row["戦略勝算レベル"] || null,
      catchupScore: parseIntOrNull(row["キャッチアップスコア"]),
      totalScore: parseIntOrNull(row["総合スコア"]),
      fullData: row,
    };
  });
}

async function getPreviousHypothesesSummary(projectId: number): Promise<string> {
  const hypotheses = await storage.getHypothesesByProject(projectId);
  
  if (hypotheses.length === 0) {
    return "";
  }
  
  const summaryLines = hypotheses.map((h, index) => {
    return `${index + 1}. 【${h.title}】\n   業界: ${h.industry || "不明"} / 分野: ${h.field || "不明"}\n   概要: ${h.summary || "概要なし"}\n   判定: ${h.scientificJudgment || "未評価"} / ${h.strategicJudgment || "未評価"}`;
  });
  
  return summaryLines.join("\n\n");
}

export async function executeGMethodPipeline(runId: number): Promise<void> {
  try {
    if (!checkAIConfiguration()) {
      await storage.updateRun(runId, {
        status: "error",
        errorMessage: "GEMINI_API_KEY が設定されていません。Secretsに APIキーを設定してください。",
      });
      return;
    }

    const run = await storage.getRun(runId);
    if (!run) {
      throw new Error("Run not found");
    }

    const targetSpec = await storage.getResource(run.targetSpecId);
    const technicalAssets = await storage.getResource(run.technicalAssetsId);

    if (!targetSpec || !technicalAssets) {
      throw new Error("Resources not found");
    }

    const previousHypotheses = await getPreviousHypothesesSummary(run.projectId);

    const context: PipelineContext = {
      targetSpec: targetSpec.content,
      technicalAssets: technicalAssets.content,
      hypothesisCount: run.hypothesisCount || 5,
      previousHypotheses,
    };

    await storage.updateRun(runId, { status: "running", currentStep: 2 });

    console.log(`[Run ${runId}] Starting Step 2...`);
    context.step2Output = await executeStep2(context);
    await storage.updateRun(runId, { step2Output: context.step2Output, currentStep: 3 });

    console.log(`[Run ${runId}] Starting Step 3...`);
    context.step3Output = await executeStep3(context);
    await storage.updateRun(runId, { step3Output: context.step3Output, currentStep: 4 });

    console.log(`[Run ${runId}] Starting Step 4...`);
    context.step4Output = await executeStep4(context);
    await storage.updateRun(runId, { step4Output: context.step4Output, currentStep: 5 });

    console.log(`[Run ${runId}] Starting Step 5...`);
    context.step5Output = await executeStep5(context);
    
    const integratedList = parseTSVToJSON(context.step5Output);
    
    await storage.updateRun(runId, {
      step5Output: context.step5Output,
      integratedList,
      status: "completed",
      completedAt: new Date(),
      currentStep: 5,
    });

    const hypothesesData = extractHypothesesFromTSV(
      context.step5Output,
      run.projectId,
      runId
    );
    
    if (hypothesesData.length > 0) {
      await storage.createHypotheses(hypothesesData);
      console.log(`[Run ${runId}] Saved ${hypothesesData.length} hypotheses to database`);
    }

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
