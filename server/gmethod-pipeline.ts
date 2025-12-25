import { GoogleGenAI } from "@google/genai";
import { storage } from "./storage";
import { STEP2_PROMPT, STEP2_DEEP_RESEARCH_PROMPT, STEP3_PROMPT, STEP4_PROMPT, STEP5_PROMPT } from "./prompts";
import type { InsertHypothesis } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { waitForDeepResearchRateLimit as sharedWaitForRateLimit } from "./deep-research";

// Debug logger that writes to both console and file
const LOG_FILE = "/tmp/gmethod-debug.log";
function debugLog(message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  console.log(message);
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (e) {
    // ignore file write errors
  }
}

const MODEL_PRO = "gemini-3-pro-preview";
const MODEL_FLASH = "gemini-3-flash-preview";
const DEEP_RESEARCH_AGENT = "deep-research-pro-preview-12-2025";

// Pause/Stop request management
const pauseRequests = new Map<number, boolean>();
const stopRequests = new Map<number, boolean>();

export function requestPause(runId: number): void {
  pauseRequests.set(runId, true);
}

export function requestResume(runId: number): void {
  pauseRequests.delete(runId);
}

export function requestStop(runId: number): void {
  stopRequests.set(runId, true);
}

export function isPauseRequested(runId: number): boolean {
  return pauseRequests.get(runId) === true;
}

export function isStopRequested(runId: number): boolean {
  return stopRequests.get(runId) === true;
}

export function clearControlRequests(runId: number): void {
  pauseRequests.delete(runId);
  stopRequests.delete(runId);
}

// Deep Research rate limiting is now handled by shared module (deep-research.ts)

// Get prompt for a step - uses DB version if available, otherwise default
async function getPromptForStep(stepNumber: number): Promise<string> {
  const DEFAULT_PROMPTS: Record<number, string> = {
    2: STEP2_PROMPT,
    3: STEP3_PROMPT,
    4: STEP4_PROMPT,
    5: STEP5_PROMPT,
  };
  
  const defaultPrompt = DEFAULT_PROMPTS[stepNumber];
  if (!defaultPrompt) {
    throw new Error(`No default prompt found for Step ${stepNumber}`);
  }
  
  try {
    const activePrompt = await storage.getActivePrompt(stepNumber);
    if (activePrompt && activePrompt.content.trim()) {
      console.log(`[Pipeline] Using custom prompt v${activePrompt.version} for Step ${stepNumber}`);
      return activePrompt.content;
    }
  } catch (error) {
    console.log(`[Pipeline] Error fetching custom prompt for Step ${stepNumber}, using default`);
  }
  
  return defaultPrompt;
}

// Get Deep Research prompt (no data embedding - uses File Search)
// Internal engineer's approach: prompt.md as-is, data files uploaded to File Search
function getDeepResearchPrompt(): string {
  return STEP2_DEEP_RESEARCH_PROMPT;
}

function checkAIConfiguration(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let ai: GoogleGenAI | null = null;

interface FileSearchContext {
  storeName: string;
  fileNames: string[];
}

async function createFileSearchStore(displayName: string): Promise<string> {
  const client = getAIClient();
  const store = await (client as any).fileSearchStores.create({
    config: { displayName }
  });
  console.log(`Created File Search Store: ${store.name}`);
  return store.name;
}

async function uploadTextToFileSearchStore(
  storeName: string, 
  content: string, 
  displayName: string
): Promise<string> {
  const client = getAIClient();
  
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `${displayName.replace(/[^a-zA-Z0-9]/g, '_')}.txt`);
  fs.writeFileSync(tempFile, content, 'utf-8');
  
  try {
    let operation = await (client as any).fileSearchStores.uploadToFileSearchStore({
      file: tempFile,
      fileSearchStoreName: storeName,
      config: { displayName }
    });
    
    while (!operation.done) {
      await sleep(3000);
      operation = await (client as any).operations.get({ operation });
    }
    
    console.log(`Uploaded file to store: ${displayName}`);
    return displayName;
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

async function deleteFileSearchStore(storeName: string): Promise<void> {
  try {
    const client = getAIClient();
    await (client as any).fileSearchStores.delete({
      name: storeName,
      config: { force: true }
    });
    console.log(`Deleted File Search Store: ${storeName}`);
  } catch (error) {
    console.warn(`Failed to delete File Search Store ${storeName}:`, error);
  }
}

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
  searchResults?: string;
}

interface DeepResearchResult {
  report: string;
  searchQueries: string[];
  iterationCount: number;
  validationResult: ValidationResult;
}

interface ValidationResult {
  hypothesisCount: number;
  isValid: boolean;
  errors: string[];
  extractedHypotheses: ExtractedHypothesis[];
}

interface ExtractedHypothesis {
  title: string;
  tradeoff: string;
  mechanism: string;
  moat: string;
}

async function generateWithModel(
  prompt: string, 
  model: string,
  useSearch: boolean = false
): Promise<string> {
  try {
    const client = getAIClient();
    
    const config: any = {
      maxOutputTokens: 65536,
      temperature: model === MODEL_PRO ? 1.0 : 0.7,
      topP: 0.95,
      topK: 64,
    };

    const tools: any[] = [];
    if (useSearch) {
      tools.push({ googleSearchRetrieval: {} });
    }

    const response = await client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config,
      ...(tools.length > 0 ? { tools } : {}),
    });
    
    return response.text || "";
  } catch (error) {
    console.error(`Gemini API error (${model}):`, error);
    throw error;
  }
}

async function generateWithPro(prompt: string): Promise<string> {
  return generateWithModel(prompt, MODEL_PRO, false);
}

async function generateWithFlash(prompt: string): Promise<string> {
  return generateWithModel(prompt, MODEL_FLASH, false);
}

async function generateWithFlashAndSearch(prompt: string): Promise<string> {
  return generateWithModel(prompt, MODEL_FLASH, true);
}

const PLANNING_PROMPT = `あなたは事業仮説のリサーチプランナーです。

以下の「ターゲット指定」と「技術資産」を分析し、事業仮説を生成するために必要な調査クエリを5〜10個生成してください。

【ターゲット指定】
{TARGET_SPEC}

【技術資産】
{TECHNICAL_ASSETS}

【過去に生成した仮説（重複回避用）】
{PREVIOUS_HYPOTHESES}

以下の観点で検索クエリを生成してください：
1. 対象業界・分野の市場動向とトレンド
2. 顧客が抱える解決困難な課題
3. 競合技術や代替ソリューション
4. 技術の応用可能性と新規用途
5. 規制・標準化の動向

出力形式（JSON）:
{
  "analysis": "分析の要約（200字以内）",
  "queries": [
    "検索クエリ1",
    "検索クエリ2",
    ...
  ]
}`;

const EXPLORATION_PROMPT = `以下の検索クエリに基づいて、事業仮説の生成に必要な情報を収集してください。

【検索クエリ】
{QUERIES}

【ターゲット指定】
{TARGET_SPEC}

【技術資産】
{TECHNICAL_ASSETS}

各クエリについて、関連する情報を収集し、事業仮説の立案に役立つ知見をまとめてください。
市場規模、顧客課題、技術トレンド、競合状況などの情報を重視してください。`;

const REASONING_PROMPT = `あなたは事業仮説レポートの品質評価者です。

以下の収集情報を確認し、{HYPOTHESIS_COUNT}件の事業仮説を生成するのに十分な情報が揃っているか判定してください。

【収集した情報】
{SEARCH_RESULTS}

【ターゲット指定】
{TARGET_SPEC}

【技術資産】
{TECHNICAL_ASSETS}

以下の要件を満たせるか確認してください：
1. 各仮説について、顧客の物理的トレードオフ（矛盾）を特定できるか
2. 技術がそのトレードオフを解決するメカニズムを説明できるか
3. 競争優位性（参入障壁・Moat）を説明できるか
4. 対象業界・分野を明確に特定できるか

出力形式（JSON）:
{
  "isSufficient": true/false,
  "missingAspects": ["不足している情報1", "不足している情報2"],
  "additionalQueries": ["追加検索クエリ1", "追加検索クエリ2"],
  "confidence": 0.0-1.0
}`;

const EXTRACTION_PROMPT = `以下の事業仮説レポートから、各仮説の構造化データを抽出してください。

【レポート】
{REPORT}

各仮説について以下の4要素をJSON形式で抽出してください：
1. title: 仮説タイトル
2. tradeoff: 解決する物理的矛盾（Trade-off）
3. mechanism: メカニズム（S-P-P連結：Structure-Process-Property）
4. moat: 競争優位性（参入障壁）

出力形式:
{
  "hypotheses": [
    {
      "title": "仮説タイトル",
      "tradeoff": "解決する矛盾の説明",
      "mechanism": "技術的メカニズムの説明",
      "moat": "競争優位性の説明"
    }
  ]
}`;

interface StepTiming {
  startTime: number;
  endTime?: number;
  durationMs?: number;
}

interface ProgressInfo {
  planningAnalysis?: string;
  planningQueries?: string[];
  currentPhase?: string;
  currentIteration?: number;
  maxIterations?: number;
  stepTimings?: { [key: string]: number };
  phaseStartTime?: number;
  stepStartTime?: number;
  stepDurations?: {
    step2?: StepTiming;
    step3?: StepTiming;
    step4?: StepTiming;
    step5?: StepTiming;
  };
}

async function updateProgress(runId: number, progressInfo: ProgressInfo): Promise<void> {
  const run = await storage.getRun(runId);
  const existingProgress = (run?.progressInfo as ProgressInfo) || {};
  const mergedProgress = {
    ...existingProgress,
    ...progressInfo,
    stepDurations: {
      ...existingProgress.stepDurations,
      ...progressInfo.stepDurations,
    },
  };
  await storage.updateRun(runId, { progressInfo: mergedProgress });
}

async function updateStepDuration(
  runId: number, 
  stepKey: 'step2' | 'step3' | 'step4' | 'step5', 
  timing: StepTiming
): Promise<void> {
  const run = await storage.getRun(runId);
  const existingProgress = (run?.progressInfo as ProgressInfo) || {};
  const stepDurations = existingProgress.stepDurations || {};
  stepDurations[stepKey] = timing;
  await updateProgress(runId, { stepDurations });
}

async function executeDeepResearchStep2(context: PipelineContext, runId: number): Promise<DeepResearchResult> {
  const stepTimings: { [key: string]: number } = {};
  const startTime = Date.now();
  let fileSearchStoreName: string | null = null;

  await updateProgress(runId, { 
    currentPhase: "deep_research_starting", 
    currentIteration: 0, 
    maxIterations: 1,
    stepTimings,
    stepStartTime: startTime,
  });

  console.log(`[Run ${runId}] Starting Deep Research API with File Search...`);

  const client = getAIClient();
  
  try {
    await updateProgress(runId, { 
      currentPhase: "uploading_files", 
      currentIteration: 0, 
      maxIterations: 1,
      planningAnalysis: "データをFile Searchストアにアップロード中...",
      stepTimings,
      stepStartTime: startTime,
    });

    fileSearchStoreName = await createFileSearchStore(`gmethod-run-${runId}-${Date.now()}`);
    console.log(`[Run ${runId}] Created File Search Store: ${fileSearchStoreName}`);

    await uploadTextToFileSearchStore(
      fileSearchStoreName,
      context.targetSpec,
      "target_specification"
    );
    console.log(`[Run ${runId}] Uploaded target specification`);

    await uploadTextToFileSearchStore(
      fileSearchStoreName,
      context.technicalAssets,
      "technical_assets"
    );
    console.log(`[Run ${runId}] Uploaded technical assets`);

    if (context.previousHypotheses) {
      await uploadTextToFileSearchStore(
        fileSearchStoreName,
        context.previousHypotheses,
        "previous_hypotheses"
      );
      console.log(`[Run ${runId}] Uploaded previous hypotheses`);
    }

    stepTimings["file_upload"] = Date.now() - startTime;

    // Use Deep Research prompt (no data embedding - File Search references attached files)
    // Internal engineer's approach: 19KB prompt + File Search for data files
    const researchPrompt = getDeepResearchPrompt();
    console.log(`[Run ${runId}] Prompt: ${researchPrompt.length} chars, ${Buffer.byteLength(researchPrompt, 'utf-8')} bytes`);

    await updateProgress(runId, { 
      currentPhase: "deep_research_starting", 
      currentIteration: 0, 
      maxIterations: 1,
      planningAnalysis: "Deep Research エージェントを起動中...",
      stepTimings,
      stepStartTime: startTime,
    });

    debugLog(`[Run ${runId}] Starting Deep Research with File Search Store: ${fileSearchStoreName}`);
    debugLog(`[Run ${runId}] Prompt length: ${researchPrompt.length} chars`);
    
    // Wait for rate limit before making Deep Research request (using shared module)
    await sharedWaitForRateLimit();
    
    let interactionId: string;
    try {
      debugLog(`[Run ${runId}] Calling interactions.create with stream: true`);
      // Use stream: true to avoid 400 errors (required by Deep Research API)
      const stream = await (client as any).interactions.create({
        input: researchPrompt,
        agent: DEEP_RESEARCH_AGENT,
        background: true,
        stream: true,
        tools: [
          { type: 'file_search', file_search_store_names: [fileSearchStoreName] }
        ],
        agent_config: {
          type: 'deep-research',
          thinking_summaries: 'auto'
        }
      });
      
      debugLog(`[Run ${runId}] Stream created, waiting for interaction.start event`);
      
      // Get interaction ID from first stream event
      for await (const chunk of stream as AsyncIterable<any>) {
        debugLog(`[Run ${runId}] Stream event: ${chunk.event_type}`);
        if (chunk.event_type === 'interaction.start' && chunk.interaction?.id) {
          interactionId = chunk.interaction.id;
          debugLog(`[Run ${runId}] Stream started, Interaction ID: ${interactionId}`);
          break;
        }
      }
      
      if (!interactionId!) {
        throw new Error('Failed to get interaction ID from stream');
      }
    } catch (apiError: any) {
      debugLog(`[Run ${runId}] Deep Research API Error: ${apiError.message}`);
      debugLog(`[Run ${runId}] Error details: ${JSON.stringify(apiError, null, 2)}`);
      throw new Error(`Deep Research APIの起動に失敗しました: ${apiError.message}`);
    }
    debugLog(`[Run ${runId}] Deep Research Task Started. Interaction ID: ${interactionId}`);

    await updateProgress(runId, { 
      currentPhase: "deep_research_running", 
      currentIteration: 0, 
      maxIterations: 1,
      planningAnalysis: "Deep Research エージェントが調査中です...",
      stepTimings,
      stepStartTime: startTime,
    });

    let report = "";
    let pollCount = 0;
    const maxPollTime = 30 * 60 * 1000;
    const pollInterval = 15000;

    while (Date.now() - startTime < maxPollTime) {
      pollCount++;
      await sleep(pollInterval);

      try {
        const currentStatus = await (client as any).interactions.get(interactionId);
        const status = currentStatus.status;
        console.log(`[Run ${runId}] Deep Research Status: ${status} (poll ${pollCount})`);

        await updateProgress(runId, { 
          currentPhase: "deep_research_running", 
          currentIteration: pollCount, 
          maxIterations: Math.ceil(maxPollTime / pollInterval),
          planningAnalysis: `Deep Research 実行中... (${Math.floor((Date.now() - startTime) / 1000)}秒経過)`,
          stepTimings,
          stepStartTime: startTime,
        });

        if (status === "completed") {
          console.log(`[Run ${runId}] Deep Research Completed!`);
          const outputs = currentStatus.outputs || [];
          const finalOutput = outputs[outputs.length - 1];
          report = finalOutput?.text || "";
          stepTimings["deep_research"] = Date.now() - startTime;
          break;
        } else if (status === "failed") {
          console.error(`[Run ${runId}] Deep Research Failed:`, currentStatus.error);
          throw new Error(`Deep Research が失敗しました: ${currentStatus.error || "Unknown error"}`);
        }
      } catch (pollError: any) {
        if (pollError.message?.includes("Deep Research が失敗")) {
          throw pollError;
        }
        console.warn(`[Run ${runId}] Poll error (continuing):`, pollError.message);
      }
    }

    if (!report) {
      throw new Error("Deep Research がタイムアウトしました（30分経過）");
    }

    if (fileSearchStoreName) {
      await deleteFileSearchStore(fileSearchStoreName);
      fileSearchStoreName = null;
    }

    const validationStartTime = Date.now();
    await updateProgress(runId, { 
      currentPhase: "validating", 
      currentIteration: 0, 
      maxIterations: 1,
      planningAnalysis: "生成された仮説を検証中...",
      stepTimings,
      stepStartTime: startTime,
    });

    const validationResult = await validateHypotheses(report, context.hypothesisCount, runId);
    stepTimings["validation"] = Date.now() - validationStartTime;

    if (!validationResult.isValid) {
      console.log(`[Run ${runId}] Validation failed, retrying...`);
      
      const retryStartTime = Date.now();
      await updateProgress(runId, { 
        currentPhase: "retrying", 
        currentIteration: 0, 
        maxIterations: 1,
        planningAnalysis: `仮説数が不足（${validationResult.hypothesisCount}/${context.hypothesisCount}）。再生成中...`,
        stepTimings,
        stepStartTime: startTime,
      });

      const additionalNeeded = context.hypothesisCount - validationResult.hypothesisCount;
      const retryPrompt = `前回の調査結果を踏まえて、追加で${additionalNeeded}件の仮説を生成してください。

前回の結果:
${report}

追加で必要な仮説数: ${additionalNeeded}件

上記と重複しない新しい仮説を生成してください。`;

      const retryReport = await generateWithModel(retryPrompt, MODEL_PRO, true);
      report = report + "\n\n【追加生成された仮説】\n" + retryReport;
      
      const finalValidation = await validateHypotheses(report, context.hypothesisCount, runId);
      stepTimings["retry"] = Date.now() - retryStartTime;
      
      return {
        report,
        searchQueries: [],
        iterationCount: 1,
        validationResult: finalValidation
      };
    }

    return {
      report,
      searchQueries: [],
      iterationCount: 1,
      validationResult
    };
  } catch (error: any) {
    console.error(`[Run ${runId}] Deep Research Step 2 failed:`, error);
    throw new Error(`Deep Research APIの起動に失敗しました: ${error?.message || error}`);
  } finally {
    if (fileSearchStoreName) {
      await deleteFileSearchStore(fileSearchStoreName);
    }
  }
}

interface ValidationResultWithAction extends ValidationResult {
  action: "continue" | "retry" | "error";
  adjustedHypotheses?: ExtractedHypothesis[];
}

async function validateHypotheses(
  report: string, 
  expectedCount: number,
  runId: number
): Promise<ValidationResultWithAction> {
  const extractionPrompt = EXTRACTION_PROMPT.replace("{REPORT}", report);
  const extractionResult = await generateWithFlash(extractionPrompt);
  
  const result: ValidationResultWithAction = {
    hypothesisCount: 0,
    isValid: false,
    errors: [],
    extractedHypotheses: [],
    action: "continue",
  };

  try {
    const jsonMatch = extractionResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const hypotheses = parsed.hypotheses || [];
      result.hypothesisCount = hypotheses.length;
      result.extractedHypotheses = hypotheses;

      if (hypotheses.length > expectedCount) {
        console.log(`[Run ${runId}] Too many hypotheses (${hypotheses.length} > ${expectedCount}), truncating to top ${expectedCount}`);
        result.adjustedHypotheses = hypotheses.slice(0, expectedCount);
        result.hypothesisCount = expectedCount;
        result.errors.push(`仮説数が多いため上位${expectedCount}件を採用しました（生成: ${hypotheses.length}件）`);
        result.action = "continue";
      } else if (hypotheses.length < expectedCount) {
        console.log(`[Run ${runId}] Too few hypotheses (${hypotheses.length} < ${expectedCount}), needs retry`);
        result.errors.push(`仮説数が不足しています（期待: ${expectedCount}, 実際: ${hypotheses.length}）`);
        result.action = "retry";
      } else {
        result.adjustedHypotheses = hypotheses;
      }

      const targetHypotheses = result.adjustedHypotheses || hypotheses;
      targetHypotheses.forEach((h: ExtractedHypothesis, i: number) => {
        if (!h.title || h.title.trim() === "") {
          result.errors.push(`仮説${i + 1}: タイトルが空です`);
        }
        if (!h.tradeoff || h.tradeoff.trim() === "") {
          result.errors.push(`仮説${i + 1}: トレードオフが空です`);
        }
        if (!h.mechanism || h.mechanism.trim() === "") {
          result.errors.push(`仮説${i + 1}: メカニズムが空です`);
        }
        if (!h.moat || h.moat.trim() === "") {
          result.errors.push(`仮説${i + 1}: 競争優位性（Moat）が空です`);
        }
      });

      const countErrors = result.errors.filter(e => e.includes("仮説数")).length;
      const otherErrors = result.errors.length - countErrors;
      result.isValid = otherErrors === 0 && result.action === "continue";
    }
  } catch (e) {
    result.errors.push("仮説の抽出に失敗しました");
    result.action = "error";
  }

  console.log(`[Run ${runId}] Validation result: ${result.isValid ? "PASS" : "FAIL"} (action: ${result.action}, ${result.errors.length} errors)`);
  if (result.errors.length > 0) {
    console.log(`[Run ${runId}] Validation errors:`, result.errors.slice(0, 5));
  }

  return result;
}

async function executeStep3(context: PipelineContext): Promise<string> {
  const basePrompt = await getPromptForStep(3);
  const prompt = basePrompt
    .replace(/{HYPOTHESIS_COUNT}/g, context.hypothesisCount.toString())
    .replace("{TECHNICAL_ASSETS}", context.technicalAssets)
    .replace("{STEP2_OUTPUT}", context.step2Output || "");
  
  return generateWithPro(prompt);
}

async function executeStep4(context: PipelineContext): Promise<string> {
  const basePrompt = await getPromptForStep(4);
  const prompt = basePrompt
    .replace(/{HYPOTHESIS_COUNT}/g, context.hypothesisCount.toString())
    .replace("{TECHNICAL_ASSETS}", context.technicalAssets)
    .replace("{STEP2_OUTPUT}", context.step2Output || "")
    .replace("{STEP3_OUTPUT}", context.step3Output || "");
  
  return generateWithPro(prompt);
}

async function executeStep5(context: PipelineContext): Promise<string> {
  const basePrompt = await getPromptForStep(5);
  const prompt = basePrompt
    .replace(/{HYPOTHESIS_COUNT}/g, context.hypothesisCount.toString())
    .replace("{STEP2_OUTPUT}", context.step2Output || "")
    .replace("{STEP3_OUTPUT}", context.step3Output || "")
    .replace("{STEP4_OUTPUT}", context.step4Output || "");
  
  return generateWithFlash(prompt);
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
  runId: number,
  startNumber: number = 1,
  targetSpecId?: number,
  technicalAssetsId?: number
): InsertHypothesis[] {
  const data = parseTSVToJSON(tsv);
  
  return data.map((row, index): InsertHypothesis => {
    const hypothesisNumber = startNumber + index;
    
    const parseIntOrNull = (value: string | undefined): number | null => {
      if (!value) return null;
      const parsed = parseInt(value);
      return isNaN(parsed) ? null : parsed;
    };
    
    return {
      projectId,
      runId,
      targetSpecId: targetSpecId ?? null,
      technicalAssetsId: technicalAssetsId ?? null,
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

export interface ExistingHypothesisFilter {
  enabled: boolean;
  targetSpecIds: number[];
  technicalAssetsIds: number[];
}

async function getPreviousHypothesesSummary(
  projectId: number,
  filter?: ExistingHypothesisFilter
): Promise<string> {
  let hypotheses = await storage.getHypothesesByProject(projectId);
  
  // Apply filter if enabled
  if (filter?.enabled) {
    const hasTargetFilter = filter.targetSpecIds.length > 0;
    const hasAssetFilter = filter.technicalAssetsIds.length > 0;
    
    if (hasTargetFilter || hasAssetFilter) {
      hypotheses = hypotheses.filter((h) => {
        const matchesTarget = !hasTargetFilter || (h.targetSpecId && filter.targetSpecIds.includes(h.targetSpecId));
        const matchesAsset = !hasAssetFilter || (h.technicalAssetsId && filter.technicalAssetsIds.includes(h.technicalAssetsId));
        return matchesTarget && matchesAsset;
      });
    }
  }
  
  if (hypotheses.length === 0) {
    return "";
  }
  
  const summaryLines = hypotheses.map((h, index) => {
    return `${index + 1}. 【${h.title}】\n   業界: ${h.industry || "不明"} / 分野: ${h.field || "不明"}\n   概要: ${h.summary || "概要なし"}\n   判定: ${h.scientificJudgment || "未評価"} / ${h.strategicJudgment || "未評価"}`;
  });
  
  return summaryLines.join("\n\n");
}

interface Step2ResultWithRetry {
  report: string;
  searchQueries: string[];
  iterationCount: number;
  validationResult: ValidationResultWithAction;
  retried: boolean;
}

async function executeStep2WithRetry(
  context: PipelineContext,
  runId: number
): Promise<Step2ResultWithRetry> {
  console.log(`[Run ${runId}] Starting Step 2 (Deep Research)...`);
  let result = await executeDeepResearchStep2(context, runId);
  let retried = false;

  const validationResult = result.validationResult as ValidationResultWithAction;

  if (validationResult.action === "retry") {
    console.log(`[Run ${runId}] Hypothesis count insufficient, retrying Step 2...`);
    retried = true;
    
    result = await executeDeepResearchStep2(context, runId);
    const retryValidation = result.validationResult as ValidationResultWithAction;
    
    if (retryValidation.action === "retry") {
      console.error(`[Run ${runId}] Retry failed: still insufficient hypotheses`);
      throw new Error(`仮説数が不足しています。リトライ後も期待数（${context.hypothesisCount}件）を満たせませんでした（実際: ${retryValidation.hypothesisCount}件）`);
    }
    
    return {
      report: result.report,
      searchQueries: result.searchQueries,
      iterationCount: result.iterationCount,
      validationResult: retryValidation,
      retried,
    };
  }

  if (validationResult.action === "error") {
    throw new Error(`仮説の抽出に失敗しました: ${validationResult.errors.join("; ")}`);
  }

  return {
    report: result.report,
    searchQueries: result.searchQueries,
    iterationCount: result.iterationCount,
    validationResult,
    retried,
  };
}

// Check if pipeline should pause or stop after a step
async function checkPipelineControl(runId: number): Promise<"continue" | "pause" | "stop"> {
  if (isStopRequested(runId)) {
    clearControlRequests(runId);
    return "stop";
  }
  if (isPauseRequested(runId)) {
    return "pause";
  }
  return "continue";
}

export async function executeGMethodPipeline(
  runId: number,
  resumeFromStep?: number,
  existingFilter?: ExistingHypothesisFilter
): Promise<void> {
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

    const totalLoops = run.totalLoops || 1;
    const startLoop = run.currentLoop || 1;
    const startStep = resumeFromStep || 2;
    
    await storage.updateRun(runId, { status: "running", currentStep: startStep, currentLoop: startLoop });

    // Execute pipeline for each loop
    for (let loopIndex = startLoop; loopIndex <= totalLoops; loopIndex++) {
      console.log(`[Run ${runId}] Starting loop ${loopIndex}/${totalLoops}`);
      
      // Get fresh previous hypotheses for each loop (includes hypotheses from previous loops)
      // Apply existing hypothesis filter if provided
      const previousHypotheses = await getPreviousHypothesesSummary(run.projectId, existingFilter);

      const context: PipelineContext = {
        targetSpec: targetSpec.content,
        technicalAssets: technicalAssets.content,
        hypothesisCount: run.hypothesisCount || 5,
        previousHypotheses,
        // Only restore outputs if resuming in the same loop
        step2Output: loopIndex === startLoop ? (run.step2Output || undefined) : undefined,
        step3Output: loopIndex === startLoop ? (run.step3Output || undefined) : undefined,
        step4Output: loopIndex === startLoop ? (run.step4Output || undefined) : undefined,
      };

      // Determine starting step for this loop
      const loopStartStep = loopIndex === startLoop ? startStep : 2;
      await storage.updateRun(runId, { currentLoop: loopIndex, currentStep: loopStartStep });

      // Step 2: Deep Research
      if (loopStartStep <= 2) {
        const step2StartTime = Date.now();
        await updateStepDuration(runId, 'step2', { startTime: step2StartTime });
        
        let deepResearchResult = await executeStep2WithRetry(context, runId);
        context.step2Output = deepResearchResult.report;
        
        const step2EndTime = Date.now();
        await updateStepDuration(runId, 'step2', { 
          startTime: step2StartTime, 
          endTime: step2EndTime, 
          durationMs: step2EndTime - step2StartTime 
        });
        
        const validationMetadata = {
          searchQueries: deepResearchResult.searchQueries,
          iterationCount: deepResearchResult.iterationCount,
          validation: deepResearchResult.validationResult,
          validationPassed: deepResearchResult.validationResult.isValid,
          retried: deepResearchResult.retried,
        };
        console.log(`[Run ${runId}] Loop ${loopIndex} Step 2 completed in ${Math.round((step2EndTime - step2StartTime) / 1000)}s: ${deepResearchResult.iterationCount} iterations, ${deepResearchResult.searchQueries.length} queries${deepResearchResult.retried ? " (retried)" : ""}`);
        
        if (!deepResearchResult.validationResult.isValid) {
          const warningMessage = `品質検証警告: ${deepResearchResult.validationResult.errors.slice(0, 3).join("; ")}`;
          console.warn(`[Run ${runId}] ${warningMessage}`);
          await storage.updateRun(runId, { 
            step2Output: context.step2Output, 
            currentStep: 3,
            validationMetadata,
            errorMessage: warningMessage,
          });
        } else {
          await storage.updateRun(runId, { 
            step2Output: context.step2Output, 
            currentStep: 3,
            validationMetadata,
          });
        }

        // Check pause/stop after step 2
        const control = await checkPipelineControl(runId);
        if (control === "stop") {
          await storage.updateRun(runId, { status: "error", errorMessage: "ユーザーにより停止されました" });
          return;
        }
        if (control === "pause") {
          // currentStep is already 3, so resume will start at step 3
          await storage.updateRun(runId, { status: "paused" });
          console.log(`[Run ${runId}] Paused after loop ${loopIndex} step 2, will resume at step 3`);
          return;
        }
      }

      // Step 3: Scientific Evaluation
      if (loopStartStep <= 3) {
        const step3StartTime = Date.now();
        await updateStepDuration(runId, 'step3', { startTime: step3StartTime });
        
        console.log(`[Run ${runId}] Loop ${loopIndex} Starting Step 3 (Scientific Evaluation with Pro)...`);
        context.step3Output = await executeStep3(context);
        
        const step3EndTime = Date.now();
        await updateStepDuration(runId, 'step3', { 
          startTime: step3StartTime, 
          endTime: step3EndTime, 
          durationMs: step3EndTime - step3StartTime 
        });
        console.log(`[Run ${runId}] Loop ${loopIndex} Step 3 completed in ${Math.round((step3EndTime - step3StartTime) / 1000)}s`);
        
        await storage.updateRun(runId, { step3Output: context.step3Output, currentStep: 4 });

        // Check pause/stop after step 3
        const control = await checkPipelineControl(runId);
        if (control === "stop") {
          await storage.updateRun(runId, { status: "error", errorMessage: "ユーザーにより停止されました" });
          return;
        }
        if (control === "pause") {
          // currentStep is already 4, so resume will start at step 4
          await storage.updateRun(runId, { status: "paused" });
          console.log(`[Run ${runId}] Paused after loop ${loopIndex} step 3, will resume at step 4`);
          return;
        }
      }

      // Step 4: Strategic Audit
      if (loopStartStep <= 4) {
        const step4StartTime = Date.now();
        await updateStepDuration(runId, 'step4', { startTime: step4StartTime });
        
        console.log(`[Run ${runId}] Loop ${loopIndex} Starting Step 4 (Strategic Audit with Pro)...`);
        context.step4Output = await executeStep4(context);
        
        const step4EndTime = Date.now();
        await updateStepDuration(runId, 'step4', { 
          startTime: step4StartTime, 
          endTime: step4EndTime, 
          durationMs: step4EndTime - step4StartTime 
        });
        console.log(`[Run ${runId}] Loop ${loopIndex} Step 4 completed in ${Math.round((step4EndTime - step4StartTime) / 1000)}s`);
        
        await storage.updateRun(runId, { step4Output: context.step4Output, currentStep: 5 });

        // Check pause/stop after step 4
        const control = await checkPipelineControl(runId);
        if (control === "stop") {
          await storage.updateRun(runId, { status: "error", errorMessage: "ユーザーにより停止されました" });
          return;
        }
        if (control === "pause") {
          // currentStep is already 5, so resume will start at step 5
          await storage.updateRun(runId, { status: "paused" });
          console.log(`[Run ${runId}] Paused after loop ${loopIndex} step 4, will resume at step 5`);
          return;
        }
      }

      // Step 5: Integration
      const step5StartTime = Date.now();
      await updateStepDuration(runId, 'step5', { startTime: step5StartTime });
      
      console.log(`[Run ${runId}] Loop ${loopIndex} Starting Step 5 (Integration with Flash)...`);
      context.step5Output = await executeStep5(context);
      
      const step5EndTime = Date.now();
      await updateStepDuration(runId, 'step5', { 
        startTime: step5StartTime, 
        endTime: step5EndTime, 
        durationMs: step5EndTime - step5StartTime 
      });
      console.log(`[Run ${runId}] Loop ${loopIndex} Step 5 completed in ${Math.round((step5EndTime - step5StartTime) / 1000)}s`);
      
      const integratedList = parseTSVToJSON(context.step5Output);
      
      // Get the next available hypothesis number for this project
      const nextHypothesisNumber = await storage.getNextHypothesisNumber(run.projectId);
      
      const hypothesesData = extractHypothesesFromTSV(
        context.step5Output,
        run.projectId,
        runId,
        nextHypothesisNumber,
        run.targetSpecId,
        run.technicalAssetsId
      );
      
      if (hypothesesData.length > 0) {
        await storage.createHypotheses(hypothesesData);
        console.log(`[Run ${runId}] Loop ${loopIndex} Saved ${hypothesesData.length} hypotheses to database (starting from No.${nextHypothesisNumber})`);
      }

      // If this is not the last loop, clear step outputs for the next loop
      if (loopIndex < totalLoops) {
        await storage.updateRun(runId, {
          step2Output: null,
          step3Output: null,
          step4Output: null,
          step5Output: context.step5Output, // Keep last step5 output for reference
          integratedList,
        });
        
        // Check pause/stop between loops
        const control = await checkPipelineControl(runId);
        if (control === "stop") {
          await storage.updateRun(runId, { status: "error", errorMessage: "ユーザーにより停止されました" });
          return;
        }
        if (control === "pause") {
          await storage.updateRun(runId, { status: "paused", currentLoop: loopIndex + 1, currentStep: 2 });
          console.log(`[Run ${runId}] Paused after loop ${loopIndex}`);
          return;
        }
      } else {
        // Final loop completed
        await storage.updateRun(runId, {
          step5Output: context.step5Output,
          integratedList,
          status: "completed",
          completedAt: new Date(),
          currentStep: 5,
        });
      }
    }

    clearControlRequests(runId);
    console.log(`[Run ${runId}] Pipeline completed successfully (${totalLoops} loop(s))`);
  } catch (error) {
    console.error(`[Run ${runId}] Pipeline error:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    await storage.updateRun(runId, {
      status: "error",
      errorMessage: errorMessage,
    });
    clearControlRequests(runId);
  }
}

// Resume a paused pipeline
export async function resumePipeline(runId: number): Promise<void> {
  const run = await storage.getRun(runId);
  if (!run || run.status !== "paused") {
    throw new Error("Run not found or not paused");
  }
  
  // Resume from the current step (not next step) since pause happens after step completion
  // If paused between loops, currentStep will be 2 and we resume from step 2 of the next loop
  const resumeStep = run.currentStep || 2;
  const currentLoop = run.currentLoop || 1;
  console.log(`[Run ${runId}] Resuming from loop ${currentLoop}, step ${resumeStep}`);
  
  await executeGMethodPipeline(runId, resumeStep);
}
