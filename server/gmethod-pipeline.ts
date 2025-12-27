import { GoogleGenAI } from "@google/genai";
import { storage } from "./storage";
import { STEP2_PROMPT, STEP2_DEEP_RESEARCH_PROMPT, STEP2_1_DEEP_RESEARCH_PROMPT, STEP2_2_DEEP_RESEARCH_PROMPT, STEP2_3_MERGE_PROMPT, STEP2_3_SUMMARIZE_PROMPT, STEP3_INDIVIDUAL_PROMPT, STEP4_INDIVIDUAL_PROMPT, STEP5_INDIVIDUAL_PROMPT } from "./prompts";
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

// Active run guard - prevents duplicate pipeline execution
const activeRunIds = new Set<number>();

export function isRunActive(runId: number): boolean {
  return activeRunIds.has(runId);
}

export function acquireRunLock(runId: number): boolean {
  if (activeRunIds.has(runId)) {
    console.log(`[Run ${runId}] BLOCKED: Already running in this process`);
    return false;
  }
  activeRunIds.add(runId);
  console.log(`[Run ${runId}] Lock acquired (active runs: ${activeRunIds.size})`);
  return true;
}

export function releaseRunLock(runId: number): void {
  activeRunIds.delete(runId);
  console.log(`[Run ${runId}] Lock released (active runs: ${activeRunIds.size})`);
}

export function getActiveRunIds(): number[] {
  return Array.from(activeRunIds);
}

export function forceReleaseAllLocks(): void {
  const count = activeRunIds.size;
  activeRunIds.clear();
  console.log(`[Recovery] Force released ${count} run locks`);
}

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

// Custom error classes for pause/stop control flow
export class PauseRequestedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PauseRequestedError';
  }
}

export class StopRequestedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StopRequestedError';
  }
}

// Deep Research rate limiting is now handled by shared module (deep-research.ts)

// Get prompt for a step - uses DB version if available, otherwise default
async function getPromptForStep(stepNumber: number): Promise<string> {
  const DEFAULT_PROMPTS: Record<number, string> = {
    2: STEP2_PROMPT,
    3: STEP3_INDIVIDUAL_PROMPT,
    4: STEP4_INDIVIDUAL_PROMPT,
    5: STEP5_INDIVIDUAL_PROMPT,
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

// Get file attachment settings for a step
async function getFileAttachments(stepNumber: number): Promise<string[]> {
  try {
    const setting = await storage.getStepFileAttachment(stepNumber);
    if (setting && Array.isArray(setting.attachedFiles)) {
      return setting.attachedFiles as string[];
    }
  } catch (error) {
    console.log(`[Pipeline] Error fetching file attachment settings for Step ${stepNumber}, using defaults`);
  }
  // Default: Only Steps 2-1 and 2-2 use File Search by default
  // Steps 3, 4, 5 use prompt embedding by default (faster, cheaper)
  // Users can enable File Search for Steps 3-5 via Settings
  const defaults: Record<number, string[]> = {
    21: ['target_specification', 'technical_assets', 'previous_hypotheses'],
    22: ['target_specification', 'technical_assets', 'hypothesis_context'],
    3: [],  // Prompt embedding by default
    4: [],  // Prompt embedding by default
    5: [],  // Prompt embedding by default
  };
  return defaults[stepNumber] || [];
}

// Get Deep Research prompts for 2-stage execution
async function getDeepResearchPrompt2_1(): Promise<string> {
  try {
    const activePrompt = await storage.getActivePrompt(21);
    if (activePrompt && activePrompt.content.trim()) {
      console.log(`[Pipeline] Using custom prompt v${activePrompt.version} for Step 2-1`);
      return activePrompt.content;
    }
  } catch (error) {
    console.log(`[Pipeline] Error fetching custom prompt for Step 2-1, using default`);
  }
  return STEP2_1_DEEP_RESEARCH_PROMPT;
}

async function getDeepResearchPrompt2_2(): Promise<string> {
  try {
    const activePrompt = await storage.getActivePrompt(22);
    if (activePrompt && activePrompt.content.trim()) {
      console.log(`[Pipeline] Using custom prompt v${activePrompt.version} for Step 2-2`);
      return activePrompt.content;
    }
  } catch (error) {
    console.log(`[Pipeline] Error fetching custom prompt for Step 2-2, using default`);
  }
  return STEP2_2_DEEP_RESEARCH_PROMPT;
}

async function getMergePrompt(): Promise<string> {
  try {
    const activePrompt = await storage.getActivePrompt(23);
    if (activePrompt && activePrompt.content.trim()) {
      console.log(`[Pipeline] Using custom prompt v${activePrompt.version} for Step 2-3 (Merge)`);
      return activePrompt.content;
    }
  } catch (error) {
    console.log(`[Pipeline] Error fetching custom prompt for Step 2-3, using default`);
  }
  return STEP2_3_MERGE_PROMPT;
}

async function getSummarizePrompt(): Promise<string> {
  try {
    const activePrompt = await storage.getActivePrompt(24);
    if (activePrompt && activePrompt.content.trim()) {
      console.log(`[Pipeline] Using custom prompt v${activePrompt.version} for Step 2-3 Summarize`);
      return activePrompt.content;
    }
  } catch (error) {
    console.log(`[Pipeline] Error fetching custom prompt for Step 2-3 Summarize, using default`);
  }
  return STEP2_3_SUMMARIZE_PROMPT;
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
  // Add unique identifier to prevent parallel execution conflicts
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const tempFile = path.join(tempDir, `${displayName.replace(/[^a-zA-Z0-9]/g, '_')}_${uniqueId}.txt`);
  
  // Convert to Buffer first to ensure consistent byte size handling
  const contentBuffer = Buffer.from(content, 'utf-8');
  fs.writeFileSync(tempFile, contentBuffer);
  
  const fileSize = fs.statSync(tempFile).size;
  console.log(`[FileSearch] Uploading ${displayName}: ${content.length} chars, ${fileSize} bytes`);
  
  try {
    let operation = await (client as any).fileSearchStores.uploadToFileSearchStore({
      file: tempFile,
      fileSearchStoreName: storeName,
      config: { 
        displayName,
        mimeType: 'text/plain'
      }
    });
    
    while (!operation.done) {
      await sleep(3000);
      operation = await (client as any).operations.get({ operation });
    }
    
    console.log(`[FileSearch] Uploaded file to store: ${displayName} (${fileSize} bytes)`);
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

// Upload text content as a file and return file info for regular model use
interface UploadedFile {
  name: string;
  uri: string;
  mimeType: string;
}

async function uploadTextFile(content: string, displayName: string): Promise<UploadedFile> {
  const client = getAIClient();
  
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `${displayName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.txt`);
  
  // Convert to Buffer first to ensure consistent byte size handling
  const contentBuffer = Buffer.from(content, 'utf-8');
  fs.writeFileSync(tempFile, contentBuffer);
  
  const fileSize = fs.statSync(tempFile).size;
  console.log(`[FileUpload] Uploading ${displayName}: ${content.length} chars, ${fileSize} bytes`);
  
  try {
    const file = await client.files.upload({
      file: tempFile,
      config: {
        displayName,
        mimeType: 'text/plain'
      }
    });
    
    console.log(`[FileUpload] Uploaded file: ${displayName} as ${file.name} (${fileSize} bytes)`);
    return {
      name: file.name || '',
      uri: file.uri || '',
      mimeType: file.mimeType || 'text/plain'
    };
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

async function deleteUploadedFile(fileName: string): Promise<void> {
  try {
    const client = getAIClient();
    await client.files.delete({ name: fileName });
    console.log(`Deleted file: ${fileName}`);
  } catch (error) {
    console.warn(`Failed to delete file ${fileName}:`, error);
  }
}

// Generate content with uploaded files using regular model (not Deep Research)
async function generateWithFilesAttached(
  prompt: string,
  files: UploadedFile[],
  model: 'pro' | 'flash' = 'pro'
): Promise<string> {
  const client = getAIClient();
  const modelName = model === 'pro' ? MODEL_PRO : MODEL_FLASH;
  
  // Build content parts: files first, then text prompt
  const parts: any[] = [];
  for (const file of files) {
    parts.push({
      fileData: {
        mimeType: file.mimeType,
        fileUri: file.uri
      }
    });
  }
  parts.push({ text: prompt });
  
  const response = await client.models.generateContent({
    model: modelName,
    contents: [{ role: 'user', parts }]
  });
  
  return response.text || '';
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

// Debug prompts structure for storing actual prompts sent to AI
interface DebugPromptEntry {
  step: string;
  prompt: string;
  attachments: string[];  // List of file names uploaded to File Search Store
  timestamp: string;
}

interface DebugPrompts {
  entries: DebugPromptEntry[];
}

// Helper function to add a debug prompt entry (atomic operation to avoid race conditions)
async function addDebugPrompt(runId: number, step: string, prompt: string, attachments: string[]): Promise<void> {
  try {
    await storage.appendDebugPrompt(runId, {
      step,
      prompt,
      attachments,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.warn(`[Run ${runId}] Failed to save debug prompt for ${step}:`, error);
  }
}

// Helper function to aggregate Step 5 outputs
// New prompt design: each Step 5 output includes "header line + data line"
// We take the header from the first hypothesis, then only data rows from all
function aggregateStep5Outputs(step5Outputs: string[]): string {
  const validOutputs = step5Outputs.filter(output => output && output.trim().length > 0);
  
  if (validOutputs.length === 0) {
    return "";
  }
  
  // Each output should be: header\ndata (2 lines)
  // Extract header from first output, then all data rows
  const lines: string[] = [];
  let headerLine: string | null = null;
  
  for (let i = 0; i < validOutputs.length; i++) {
    const output = validOutputs[i].trim();
    const outputLines = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    if (outputLines.length === 0) continue;
    
    if (outputLines.length >= 2) {
      // Has header and data
      if (headerLine === null) {
        headerLine = outputLines[0]; // Take header from first valid output
      }
      // Add data row (second line)
      lines.push(outputLines[1]);
    } else if (outputLines.length === 1) {
      // Only one line - could be just data or just header
      // If we don't have a header yet, this might be an error output or just data
      if (headerLine === null) {
        // Check if it looks like a header (contains "仮説番号")
        if (outputLines[0].includes("仮説番号")) {
          headerLine = outputLines[0];
        } else {
          // Assume it's a data row
          lines.push(outputLines[0]);
        }
      } else {
        // We have a header, so this is likely a data row
        lines.push(outputLines[0]);
      }
    }
  }
  
  // If no header was found from outputs, return just the data rows
  if (headerLine) {
    return headerLine + '\n' + lines.join('\n');
  } else {
    return lines.join('\n');
  }
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

以下の「市場・顧客ニーズ」と「技術シーズ」を分析し、事業仮説を生成するために必要な調査クエリを5〜10個生成してください。

【市場・顧客ニーズ】
{TARGET_SPEC}

【技術シーズ】
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

【市場・顧客ニーズ】
{TARGET_SPEC}

【技術シーズ】
{TECHNICAL_ASSETS}

各クエリについて、関連する情報を収集し、事業仮説の立案に役立つ知見をまとめてください。
市場規模、顧客課題、技術トレンド、競合状況などの情報を重視してください。`;

const REASONING_PROMPT = `あなたは事業仮説レポートの品質評価者です。

以下の収集情報を確認し、{HYPOTHESIS_COUNT}件の事業仮説を生成するのに十分な情報が揃っているか判定してください。

【収集した情報】
{SEARCH_RESULTS}

【市場・顧客ニーズ】
{TARGET_SPEC}

【技術シーズ】
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

interface ParallelItem {
  hypothesisNumber: number;
  hypothesisTitle: string;
  status: "waiting" | "running" | "completed" | "error";
  currentStep?: string;
  startTime?: number;
  endTime?: number;
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
  parallelItems?: ParallelItem[];
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
    // Preserve parallelItems unless explicitly provided
    parallelItems: progressInfo.parallelItems !== undefined 
      ? progressInfo.parallelItems 
      : existingProgress.parallelItems,
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

async function updateParallelItemStatus(
  runId: number,
  hypothesisNumber: number,
  updates: Partial<ParallelItem>
): Promise<void> {
  const run = await storage.getRun(runId);
  const existingProgress = (run?.progressInfo as ProgressInfo) || {};
  const parallelItems = existingProgress.parallelItems || [];
  
  const itemIndex = parallelItems.findIndex(item => item.hypothesisNumber === hypothesisNumber);
  if (itemIndex >= 0) {
    parallelItems[itemIndex] = { ...parallelItems[itemIndex], ...updates };
  }
  
  await storage.updateRun(runId, { 
    progressInfo: { ...existingProgress, parallelItems } 
  });
}

async function initializeParallelItems(
  runId: number,
  hypotheses: { number: number; title: string }[]
): Promise<void> {
  const parallelItems: ParallelItem[] = hypotheses.map(h => ({
    hypothesisNumber: h.number,
    hypothesisTitle: h.title.length > 40 ? h.title.substring(0, 40) + "..." : h.title,
    status: "waiting" as const,
  }));
  
  await updateProgress(runId, { parallelItems });
}

// Helper to append individual outputs (for multi-loop runs)
async function appendIndividualOutputs(
  runId: number,
  newOutputs: {
    step2_2IndividualOutputs?: string[];
    step3IndividualOutputs?: string[];
    step4IndividualOutputs?: string[];
    step5IndividualOutputs?: string[];
  }
): Promise<{
  step2_2IndividualOutputs: string[];
  step3IndividualOutputs: string[];
  step4IndividualOutputs: string[];
  step5IndividualOutputs: string[];
}> {
  const run = await storage.getRun(runId);
  const existing2_2 = (run?.step2_2IndividualOutputs as string[] | null) || [];
  const existing3 = (run?.step3IndividualOutputs as string[] | null) || [];
  const existing4 = (run?.step4IndividualOutputs as string[] | null) || [];
  const existing5 = (run?.step5IndividualOutputs as string[] | null) || [];
  
  return {
    step2_2IndividualOutputs: [...existing2_2, ...(newOutputs.step2_2IndividualOutputs || [])],
    step3IndividualOutputs: [...existing3, ...(newOutputs.step3IndividualOutputs || [])],
    step4IndividualOutputs: [...existing4, ...(newOutputs.step4IndividualOutputs || [])],
    step5IndividualOutputs: [...existing5, ...(newOutputs.step5IndividualOutputs || [])],
  };
}

// Extended DeepResearchResult to include 2-phase outputs
interface TwoPhaseDeepResearchResult extends DeepResearchResult {
  step2_1Output: string;
  step2_2Output: string;
  step2_2IndividualOutputs?: string[];
  // New pipeline: individual outputs for Steps 3, 4, 5 per hypothesis
  step3Output?: string;
  step4Output?: string;
  step5Output?: string;
  step3IndividualOutputs?: string[];
  step4IndividualOutputs?: string[];
  step5IndividualOutputs?: string[];
}

// Interface for extracted hypothesis from STEP2-1 output
interface ExtractedHypothesisFromStep2_1 {
  number: number;
  title: string;
  category: string;
  scores: {
    I: number;
    M: number;
    L: number;
    U: number;
    total: number;
  };
  rawText: string;
}

// Extract individual hypotheses from STEP2-1 output for parallel processing
async function extractHypothesesFromStep2_1(step2_1Output: string, hypothesisCount: number): Promise<ExtractedHypothesisFromStep2_1[]> {
  console.log(`[Pipeline] Extracting ${hypothesisCount} hypotheses from Step 2-1 output...`);
  
  // Try multiple extraction attempts with different prompts
  const extractionPrompts = [
    `以下のStep 2-1出力から、Top ${hypothesisCount}仮説の情報を抽出してください。

【Step 2-1出力】
${step2_1Output}

【出力形式】
以下のJSON形式で出力してください（他のテキストは含めないでください）：
{
  "hypotheses": [
    {
      "number": 1,
      "title": "仮説タイトル",
      "category": "Core/Strategic/Moonshot",
      "scores": { "I": 0.85, "M": 0.90, "L": 0.80, "U": 0.75, "total": 0.85 },
      "summary": "仮説の要約（100〜200文字）",
      "details": "Step 2-1出力から抽出した仮説の詳細説明（300〜500文字）"
    }
  ]
}

重要：必ず${hypothesisCount}件の仮説を抽出してください。`,
    // Fallback prompt with simpler format
    `Step 2-1出力からTop ${hypothesisCount}の仮説を抽出。JSON形式で出力：
{"hypotheses":[{"number":1,"title":"タイトル","category":"Core","scores":{"I":0.8,"M":0.8,"L":0.8,"U":0.8,"total":0.8},"summary":"要約","details":"詳細"}]}
Step 2-1出力:
${step2_1Output.substring(0, 20000)}`
  ];

  for (let attempt = 0; attempt < extractionPrompts.length; attempt++) {
    try {
      const result = await generateWithFlash(extractionPrompts[attempt]);
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.hypotheses && Array.isArray(parsed.hypotheses) && parsed.hypotheses.length > 0) {
          const hypotheses: ExtractedHypothesisFromStep2_1[] = parsed.hypotheses.map((h: any, idx: number) => ({
            number: h.number || idx + 1,
            title: h.title || `仮説${idx + 1}`,
            category: h.category || 'Unknown',
            scores: h.scores || { I: 0, M: 0, L: 0, U: 0, total: 0 },
            rawText: `【仮説${h.number || idx + 1}: ${h.title || '不明'}】
カテゴリ: ${h.category || 'Unknown'}
スコア: I=${h.scores?.I || 0}, M=${h.scores?.M || 0}, L=${h.scores?.L || 0}, U=${h.scores?.U || 0}
要約: ${h.summary || ''}
詳細: ${h.details || h.summary || ''}`
          }));
          
          // Validate extraction count - strict mode
          if (hypotheses.length >= hypothesisCount) {
            console.log(`[Pipeline] Successfully extracted ${hypotheses.length} hypotheses (attempt ${attempt + 1})`);
            return hypotheses.slice(0, hypothesisCount);
          } else {
            console.warn(`[Pipeline] Attempt ${attempt + 1}: Extracted only ${hypotheses.length}/${hypothesisCount} hypotheses, will retry...`);
            // Continue to next attempt instead of accepting incomplete extraction
          }
        }
      }
    } catch (error) {
      console.error(`[Pipeline] Extraction attempt ${attempt + 1} failed:`, error);
    }
  }
  
  // Last resort: Parse Step 2-1 output directly using regex patterns
  console.warn(`[Pipeline] JSON extraction failed, attempting direct parsing...`);
  const directHypotheses: ExtractedHypothesisFromStep2_1[] = [];
  
  // Look for hypothesis markers in the output using exec loop (ES5 compatible)
  const hypothesisPattern = /仮説\s*(?:No\.?|番号)?\s*(\d+)\s*[:：]?\s*([^\n]+)/g;
  let match: RegExpExecArray | null;
  
  while ((match = hypothesisPattern.exec(step2_1Output)) !== null && directHypotheses.length < hypothesisCount) {
    directHypotheses.push({
      number: parseInt(match[1]) || directHypotheses.length + 1,
      title: match[2].trim().substring(0, 200),
      category: 'Unknown',
      scores: { I: 0, M: 0, L: 0, U: 0, total: 0 },
      rawText: match[0].trim()
    });
  }
  
  // Enforce exact count even for direct parsing
  if (directHypotheses.length >= hypothesisCount) {
    console.log(`[Pipeline] Direct parsing extracted ${directHypotheses.length} hypotheses`);
    return directHypotheses.slice(0, hypothesisCount);
  } else if (directHypotheses.length > 0) {
    throw new Error(`仮説の抽出が不完全です。期待: ${hypothesisCount}件、抽出: ${directHypotheses.length}件。Step 2-1の出力形式を確認してください。`);
  }
  
  // If all else fails, throw error
  throw new Error(`仮説の抽出に失敗しました。Step 2-1の出力に仮説が見つかりませんでした。`);
}

// Summarize individual report to compact format for merging
async function summarizeReportForMerge(report: string, hypothesisNum: number, summarizePromptTemplate: string): Promise<string> {
  const summarizePrompt = summarizePromptTemplate
    .replace(/{REPORT}/g, report.substring(0, 8000))
    .replace(/{HYPOTHESIS_NUMBER}/g, hypothesisNum.toString());

  try {
    return await generateWithFlash(summarizePrompt);
  } catch (error) {
    console.error(`[Pipeline] Failed to summarize hypothesis ${hypothesisNum}:`, error);
    return `### 仮説${hypothesisNum}\n${report.substring(0, 1000)}...`;
  }
}

// Merge individual hypothesis reports into unified report using Gemini 3.0 Pro
async function mergeIndividualReports(
  step2_1Output: string,
  individualReports: string[],
  hypothesisCount: number,
  runId: number
): Promise<string> {
  console.log(`[Run ${runId}] Merging ${individualReports.length} individual reports...`);
  
  // Get customizable prompts
  const summarizePromptTemplate = await getSummarizePrompt();
  const mergePromptTemplate = await getMergePrompt();
  
  // First, summarize each report to reduce token count
  console.log(`[Run ${runId}] Summarizing individual reports...`);
  const summaries: string[] = [];
  for (let i = 0; i < individualReports.length; i++) {
    const summary = await summarizeReportForMerge(individualReports[i], i + 1, summarizePromptTemplate);
    summaries.push(summary);
    console.log(`[Run ${runId}] Summarized hypothesis ${i + 1} (${summary.length} chars)`);
  }
  
  const summarizedReportsSection = summaries.join('\n\n---\n\n');
  
  // Collect all references from individual reports for deduplication
  const allReferences: string[] = [];
  individualReports.forEach(report => {
    const refPattern = /\[\d+\]\s*(.+?https?:\/\/[^\s\]]+)/g;
    let refMatch: RegExpExecArray | null;
    while ((refMatch = refPattern.exec(report)) !== null) {
      if (!allReferences.includes(refMatch[1])) {
        allReferences.push(refMatch[1]);
      }
    }
  });
  
  const referencesSection = allReferences.slice(0, 20).map((ref, idx) => `[${idx + 1}] ${ref}`).join('\n');
  
  // Build merge prompt from template
  const mergePrompt = mergePromptTemplate
    .replace(/{STEP2_1_OUTPUT}/g, step2_1Output.substring(0, 3000))
    .replace(/{SUMMARIZED_REPORTS}/g, summarizedReportsSection)
    .replace(/{REFERENCES}/g, referencesSection)
    .replace(/{HYPOTHESIS_COUNT}/g, hypothesisCount.toString());

  // Save debug prompt for Step 2-3 merge
  await addDebugPrompt(runId, "Step 2-3 (統合)", mergePrompt, []);

  const mergedReport = await generateWithPro(mergePrompt);
  console.log(`[Run ${runId}] Merge completed. Output length: ${mergedReport.length} chars`);
  return mergedReport;
}

// Helper function to run a single Deep Research phase
async function runDeepResearchPhase(
  client: GoogleGenAI,
  prompt: string,
  storeName: string,
  runId: number,
  phaseName: string,
  startTime: number
): Promise<string> {
  debugLog(`[Run ${runId}] Starting ${phaseName} with File Search Store: ${storeName}`);
  debugLog(`[Run ${runId}] ${phaseName} Prompt length: ${prompt.length} chars`);
  
  await sharedWaitForRateLimit();
  
  let interactionId: string;
  try {
    debugLog(`[Run ${runId}] ${phaseName}: Calling interactions.create with stream: true`);
    const stream = await (client as any).interactions.create({
      input: prompt,
      agent: DEEP_RESEARCH_AGENT,
      background: true,
      stream: true,
      tools: [
        { type: 'file_search', file_search_store_names: [storeName] }
      ],
      agent_config: {
        type: 'deep-research'
      }
    });
    
    debugLog(`[Run ${runId}] ${phaseName}: Stream created, waiting for interaction.start event`);
    
    for await (const chunk of stream as AsyncIterable<any>) {
      debugLog(`[Run ${runId}] ${phaseName}: Stream event: ${chunk.event_type}`);
      if (chunk.event_type === 'interaction.start' && chunk.interaction?.id) {
        interactionId = chunk.interaction.id;
        debugLog(`[Run ${runId}] ${phaseName}: Stream started, Interaction ID: ${interactionId}`);
        break;
      }
    }
    
    if (!interactionId!) {
      throw new Error(`${phaseName}: Failed to get interaction ID from stream`);
    }
  } catch (apiError: any) {
    debugLog(`[Run ${runId}] ${phaseName} API Error: ${apiError.message}`);
    // Check for rate limit error (429)
    if (apiError.status === 429 || apiError.message?.includes('429') || apiError.message?.includes('rate') || apiError.message?.includes('quota')) {
      console.error(`[Run ${runId}] ⚠️ RATE LIMIT ERROR (429): ${phaseName} - APIレート制限に達しました`);
      throw new Error(`${phaseName} レート制限エラー (429): APIのクォータを超過しました。しばらく待ってから再試行してください。`);
    }
    throw new Error(`${phaseName} APIの起動に失敗しました: ${apiError.message}`);
  }
  
  debugLog(`[Run ${runId}] ${phaseName} Task Started. Interaction ID: ${interactionId}`);
  
  let report = "";
  let pollCount = 0;
  const maxPollTime = 30 * 60 * 1000;
  const pollInterval = 15000;
  const phaseStartTime = Date.now();
  
  while (Date.now() - phaseStartTime < maxPollTime) {
    pollCount++;
    await sleep(pollInterval);

    // Cooperative cancellation check during polling
    if (isStopRequested(runId)) {
      console.log(`[Run ${runId}] ${phaseName}: Stop requested during polling, aborting`);
      throw new StopRequestedError(`${phaseName} が停止リクエストにより中断されました`);
    }
    if (isPauseRequested(runId)) {
      console.log(`[Run ${runId}] ${phaseName}: Pause requested during polling, aborting`);
      throw new PauseRequestedError(`${phaseName} が一時停止リクエストにより中断されました`);
    }

    try {
      const currentStatus = await (client as any).interactions.get(interactionId);
      const status = currentStatus.status;
      console.log(`[Run ${runId}] ${phaseName} Status: ${status} (poll ${pollCount})`);

      if (status === "completed") {
        console.log(`[Run ${runId}] ${phaseName} Completed!`);
        const outputs = currentStatus.outputs || [];
        const finalOutput = outputs[outputs.length - 1];
        report = finalOutput?.text || "";
        break;
      } else if (status === "failed") {
        console.error(`[Run ${runId}] ${phaseName} Failed:`, currentStatus.error);
        throw new Error(`${phaseName} が失敗しました: ${currentStatus.error || "Unknown error"}`);
      }
    } catch (pollError: any) {
      if (pollError.message?.includes("が失敗")) {
        throw pollError;
      }
      // Check for rate limit error (429) during polling
      if (pollError.status === 429 || pollError.message?.includes('429') || pollError.message?.includes('rate') || pollError.message?.includes('quota')) {
        console.error(`[Run ${runId}] ⚠️ RATE LIMIT ERROR (429): ${phaseName} - ポーリング中にレート制限に達しました`);
        throw new Error(`${phaseName} レート制限エラー (429): APIのクォータを超過しました。`);
      }
      console.warn(`[Run ${runId}] ${phaseName} Poll error (continuing):`, pollError.message);
    }
  }

  if (!report) {
    throw new Error(`${phaseName} がタイムアウトしました（30分経過）`);
  }
  
  return report;
}

async function executeDeepResearchStep2(context: PipelineContext, runId: number): Promise<TwoPhaseDeepResearchResult> {
  const stepTimings: { [key: string]: number } = {};
  const startTime = Date.now();
  let fileSearchStoreName1: string | null = null;
  let fileSearchStoreName2: string | null = null;

  await updateProgress(runId, { 
    currentPhase: "deep_research_starting", 
    currentIteration: 0, 
    maxIterations: 2,
    stepTimings,
    stepStartTime: startTime,
  });

  console.log(`[Run ${runId}] Starting Two-Phase Deep Research API...`);

  const client = getAIClient();
  let step2_1Output = "";
  let step2_2Output = "";
  
  try {
    // ===== PHASE 1: Step 2-1 (Divergent Selection) =====
    console.log(`[Run ${runId}] === PHASE 1: Step 2-1 (発散・選定フェーズ) ===`);
    
    await updateProgress(runId, { 
      currentPhase: "step2_1_uploading", 
      currentIteration: 1, 
      maxIterations: 2,
      planningAnalysis: "Step 2-1: データをFile Searchストアにアップロード中...",
      stepTimings,
      stepStartTime: startTime,
    });

    fileSearchStoreName1 = await createFileSearchStore(`gmethod-run-${runId}-step2-1-${Date.now()}`);
    console.log(`[Run ${runId}] Created File Search Store for Step 2-1: ${fileSearchStoreName1}`);

    // Get configured file attachments for Step 2-1
    const step2_1FileConfig = await getFileAttachments(21);
    const step2_1Attachments: string[] = [];
    console.log(`[Run ${runId}] Step 2-1 file attachment config: ${step2_1FileConfig.join(', ') || 'none'}`);

    if (step2_1FileConfig.includes('target_specification')) {
      await uploadTextToFileSearchStore(fileSearchStoreName1, context.targetSpec, "target_specification");
      step2_1Attachments.push("target_specification");
      console.log(`[Run ${runId}] Uploaded target specification`);
    }

    if (step2_1FileConfig.includes('technical_assets')) {
      await uploadTextToFileSearchStore(fileSearchStoreName1, context.technicalAssets, "technical_assets");
      step2_1Attachments.push("technical_assets");
      console.log(`[Run ${runId}] Uploaded technical assets`);
    }

    // Upload previous hypotheses if configured AND if they exist
    if (step2_1FileConfig.includes('previous_hypotheses') && context.previousHypotheses) {
      await uploadTextToFileSearchStore(fileSearchStoreName1, context.previousHypotheses, "previous_hypotheses");
      step2_1Attachments.push("previous_hypotheses");
      console.log(`[Run ${runId}] Uploaded previous hypotheses`);
    }

    stepTimings["step2_1_file_upload"] = Date.now() - startTime;

    // Get Step 2-1 prompt (divergent selection)
    let researchPrompt2_1 = await getDeepResearchPrompt2_1();
    researchPrompt2_1 = researchPrompt2_1
      .replace(/{HYPOTHESIS_COUNT}/g, context.hypothesisCount.toString())
      .replace("{PREVIOUS_HYPOTHESES}", context.previousHypotheses || "なし");
    
    console.log(`[Run ${runId}] Step 2-1 Prompt: ${researchPrompt2_1.length} chars`);

    // Save debug prompt for Step 2-1
    await addDebugPrompt(runId, "Step 2-1 (発散・選定)", researchPrompt2_1, step2_1Attachments);

    await updateProgress(runId, { 
      currentPhase: "step2_1_running", 
      currentIteration: 1, 
      maxIterations: 2,
      planningAnalysis: "Step 2-1: Deep Research エージェントが発散・選定フェーズを実行中...",
      stepTimings,
      stepStartTime: startTime,
    });

    // Execute Step 2-1 Deep Research
    step2_1Output = await runDeepResearchPhase(
      client, 
      researchPrompt2_1, 
      fileSearchStoreName1, 
      runId, 
      "Step 2-1",
      startTime
    );
    
    stepTimings["step2_1_deep_research"] = Date.now() - startTime;
    console.log(`[Run ${runId}] Step 2-1 completed. Output length: ${step2_1Output.length} chars`);

    // Save Step 2-1 output to database
    await storage.updateRun(runId, { step2_1Output });
    
    // Cleanup Step 2-1 File Search Store
    if (fileSearchStoreName1) {
      await deleteFileSearchStore(fileSearchStoreName1);
      fileSearchStoreName1 = null;
    }

    // ===== PHASE 2: Parallel Step 2-2 Deep Research for all hypotheses =====
    console.log(`[Run ${runId}] === PHASE 2: Parallel Step 2-2 Deep Research (${context.hypothesisCount}仮説を並列処理) ===`);
    
    const phase2StartTime = Date.now();
    
    // Extract individual hypotheses from Step 2-1 output
    await updateProgress(runId, { 
      currentPhase: "extracting_hypotheses", 
      currentIteration: 1, 
      maxIterations: context.hypothesisCount + 3, // Step 2-2 parallel + Steps 3-5 sequential per hypothesis
      planningAnalysis: "Step 2-1の結果から個別仮説を抽出中...",
      stepTimings,
      stepStartTime: startTime,
    });

    const extractedHypotheses = await extractHypothesesFromStep2_1(step2_1Output, context.hypothesisCount);
    console.log(`[Run ${runId}] Extracted ${extractedHypotheses.length} hypotheses for parallel Step 2-2 processing`);

    // Initialize parallel items for UI visualization
    // Use 1-based index for consistent numbering
    await initializeParallelItems(runId, extractedHypotheses.map((h, i) => ({ 
      number: i + 1, 
      title: h.title 
    })));

    // Run Step 2-2 Deep Research in PARALLEL for all hypotheses
    await updateProgress(runId, { 
      currentPhase: "step2_2_parallel", 
      currentIteration: 2, 
      maxIterations: context.hypothesisCount + 3,
      planningAnalysis: `Step 2-2: ${extractedHypotheses.length}個の仮説を並列でDeep Research実行中...`,
      stepTimings,
      stepStartTime: startTime,
    });

    const step2_2Promises = extractedHypotheses.map((hypothesis, i) => 
      executeStep2_2ForHypothesisWithProgress(
        client,
        hypothesis,
        i + 1,
        step2_1Output,
        context,
        runId,
        startTime
      )
    );

    const step2_2Results = await Promise.all(step2_2Promises);
    stepTimings["step2_2_parallel"] = Date.now() - phase2StartTime;
    console.log(`[Run ${runId}] All ${step2_2Results.length} Step 2-2 Deep Research completed in parallel`);

    // Save Step 2-2 individual outputs immediately
    const step2_2IndividualOutputs = step2_2Results.map(r => r.step2_2Output);
    await storage.updateRun(runId, { step2_2IndividualOutputs });

    // Check for pause/stop request after parallel Step 2-2
    const runStatusCheck = await storage.getRun(runId);
    if (runStatusCheck?.status === "paused" || runStatusCheck?.status === "error") {
      console.log(`[Run ${runId}] Run status is ${runStatusCheck.status}, aborting before Phase 3`);
      throw new Error(`処理が中断されました: ${runStatusCheck.status}`);
    }

    // ===== PHASE 3: PARALLEL Steps 3→4→5 for all hypotheses =====
    console.log(`[Run ${runId}] === PHASE 3: Parallel Steps 3→4→5 (${context.hypothesisCount}仮説を並列処理) ===`);
    
    const phase3StartTime = Date.now();
    
    // Reset parallel items for Phase 3 visualization
    // Use 1-based index for consistent numbering
    await initializeParallelItems(runId, step2_2Results.map((r, i) => ({ 
      number: i + 1, 
      title: r.hypothesisTitle 
    })));
    
    await updateProgress(runId, { 
      currentPhase: "steps3to5_parallel", 
      currentIteration: 3, 
      maxIterations: 4,
      planningAnalysis: `Steps 3→4→5: ${step2_2Results.length}個の仮説を並列で評価・監査・統合実行中...`,
      stepTimings,
      stepStartTime: startTime,
    });
    
    // Run Steps 3→4→5 in PARALLEL for all hypotheses
    // IMPORTANT: Use 1-based index (i + 1) as hypothesisNumber to ensure correct numbering
    // regardless of what hypothesisNumber is stored in step2_2Result
    const steps3to5Promises = step2_2Results.map((step2_2Result, i) => {
      const hypothesisNumber = i + 1; // Use 1-based index for consistent numbering
      const hypothesisTitle = step2_2Result.hypothesisTitle;
      const step2_2OutputForThisHypothesis = step2_2Result.step2_2Output;
      
      console.log(`[Run ${runId}] Starting parallel Steps 3-5 for hypothesis ${hypothesisNumber}: ${hypothesisTitle}`);
      console.log(`[Run ${runId}] DEBUG: Step 2-2 output length: ${step2_2OutputForThisHypothesis.length} chars`);
      console.log(`[Run ${runId}] DEBUG: Original step2_2Result.hypothesisNumber was: ${step2_2Result.hypothesisNumber}`);
      
      return processSteps3to5ForHypothesisWithProgress(
        client,
        hypothesisNumber,
        hypothesisTitle,
        step2_2OutputForThisHypothesis,
        context,
        runId,
        startTime,
        stepTimings
      );
    });
    
    const allResults = await Promise.all(steps3to5Promises);
    console.log(`[Run ${runId}] All ${allResults.length} hypotheses Steps 3→4→5 completed in parallel`);
    
    const step3IndividualOutputs = allResults.map(r => r.step3Output);
    const step4IndividualOutputs = allResults.map(r => r.step4Output);
    const step5IndividualOutputs = allResults.map(r => r.step5Output);
    
    stepTimings["phase3_steps3to5_parallel"] = Date.now() - phase3StartTime;
    stepTimings["phase2_total"] = Date.now() - phase2StartTime;
    console.log(`[Run ${runId}] All ${allResults.length} hypotheses fully processed`);

    // ===== Aggregate outputs =====
    // Combine Step 2-2 outputs into a single report (for backward compatibility and display)
    step2_2Output = allResults.map((r, i) => 
      `${'='.repeat(60)}\n【仮説${i + 1}: ${r.hypothesisTitle}】\n${'='.repeat(60)}\n\n${r.step2_2Output}`
    ).join('\n\n');
    
    // Combine all Step 3 outputs
    const aggregatedStep3Output = allResults.map((r, i) => 
      `${r.step3Output}`
    ).join('\n\n');
    
    // Combine all Step 4 outputs
    const aggregatedStep4Output = allResults.map((r, i) => 
      `${r.step4Output}`
    ).join('\n\n');
    
    // Combine Step 5 outputs into final TSV
    // New prompt design: each Step 5 output includes "header line + data line"
    // We take the header from the first hypothesis, then only data rows from all
    const aggregatedStep5Output = aggregateStep5Outputs(allResults.map(r => r.step5Output));

    // Save all outputs to database (both individual and aggregated for backward compatibility)
    // For multi-loop runs, append to existing individual outputs instead of overwriting
    const appendedOutputs = await appendIndividualOutputs(runId, {
      step2_2IndividualOutputs,
      step3IndividualOutputs,
      step4IndividualOutputs,
      step5IndividualOutputs,
    });
    
    // Rebuild aggregated outputs from all accumulated individual outputs (for multi-loop support)
    const fullStep2_2Output = appendedOutputs.step2_2IndividualOutputs.map((output, i) => 
      `${'='.repeat(60)}\n【仮説${i + 1}】\n${'='.repeat(60)}\n\n${output}`
    ).join('\n\n');
    const fullStep3Output = appendedOutputs.step3IndividualOutputs.join('\n\n');
    const fullStep4Output = appendedOutputs.step4IndividualOutputs.join('\n\n');
    const fullStep5Output = aggregateStep5Outputs(appendedOutputs.step5IndividualOutputs);
    
    await storage.updateRun(runId, { 
      step2_2Output: fullStep2_2Output,
      step2_2IndividualOutputs: appendedOutputs.step2_2IndividualOutputs,
      step3Output: fullStep3Output,
      step3IndividualOutputs: appendedOutputs.step3IndividualOutputs,
      step4Output: fullStep4Output,
      step4IndividualOutputs: appendedOutputs.step4IndividualOutputs,
      step5Output: fullStep5Output,
      step5IndividualOutputs: appendedOutputs.step5IndividualOutputs,
    });

    // Create combined report for display (Step 2-1 + Step 2-2 individual reports)
    // Use fullStep2_2Output to include all hypotheses from all loops
    const combinedReport = `【Step 2-1：発散・選定フェーズ（監査ストリップ）】

${step2_1Output}

${'='.repeat(80)}

【Step 2-2〜5：各仮説の詳細分析・評価・データ抽出】

${fullStep2_2Output}`;

    stepTimings["total"] = Date.now() - startTime;

    // Build execution timing data for current loop's hypotheses
    const currentLoopTimingData = extractedHypotheses.map((h, i) => {
      const hNum = i + 1;
      const step2_2Result = step2_2Results[i];
      const steps3to5Result = allResults[i];
      return {
        hypothesisNumber: hNum,
        hypothesisTitle: h.title,
        step2_2Ms: step2_2Result?.durationMs || 0,
        step3Ms: steps3to5Result?.timing?.step3Ms || 0,
        step4Ms: steps3to5Result?.timing?.step4Ms || 0,
        step5Ms: steps3to5Result?.timing?.step5Ms || 0,
        steps3to5TotalMs: steps3to5Result?.timing?.totalMs || 0,
      };
    });

    // Get existing timing data and merge with current loop (for multi-loop runs)
    const run = await storage.getRun(runId);
    const existingTiming = (run?.executionTiming as any) || {};
    const existingHypotheses = Array.isArray(existingTiming.hypotheses) ? existingTiming.hypotheses : [];
    
    // Renumber hypotheses based on their position in the accumulated array
    const totalHypothesesSoFar = existingHypotheses.length;
    const renumberedCurrentTimingData = currentLoopTimingData.map((h, i) => ({
      ...h,
      hypothesisNumber: totalHypothesesSoFar + i + 1,
    }));

    const executionTiming = {
      overallMs: (existingTiming.overallMs || 0) + stepTimings["total"],
      step2_1Ms: (existingTiming.step2_1Ms || 0) + (stepTimings["step2_1_deep_research"] || 0),
      step2_2ParallelMs: (existingTiming.step2_2ParallelMs || 0) + (stepTimings["step2_2_parallel"] || 0),
      steps3to5ParallelMs: (existingTiming.steps3to5ParallelMs || 0) + (stepTimings["phase3_steps3to5_parallel"] || 0),
      hypotheses: [...existingHypotheses, ...renumberedCurrentTimingData],
    };
    
    // Save execution timing
    await storage.updateRun(runId, { executionTiming });

    // Validate combined report
    const validationStartTime = Date.now();
    await updateProgress(runId, { 
      currentPhase: "validating", 
      currentIteration: 0, 
      maxIterations: 1,
      planningAnalysis: "生成された仮説を検証中...",
      stepTimings,
      stepStartTime: startTime,
    });

    const validationResult = await validateHypotheses(combinedReport, context.hypothesisCount, runId);
    stepTimings["validation"] = Date.now() - validationStartTime;

    console.log(`[Run ${runId}] Per-Hypothesis Full Pipeline completed. Total time: ${Math.floor(stepTimings["total"] / 1000)}s`);

    return {
      report: combinedReport,
      searchQueries: [],
      iterationCount: context.hypothesisCount * 4,
      validationResult,
      step2_1Output,
      step2_2Output: fullStep2_2Output,
      step2_2IndividualOutputs: appendedOutputs.step2_2IndividualOutputs,
      // New: individual outputs for each step (with full accumulation for multi-loop)
      step3Output: fullStep3Output,
      step4Output: fullStep4Output,
      step5Output: fullStep5Output,
      step3IndividualOutputs: appendedOutputs.step3IndividualOutputs,
      step4IndividualOutputs: appendedOutputs.step4IndividualOutputs,
      step5IndividualOutputs: appendedOutputs.step5IndividualOutputs,
    };
  } catch (error: any) {
    // Handle pause/stop cancellation errors specially - update run status and exit gracefully
    if (error instanceof PauseRequestedError) {
      console.log(`[Run ${runId}] Deep Research paused by user request:`, error.message);
      await storage.updateRun(runId, { status: "paused" });
      throw error; // Re-throw so caller knows it was paused
    }
    if (error instanceof StopRequestedError) {
      console.log(`[Run ${runId}] Deep Research stopped by user request:`, error.message);
      // Use dedicated 'stopped' status for clean user-initiated termination (not a failure)
      await storage.updateRun(runId, { status: "stopped" });
      throw error; // Re-throw so caller knows it was stopped
    }
    console.error(`[Run ${runId}] Three-Phase Deep Research failed:`, error);
    throw new Error(`Deep Research APIの起動に失敗しました: ${error?.message || error}`);
  } finally {
    if (fileSearchStoreName1) {
      await deleteFileSearchStore(fileSearchStoreName1);
    }
    if (fileSearchStoreName2) {
      await deleteFileSearchStore(fileSearchStoreName2);
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

async function executeStep3(context: PipelineContext, runId: number): Promise<string> {
  const basePrompt = await getPromptForStep(3);
  const prompt = basePrompt
    .replace(/{HYPOTHESIS_COUNT}/g, context.hypothesisCount.toString())
    .replace("{TECHNICAL_ASSETS}", context.technicalAssets)
    .replace("{STEP2_OUTPUT}", context.step2Output || "");
  
  // Save debug prompt for Step 3
  await addDebugPrompt(runId, "Step 3 (科学的評価)", prompt, []);
  
  return generateWithPro(prompt);
}

async function executeStep4(context: PipelineContext, runId: number): Promise<string> {
  const basePrompt = await getPromptForStep(4);
  const prompt = basePrompt
    .replace(/{HYPOTHESIS_COUNT}/g, context.hypothesisCount.toString())
    .replace("{TECHNICAL_ASSETS}", context.technicalAssets)
    .replace("{STEP2_OUTPUT}", context.step2Output || "")
    .replace("{STEP3_OUTPUT}", context.step3Output || "");
  
  // Save debug prompt for Step 4
  await addDebugPrompt(runId, "Step 4 (戦略監査)", prompt, []);
  
  return generateWithPro(prompt);
}

async function executeStep5(context: PipelineContext, runId: number): Promise<string> {
  const basePrompt = await getPromptForStep(5);
  const prompt = basePrompt
    .replace(/{HYPOTHESIS_COUNT}/g, context.hypothesisCount.toString())
    .replace("{STEP2_OUTPUT}", context.step2Output || "")
    .replace("{STEP3_OUTPUT}", context.step3Output || "")
    .replace("{STEP4_OUTPUT}", context.step4Output || "");
  
  // Save debug prompt for Step 5
  await addDebugPrompt(runId, "Step 5 (統合出力)", prompt, []);
  
  return generateWithFlash(prompt);
}

// ===== Per-Hypothesis Step Execution Functions (New Pipeline Architecture) =====
// These functions process Steps 3, 4, 5 for individual hypotheses

interface PerHypothesisResult {
  hypothesisNumber: number;
  hypothesisTitle: string;
  step2_2Output: string;
  step3Output: string;
  step4Output: string;
  step5Output: string; // Single TSV row (no header)
  timing: {
    step3Ms: number;
    step4Ms: number;
    step5Ms: number;
    totalMs: number;
  };
}

async function executeStep3Individual(
  client: GoogleGenAI,
  hypothesisNumber: number,
  hypothesisTitle: string,
  step2_2Report: string,
  targetSpec: string,
  technicalAssets: string,
  runId: number,
  startTime: number
): Promise<string> {
  console.log(`[Run ${runId}] executeStep3Individual for hypothesis ${hypothesisNumber}`);
  console.log(`[Run ${runId}] Received step2_2Report length: ${step2_2Report.length} chars`);
  console.log(`[Run ${runId}] step2_2Report first 200 chars: ${step2_2Report.substring(0, 200)}`);
  
  // Get prompt from database or use default
  const basePrompt = await getPromptForStep(3);
  const prompt = basePrompt
    .replace(/{HYPOTHESIS_NUMBER}/g, hypothesisNumber.toString())
    .replace(/{HYPOTHESIS_TITLE}/g, hypothesisTitle);
  
  // Check file attachment settings for Step 3
  const step3FileConfig = await getFileAttachments(3);
  const useFileAttachments = step3FileConfig.length > 0;
  
  if (useFileAttachments) {
    // File attachment mode with regular model
    const uploadedFiles: UploadedFile[] = [];
    const step3Attachments: string[] = [];
    
    try {
      if (step3FileConfig.includes('target_specification')) {
        const file = await uploadTextFile(targetSpec, `h${hypothesisNumber}_target_specification`);
        uploadedFiles.push(file);
        step3Attachments.push("target_specification");
      }
      if (step3FileConfig.includes('technical_assets')) {
        const file = await uploadTextFile(technicalAssets, `h${hypothesisNumber}_technical_assets`);
        uploadedFiles.push(file);
        step3Attachments.push("technical_assets");
      }
      if (step3FileConfig.includes('step2_2_report')) {
        const file = await uploadTextFile(step2_2Report, `h${hypothesisNumber}_step2_2_report`);
        uploadedFiles.push(file);
        step3Attachments.push("step2_2_report");
      }
      
      console.log(`[Run ${runId}] Uploaded ${uploadedFiles.length} files for Step 3 Hypothesis ${hypothesisNumber}`);
      await addDebugPrompt(runId, `Step 3 仮説${hypothesisNumber} (${hypothesisTitle})`, prompt, step3Attachments);
      
      const result = await generateWithFilesAttached(prompt, uploadedFiles, 'pro');
      
      // Cleanup uploaded files
      for (const file of uploadedFiles) {
        await deleteUploadedFile(file.name);
      }
      return result;
    } catch (error: any) {
      // Cleanup on error
      for (const file of uploadedFiles) {
        await deleteUploadedFile(file.name).catch(e => console.error("Failed to cleanup file:", e));
      }
      throw error;
    }
  } else {
    // Prompt embedding mode (default)
    const fullPrompt = `${prompt}

=== ターゲット仕様書 ===
${targetSpec}

=== 技術資産リスト ===
${technicalAssets}

=== Step 2-2 仮説レポート ===
${step2_2Report}`;
    
    await addDebugPrompt(runId, `Step 3 仮説${hypothesisNumber} (${hypothesisTitle})`, fullPrompt, []);
    
    return generateWithPro(fullPrompt);
  }
}

async function executeStep4Individual(
  client: GoogleGenAI,
  hypothesisNumber: number,
  hypothesisTitle: string,
  step2_2Report: string,
  step3Output: string,
  targetSpec: string,
  technicalAssets: string,
  runId: number,
  startTime: number
): Promise<string> {
  // Get prompt from database or use default
  const basePrompt = await getPromptForStep(4);
  const prompt = basePrompt
    .replace(/{HYPOTHESIS_NUMBER}/g, hypothesisNumber.toString())
    .replace(/{HYPOTHESIS_TITLE}/g, hypothesisTitle);
  
  // Check file attachment settings for Step 4
  const step4FileConfig = await getFileAttachments(4);
  const useFileAttachments = step4FileConfig.length > 0;
  
  if (useFileAttachments) {
    // File attachment mode with regular model
    const uploadedFiles: UploadedFile[] = [];
    const step4Attachments: string[] = [];
    
    try {
      if (step4FileConfig.includes('target_specification')) {
        const file = await uploadTextFile(targetSpec, `h${hypothesisNumber}_target_specification`);
        uploadedFiles.push(file);
        step4Attachments.push("target_specification");
      }
      if (step4FileConfig.includes('technical_assets')) {
        const file = await uploadTextFile(technicalAssets, `h${hypothesisNumber}_technical_assets`);
        uploadedFiles.push(file);
        step4Attachments.push("technical_assets");
      }
      if (step4FileConfig.includes('step2_2_report')) {
        const file = await uploadTextFile(step2_2Report, `h${hypothesisNumber}_step2_2_report`);
        uploadedFiles.push(file);
        step4Attachments.push("step2_2_report");
      }
      if (step4FileConfig.includes('step3_output')) {
        const file = await uploadTextFile(step3Output, `h${hypothesisNumber}_step3_output`);
        uploadedFiles.push(file);
        step4Attachments.push("step3_output");
      }
      
      console.log(`[Run ${runId}] Uploaded ${uploadedFiles.length} files for Step 4 Hypothesis ${hypothesisNumber}`);
      await addDebugPrompt(runId, `Step 4 仮説${hypothesisNumber} (${hypothesisTitle})`, prompt, step4Attachments);
      
      const result = await generateWithFilesAttached(prompt, uploadedFiles, 'pro');
      
      // Cleanup uploaded files
      for (const file of uploadedFiles) {
        await deleteUploadedFile(file.name);
      }
      return result;
    } catch (error: any) {
      // Cleanup on error
      for (const file of uploadedFiles) {
        await deleteUploadedFile(file.name).catch(e => console.error("Failed to cleanup file:", e));
      }
      throw error;
    }
  } else {
    // Prompt embedding mode (default)
    const fullPrompt = `${prompt}

=== ターゲット仕様書 ===
${targetSpec}

=== 技術資産リスト ===
${technicalAssets}

=== Step 2-2 仮説レポート ===
${step2_2Report}

=== Step 3 科学的評価結果 ===
${step3Output}`;
    
    await addDebugPrompt(runId, `Step 4 仮説${hypothesisNumber} (${hypothesisTitle})`, fullPrompt, []);
    
    return generateWithPro(fullPrompt);
  }
}

async function executeStep5Individual(
  client: GoogleGenAI,
  hypothesisNumber: number,
  hypothesisTitle: string,
  step2_2Report: string,
  step3Output: string,
  step4Output: string,
  runId: number,
  startTime: number
): Promise<string> {
  // Get prompt from database or use default
  const basePrompt = await getPromptForStep(5);
  const prompt = basePrompt
    .replace(/{HYPOTHESIS_NUMBER}/g, hypothesisNumber.toString())
    .replace(/{HYPOTHESIS_TITLE}/g, hypothesisTitle);
  
  // Check file attachment settings for Step 5
  const step5FileConfig = await getFileAttachments(5);
  const useFileAttachments = step5FileConfig.length > 0;
  
  if (useFileAttachments) {
    // File attachment mode with regular model
    const uploadedFiles: UploadedFile[] = [];
    const step5Attachments: string[] = [];
    
    try {
      if (step5FileConfig.includes('step2_2_report')) {
        const file = await uploadTextFile(step2_2Report, `h${hypothesisNumber}_step2_2_report`);
        uploadedFiles.push(file);
        step5Attachments.push("step2_2_report");
      }
      if (step5FileConfig.includes('step3_output')) {
        const file = await uploadTextFile(step3Output, `h${hypothesisNumber}_step3_output`);
        uploadedFiles.push(file);
        step5Attachments.push("step3_output");
      }
      if (step5FileConfig.includes('step4_output')) {
        const file = await uploadTextFile(step4Output, `h${hypothesisNumber}_step4_output`);
        uploadedFiles.push(file);
        step5Attachments.push("step4_output");
      }
      
      console.log(`[Run ${runId}] Uploaded ${uploadedFiles.length} files for Step 5 Hypothesis ${hypothesisNumber}`);
      await addDebugPrompt(runId, `Step 5 仮説${hypothesisNumber} (${hypothesisTitle})`, prompt, step5Attachments);
      
      const result = await generateWithFilesAttached(prompt, uploadedFiles, 'flash');
      
      // Cleanup uploaded files
      for (const file of uploadedFiles) {
        await deleteUploadedFile(file.name);
      }
      return result;
    } catch (error: any) {
      // Cleanup on error
      for (const file of uploadedFiles) {
        await deleteUploadedFile(file.name).catch(e => console.error("Failed to cleanup file:", e));
      }
      throw error;
    }
  } else {
    // Prompt embedding mode (default)
    const fullPrompt = `${prompt}

=== Step 2-2 仮説レポート ===
${step2_2Report}

=== Step 3 科学的評価結果 ===
${step3Output}

=== Step 4 戦略監査結果 ===
${step4Output}`;
    
    await addDebugPrompt(runId, `Step 5 仮説${hypothesisNumber} (${hypothesisTitle})`, fullPrompt, []);
    
    return generateWithFlash(fullPrompt);
  }
}

// Execute Step 2-2 Deep Research for a single hypothesis (can be run in parallel)
async function executeStep2_2ForHypothesis(
  client: any,
  hypothesis: ExtractedHypothesisFromStep2_1,
  hypothesisNumber: number,
  step2_1Output: string,
  context: PipelineContext,
  runId: number,
  startTime: number
): Promise<{ hypothesisNumber: number; hypothesisTitle: string; step2_2Output: string; durationMs: number }> {
  const step2_2Start = Date.now();
  const hypothesisTitle = hypothesis.title;
  
  // Check for pause/stop before starting Deep Research - throw to abort entire parallel batch
  if (isStopRequested(runId)) {
    console.log(`[Run ${runId}] Stop requested, aborting Step 2-2 for Hypothesis ${hypothesisNumber}`);
    throw new StopRequestedError(`仮説${hypothesisNumber}のStep 2-2が停止リクエストにより中断されました`);
  }
  if (isPauseRequested(runId)) {
    console.log(`[Run ${runId}] Pause requested, aborting Step 2-2 for Hypothesis ${hypothesisNumber}`);
    throw new PauseRequestedError(`仮説${hypothesisNumber}のStep 2-2が一時停止リクエストにより中断されました`);
  }
  
  console.log(`[Run ${runId}] Starting Step 2-2 for Hypothesis ${hypothesisNumber}: ${hypothesisTitle}`);
  
  let storeName: string | null = null;
  
  try {
    storeName = await createFileSearchStore(`gmethod-run-${runId}-h${hypothesisNumber}-${Date.now()}`);
    console.log(`[Run ${runId}] Created File Search Store for Hypothesis ${hypothesisNumber}: ${storeName}`);

    const hypothesisContext = `【対象仮説】
仮説番号: ${hypothesisNumber}
タイトル: ${hypothesis.title}
カテゴリ: ${hypothesis.category}
スコア: I=${hypothesis.scores.I}, M=${hypothesis.scores.M}, L=${hypothesis.scores.L}, U=${hypothesis.scores.U}, Total=${hypothesis.scores.total}

【Step 2-1からの詳細情報】
${hypothesis.rawText}

【Step 2-1全体の監査ストリップ（参考）】
${step2_1Output}`;

    const step2_2FileConfig = await getFileAttachments(22);
    const step2_2Attachments: string[] = [];

    if (step2_2FileConfig.includes('hypothesis_context')) {
      await uploadTextToFileSearchStore(storeName, hypothesisContext, "hypothesis_context");
      step2_2Attachments.push("hypothesis_context");
    }
    if (step2_2FileConfig.includes('target_specification')) {
      await uploadTextToFileSearchStore(storeName, context.targetSpec, "target_specification");
      step2_2Attachments.push("target_specification");
    }
    if (step2_2FileConfig.includes('technical_assets')) {
      await uploadTextToFileSearchStore(storeName, context.technicalAssets, "technical_assets");
      step2_2Attachments.push("technical_assets");
    }
    
    const researchPrompt2_2Template = await getDeepResearchPrompt2_2();
    const individualPrompt = researchPrompt2_2Template
      .replace(/{HYPOTHESIS_COUNT}/g, "1")
      .replace(/{HYPOTHESIS_NUMBER}/g, hypothesisNumber.toString())
      .replace(/{HYPOTHESIS_TITLE}/g, hypothesisTitle);
    
    await addDebugPrompt(runId, `Step 2-2 仮説${hypothesisNumber} (${hypothesisTitle})`, individualPrompt, step2_2Attachments);
    
    const step2_2Report = await runDeepResearchPhase(
      client, 
      individualPrompt, 
      storeName, 
      runId, 
      `Step 2-2 Hypothesis ${hypothesisNumber}`,
      startTime
    );
    
    await deleteFileSearchStore(storeName);
    storeName = null;
    
    const durationMs = Date.now() - step2_2Start;
    console.log(`[Run ${runId}] Hypothesis ${hypothesisNumber} Step 2-2 completed (${step2_2Report.length} chars, ${(durationMs / 1000).toFixed(1)}s)`);
    
    return {
      hypothesisNumber,
      hypothesisTitle,
      step2_2Output: step2_2Report,
      durationMs
    };
  } catch (error: any) {
    const durationMs = Date.now() - step2_2Start;
    console.error(`[Run ${runId}] Hypothesis ${hypothesisNumber} Step 2-2 failed after ${(durationMs / 1000).toFixed(1)}s:`, error);
    if (storeName) {
      await deleteFileSearchStore(storeName).catch(e => console.error("Failed to cleanup store:", e));
    }
    // Re-throw pause/stop errors so they bubble up and halt the parallel execution
    if (error instanceof PauseRequestedError || error instanceof StopRequestedError) {
      throw error;
    }
    return {
      hypothesisNumber,
      hypothesisTitle,
      step2_2Output: `【Step 2-2エラー】仮説${hypothesisNumber}のDeep Research失敗: ${error?.message || error}`,
      durationMs
    };
  }
}

// Wrapper function that reports progress for parallel visualization
async function executeStep2_2ForHypothesisWithProgress(
  client: any,
  hypothesis: ExtractedHypothesisFromStep2_1,
  hypothesisNumber: number,
  step2_1Output: string,
  context: PipelineContext,
  runId: number,
  startTime: number
): Promise<{ hypothesisNumber: number; hypothesisTitle: string; step2_2Output: string; durationMs: number }> {
  // Mark as running - use hypothesisNumber parameter for consistent numbering
  await updateParallelItemStatus(runId, hypothesisNumber, {
    status: "running",
    currentStep: "Step 2-2",
    startTime: Date.now(),
  });
  
  try {
    const result = await executeStep2_2ForHypothesis(
      client,
      hypothesis,
      hypothesisNumber,
      step2_1Output,
      context,
      runId,
      startTime
    );
    
    // Mark as completed
    await updateParallelItemStatus(runId, hypothesisNumber, {
      status: "completed",
      endTime: Date.now(),
    });
    
    return result;
  } catch (error) {
    // Mark as error
    await updateParallelItemStatus(runId, hypothesisNumber, {
      status: "error",
      endTime: Date.now(),
    });
    throw error;
  }
}

// Process Steps 3 → 4 → 5 for a single hypothesis (after Step 2-2 is complete)
async function processSteps3to5ForHypothesis(
  client: GoogleGenAI,
  hypothesisNumber: number,
  hypothesisTitle: string,
  step2_2Output: string,
  context: PipelineContext,
  runId: number,
  startTime: number,
  stepTimings: { [key: string]: number }
): Promise<PerHypothesisResult> {
  const processStart = Date.now();
  console.log(`[Run ${runId}] Processing Steps 3-5 for Hypothesis ${hypothesisNumber}: ${hypothesisTitle}`);
  
  let step3Ms = 0, step4Ms = 0, step5Ms = 0;
  
  // === Step 3: Scientific Evaluation for this hypothesis ===
  let step3Output = "";
  const step3Start = Date.now();
  try {
    
    await updateProgress(runId, { 
      currentPhase: `hypothesis_${hypothesisNumber}_step3`, 
      planningAnalysis: `仮説${hypothesisNumber}「${hypothesisTitle}」: Step 3 科学的評価実行中...`,
      stepTimings,
      stepStartTime: startTime,
    });
    
    step3Output = await executeStep3Individual(
      client,
      hypothesisNumber,
      hypothesisTitle,
      step2_2Output,
      context.targetSpec,
      context.technicalAssets,
      runId,
      startTime
    );
    
    step3Ms = Date.now() - step3Start;
    stepTimings[`h${hypothesisNumber}_step3`] = step3Ms;
    console.log(`[Run ${runId}] Hypothesis ${hypothesisNumber} Step 3 completed (${step3Output.length} chars, ${(step3Ms / 1000).toFixed(1)}s)`);
  } catch (step3Error: any) {
    step3Ms = Date.now() - step3Start;
    console.error(`[Run ${runId}] Hypothesis ${hypothesisNumber} Step 3 failed:`, step3Error);
    step3Output = `【Step 3エラー】仮説${hypothesisNumber}の科学的評価に失敗: ${step3Error?.message || step3Error}`;
  }
  
  // === Step 4: Strategic Audit for this hypothesis ===
  let step4Output = "";
  const step4Start = Date.now();
  try {
    await updateProgress(runId, { 
      currentPhase: `hypothesis_${hypothesisNumber}_step4`, 
      planningAnalysis: `仮説${hypothesisNumber}「${hypothesisTitle}」: Step 4 戦略監査実行中...`,
      stepTimings,
      stepStartTime: startTime,
    });
    
    step4Output = await executeStep4Individual(
      client,
      hypothesisNumber,
      hypothesisTitle,
      step2_2Output,
      step3Output,
      context.targetSpec,
      context.technicalAssets,
      runId,
      startTime
    );
    
    step4Ms = Date.now() - step4Start;
    stepTimings[`h${hypothesisNumber}_step4`] = step4Ms;
    console.log(`[Run ${runId}] Hypothesis ${hypothesisNumber} Step 4 completed (${step4Output.length} chars, ${(step4Ms / 1000).toFixed(1)}s)`);
  } catch (step4Error: any) {
    step4Ms = Date.now() - step4Start;
    console.error(`[Run ${runId}] Hypothesis ${hypothesisNumber} Step 4 failed:`, step4Error);
    step4Output = `【Step 4エラー】仮説${hypothesisNumber}の戦略監査に失敗: ${step4Error?.message || step4Error}`;
  }
  
  // === Step 5: TSV Row Generation for this hypothesis ===
  let step5Output = "";
  const step5Start = Date.now();
  try {
    await updateProgress(runId, { 
      currentPhase: `hypothesis_${hypothesisNumber}_step5`, 
      planningAnalysis: `仮説${hypothesisNumber}「${hypothesisTitle}」: Step 5 データ抽出実行中...`,
      stepTimings,
      stepStartTime: startTime,
    });
    
    step5Output = await executeStep5Individual(
      client,
      hypothesisNumber,
      hypothesisTitle,
      step2_2Output,
      step3Output,
      step4Output,
      runId,
      startTime
    );
    
    step5Ms = Date.now() - step5Start;
    stepTimings[`h${hypothesisNumber}_step5`] = step5Ms;
    console.log(`[Run ${runId}] Hypothesis ${hypothesisNumber} Step 5 completed (${step5Output.length} chars, ${(step5Ms / 1000).toFixed(1)}s)`);
  } catch (step5Error: any) {
    step5Ms = Date.now() - step5Start;
    console.error(`[Run ${runId}] Hypothesis ${hypothesisNumber} Step 5 failed:`, step5Error);
    step5Output = `${hypothesisNumber}\t${hypothesisTitle}\t【エラー】データ抽出失敗`;
  }
  
  const totalMs = Date.now() - processStart;
  console.log(`[Run ${runId}] Hypothesis ${hypothesisNumber} Steps 3-5 total: ${(totalMs / 1000).toFixed(1)}s (S3:${(step3Ms/1000).toFixed(1)}s, S4:${(step4Ms/1000).toFixed(1)}s, S5:${(step5Ms/1000).toFixed(1)}s)`);
  
  return {
    hypothesisNumber,
    hypothesisTitle,
    step2_2Output,
    step3Output,
    step4Output,
    step5Output: step5Output.trim(),
    timing: {
      step3Ms,
      step4Ms,
      step5Ms,
      totalMs
    }
  };
}

// Wrapper function that reports progress for parallel visualization
async function processSteps3to5ForHypothesisWithProgress(
  client: GoogleGenAI,
  hypothesisNumber: number,
  hypothesisTitle: string,
  step2_2Output: string,
  context: PipelineContext,
  runId: number,
  startTime: number,
  stepTimings: { [key: string]: number }
): Promise<PerHypothesisResult> {
  // Mark as running
  await updateParallelItemStatus(runId, hypothesisNumber, {
    status: "running",
    currentStep: "Steps 3-5",
    startTime: Date.now(),
  });
  
  try {
    const result = await processSteps3to5ForHypothesis(
      client,
      hypothesisNumber,
      hypothesisTitle,
      step2_2Output,
      context,
      runId,
      startTime,
      stepTimings
    );
    
    // Mark as completed
    await updateParallelItemStatus(runId, hypothesisNumber, {
      status: "completed",
      endTime: Date.now(),
    });
    
    return result;
  } catch (error) {
    // Mark as error
    await updateParallelItemStatus(runId, hypothesisNumber, {
      status: "error",
      endTime: Date.now(),
    });
    throw error;
  }
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

function computeContentHash(data: Record<string, string>): string {
  const sortedKeys = Object.keys(data).sort();
  const normalized = sortedKeys.map(k => `${k}:${data[k]}`).join('|');
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function extractDisplayTitle(row: Record<string, string>, hypothesisNumber: number): string {
  const titleKeys = ["仮説タイトル", "タイトル", "Title", "title", "仮説名", "事業仮説"];
  for (const key of titleKeys) {
    if (row[key]) return row[key];
  }
  const firstKey = Object.keys(row)[0];
  if (firstKey && row[firstKey]) {
    return row[firstKey].substring(0, 100);
  }
  return `仮説 ${hypothesisNumber}`;
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
    const displayTitle = extractDisplayTitle(row, hypothesisNumber);
    const contentHash = computeContentHash(row);
    
    return {
      projectId,
      runId,
      targetSpecId: targetSpecId ?? null,
      technicalAssetsId: technicalAssetsId ?? null,
      hypothesisNumber,
      displayTitle,
      contentHash,
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
    const data = h.fullData as Record<string, string> | null;
    const title = h.displayTitle || "タイトル不明";
    
    if (!data) {
      return `${index + 1}. 【${title}】`;
    }
    
    const keys = Object.keys(data).slice(0, 5);
    const details = keys.map(k => `${k}: ${data[k] || "不明"}`).join(" / ");
    return `${index + 1}. 【${title}】\n   ${details}`;
  });
  
  return summaryLines.join("\n\n");
}

interface Step2ResultWithRetry {
  report: string;
  searchQueries: string[];
  iterationCount: number;
  validationResult: ValidationResultWithAction;
  retried: boolean;
  step2_1Output?: string;
  step2_2Output?: string;
  step2_2IndividualOutputs?: string[];
  // New pipeline: aggregated outputs from per-hypothesis processing
  step3Output?: string;
  step4Output?: string;
  step5Output?: string;
  step3IndividualOutputs?: string[];
  step4IndividualOutputs?: string[];
  step5IndividualOutputs?: string[];
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
      step2_1Output: result.step2_1Output,
      step2_2Output: result.step2_2Output,
      step2_2IndividualOutputs: result.step2_2IndividualOutputs,
      step3Output: result.step3Output,
      step4Output: result.step4Output,
      step5Output: result.step5Output,
      step3IndividualOutputs: result.step3IndividualOutputs,
      step4IndividualOutputs: result.step4IndividualOutputs,
      step5IndividualOutputs: result.step5IndividualOutputs,
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
    step2_1Output: result.step2_1Output,
    step2_2Output: result.step2_2Output,
    step2_2IndividualOutputs: result.step2_2IndividualOutputs,
    step3Output: result.step3Output,
    step4Output: result.step4Output,
    step5Output: result.step5Output,
    step3IndividualOutputs: result.step3IndividualOutputs,
    step4IndividualOutputs: result.step4IndividualOutputs,
    step5IndividualOutputs: result.step5IndividualOutputs,
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
  // Acquire lock to prevent duplicate execution
  if (!acquireRunLock(runId)) {
    console.error(`[Run ${runId}] Pipeline execution blocked - already running`);
    return;
  }

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

      // Step 2: Deep Research (now includes Steps 2-2, 3, 4, 5 per hypothesis)
      // New pipeline architecture: Each hypothesis is processed through 2-2→3→4→5 sequentially
      let deepResearchResult: Step2ResultWithRetry | null = null;
      
      if (loopStartStep <= 2) {
        const step2StartTime = Date.now();
        await updateStepDuration(runId, 'step2', { startTime: step2StartTime });
        
        deepResearchResult = await executeStep2WithRetry(context, runId);
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
        console.log(`[Run ${runId}] Loop ${loopIndex} Full pipeline completed in ${Math.round((step2EndTime - step2StartTime) / 1000)}s: ${deepResearchResult.iterationCount} iterations${deepResearchResult.retried ? " (retried)" : ""}`);
        
        if (!deepResearchResult.validationResult.isValid) {
          const warningMessage = `品質検証警告: ${deepResearchResult.validationResult.errors.slice(0, 3).join("; ")}`;
          console.warn(`[Run ${runId}] ${warningMessage}`);
          // Note: step2_2IndividualOutputs already saved with appending in executeStep2FullPipeline
          await storage.updateRun(runId, { 
            step2Output: context.step2Output, 
            currentStep: 5,
            validationMetadata,
            errorMessage: warningMessage,
          });
        } else {
          // Note: step2_2IndividualOutputs already saved with appending in executeStep2FullPipeline
          await storage.updateRun(runId, { 
            step2Output: context.step2Output, 
            currentStep: 5,
            validationMetadata,
          });
        }

        // Check pause/stop after step 2 (full pipeline)
        const control = await checkPipelineControl(runId);
        if (control === "stop") {
          await storage.updateRun(runId, { status: "error", errorMessage: "ユーザーにより停止されました" });
          return;
        }
        if (control === "pause") {
          await storage.updateRun(runId, { status: "paused" });
          console.log(`[Run ${runId}] Paused after loop ${loopIndex} full pipeline`);
          return;
        }
      }

      // Steps 3, 4, 5 are now processed per-hypothesis within Step 2
      // The aggregated outputs are available in deepResearchResult
      // We use the pre-computed Step 5 TSV output from the per-hypothesis processing
      
      // Get Step 5 output (TSV) from the deep research result or from stored context
      const currentRun = await storage.getRun(runId);
      
      // Retrieve the aggregated Step 5 output from the database
      // The per-hypothesis processing already saved step5IndividualOutputs
      const step5IndividualOutputs = currentRun?.step5IndividualOutputs as string[] | null;
      
      // Build Step 5 output (TSV) from individual outputs using dynamic header extraction
      if (step5IndividualOutputs && step5IndividualOutputs.length > 0) {
        context.step5Output = aggregateStep5Outputs(step5IndividualOutputs);
      } else {
        context.step5Output = "";
      }
      
      console.log(`[Run ${runId}] Loop ${loopIndex} Step 5 TSV built from ${step5IndividualOutputs?.length || 0} individual outputs`);
      
      const integratedList = parseTSVToJSON(context.step5Output);
      
      // Get the next available hypothesis number for this project
      const nextHypothesisNumber = await storage.getNextHypothesisNumber(currentRun!.projectId);
      
      const hypothesesData = extractHypothesesFromTSV(
        context.step5Output,
        currentRun!.projectId,
        runId,
        nextHypothesisNumber,
        currentRun!.targetSpecId,
        currentRun!.technicalAssetsId
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
  } finally {
    // Always release the lock when pipeline ends
    releaseRunLock(runId);
  }
}

// Resume a paused or running pipeline (used after pause/resume or interrupted resume)
export async function resumePipeline(runId: number): Promise<void> {
  const run = await storage.getRun(runId);
  if (!run) {
    throw new Error("Run not found");
  }
  
  // Allow resume if running (for interrupted resume) or paused
  if (run.status !== "paused" && run.status !== "running") {
    throw new Error("Run is not in a resumable state");
  }
  
  // Clear any stale pause/stop requests from before the interruption
  clearControlRequests(runId);
  
  // Resume from the current step (not next step) since pause happens after step completion
  // If paused between loops, currentStep will be 2 and we resume from step 2 of the next loop
  const resumeStep = run.currentStep || 2;
  const currentLoop = run.currentLoop || 1;
  const resumeCount = run.resumeCount || 0;
  console.log(`[Run ${runId}] Resuming from loop ${currentLoop}, step ${resumeStep}${resumeCount > 0 ? ` (resume attempt ${resumeCount})` : ''}`);
  
  await executeGMethodPipeline(runId, resumeStep);
}

// Reprocess pipeline - upload STEP2-2 output and run STEP3 onwards
export async function executeReprocessPipeline(runId: number): Promise<void> {
  // Acquire lock to prevent duplicate execution
  if (!acquireRunLock(runId)) {
    console.error(`[Run ${runId}] Reprocess pipeline execution blocked - already running`);
    return;
  }

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

    if (run.reprocessMode !== 1 || !run.reprocessUploadedContent) {
      throw new Error("This run is not in reprocess mode or missing uploaded content");
    }

    const technicalAssets = run.technicalAssetsId ? await storage.getResource(run.technicalAssetsId) : null;
    const customPrompt = run.reprocessCustomPrompt || "";
    const modelChoice = run.reprocessModelChoice || "pro";
    const hypothesisCount = run.hypothesisCount || 5;

    console.log(`[Run ${runId}] Starting reprocess pipeline with model=${modelChoice}, hypotheses=${hypothesisCount}`);
    await storage.updateRun(runId, { status: "running", currentStep: 2 });

    // Split uploaded content into individual hypothesis documents
    const hypothesisDocuments = splitReprocessContent(run.reprocessUploadedContent, customPrompt, hypothesisCount);
    console.log(`[Run ${runId}] Split into ${hypothesisDocuments.length} hypothesis documents`);

    if (hypothesisDocuments.length === 0) {
      throw new Error("アップロードされたコンテンツから仮説を抽出できませんでした");
    }

    // Store as STEP2-2 individual outputs
    const step2_2Outputs: Array<{ hypothesisIndex: number; content: string }> = hypothesisDocuments.map((doc, i) => ({
      hypothesisIndex: i + 1,
      content: doc.content,
    }));

    await storage.updateRun(runId, {
      step2_2IndividualOutputs: step2_2Outputs,
      currentStep: 3,
    });

    // Initialize progress info for parallel execution
    const progressInfo = {
      totalHypotheses: hypothesisDocuments.length,
      completedHypotheses: 0,
      currentlyProcessing: [] as number[],
      parallelSteps: { step3: 0, step4: 0, step5: 0 },
    };
    await storage.updateRun(runId, { progressInfo });

    // Execute STEP3→4→5 for each hypothesis in parallel
    const processingPromises = hypothesisDocuments.map(async (doc, index) => {
      const hypothesisNumber = index + 1;
      console.log(`[Run ${runId}] Processing hypothesis ${hypothesisNumber}/${hypothesisDocuments.length}`);

      try {
        // Create context for this hypothesis
        const hypothesisContext = {
          title: doc.title,
          content: doc.content,
          technicalAssets: technicalAssets?.content || "",
        };

        // Execute STEP3
        const step3Output = await executeReprocessStep3(hypothesisContext, modelChoice, runId, hypothesisNumber);
        
        // Execute STEP4
        const step4Output = await executeReprocessStep4(hypothesisContext, step3Output, modelChoice, runId, hypothesisNumber);
        
        // Execute STEP5
        const step5Output = await executeReprocessStep5(hypothesisContext, step3Output, step4Output, modelChoice, runId, hypothesisNumber);

        return {
          hypothesisNumber,
          title: doc.title,
          step3Output,
          step4Output,
          step5Output,
          success: true as const,
        };
      } catch (error) {
        console.error(`[Run ${runId}] Error processing hypothesis ${hypothesisNumber}:`, error);
        return {
          hypothesisNumber,
          title: doc.title,
          step3Output: "",
          step4Output: "",
          step5Output: "",
          success: false as const,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });
    
    const results = await Promise.all(processingPromises);

    // Aggregate outputs
    const step3IndividualOutputs = results.map(r => ({
      hypothesisIndex: r.hypothesisNumber,
      content: r.step3Output,
    }));
    const step4IndividualOutputs = results.map(r => ({
      hypothesisIndex: r.hypothesisNumber,
      content: r.step4Output,
    }));
    const step5IndividualOutputs = results.map(r => ({
      hypothesisIndex: r.hypothesisNumber,
      content: r.step5Output,
    }));

    // Aggregate STEP5 outputs into TSV
    const step5Outputs = results.filter(r => r.success).map(r => r.step5Output);
    const aggregatedTSV = aggregateStep5Outputs(step5Outputs);

    // Create integrated list
    const integratedList = step2_2Outputs.map((h, i) => ({
      number: i + 1,
      title: hypothesisDocuments[i]?.title || `仮説${i + 1}`,
      step2_2: h.content,
      step3: step3IndividualOutputs[i]?.content || "",
      step4: step4IndividualOutputs[i]?.content || "",
      step5: step5IndividualOutputs[i]?.content || "",
    }));

    // Save hypotheses to database using the correct schema
    const nextHypothesisNumber = await storage.getNextHypothesisNumber(run.projectId);
    const hypothesesToCreate: InsertHypothesis[] = [];
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result && result.success) {
        // Parse STEP5 output to get fullData
        const step5Lines = result.step5Output.split('\n').filter(line => line.trim());
        let fullData: Record<string, string> = {};
        
        if (step5Lines.length >= 2) {
          const headers = step5Lines[0].split('\t');
          const values = step5Lines[1].split('\t');
          headers.forEach((h, idx) => {
            fullData[h.trim()] = values[idx]?.trim() || '';
          });
        } else {
          // Fallback if STEP5 output doesn't have expected format
          fullData = {
            'タイトル': result.title,
            'STEP2-2レポート': hypothesisDocuments[i]?.content.slice(0, 500) || '',
            'STEP3評価': result.step3Output.slice(0, 500),
            'STEP4評価': result.step4Output.slice(0, 500),
          };
        }
        
        const displayTitle = extractDisplayTitle(fullData, nextHypothesisNumber + i);
        const contentHash = computeContentHash(fullData);
        
        hypothesesToCreate.push({
          projectId: run.projectId,
          runId: runId,
          targetSpecId: run.targetSpecId,  // Use the same as technicalAssetsId (placeholder for reprocess)
          technicalAssetsId: run.technicalAssetsId,
          hypothesisNumber: nextHypothesisNumber + i,
          displayTitle,
          contentHash,
          fullData,
        });
      }
    }
    
    if (hypothesesToCreate.length > 0) {
      await storage.createHypotheses(hypothesesToCreate);
      console.log(`[Run ${runId}] Saved ${hypothesesToCreate.length} hypotheses to database`);
    }

    // Update run with final outputs
    await storage.updateRun(runId, {
      step3Output: step3IndividualOutputs.map(o => o.content).join("\n\n---\n\n"),
      step4Output: step4IndividualOutputs.map(o => o.content).join("\n\n---\n\n"),
      step5Output: aggregatedTSV,
      step3IndividualOutputs,
      step4IndividualOutputs,
      step5IndividualOutputs,
      integratedList,
      status: "completed",
      completedAt: new Date(),
      currentStep: 5,
    });

    console.log(`[Run ${runId}] Reprocess pipeline completed successfully`);
  } catch (error) {
    console.error(`[Run ${runId}] Reprocess pipeline error:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    await storage.updateRun(runId, {
      status: "error",
      errorMessage: errorMessage,
    });
    clearControlRequests(runId);
  } finally {
    releaseRunLock(runId);
  }
}

// Helper function to split reprocess uploaded content into individual hypothesis documents
function splitReprocessContent(content: string, customPrompt: string, maxHypotheses: number): Array<{ title: string; content: string }> {
  const documents: Array<{ title: string; content: string }> = [];
  
  // Try to split by common delimiters (--- or ### or numbered sections)
  // First, try splitting by horizontal rules
  let sections = content.split(/\n---+\n/);
  
  if (sections.length === 1) {
    // Try splitting by markdown headers (## or ###)
    sections = content.split(/\n(?=#{2,3}\s)/);
  }
  
  if (sections.length === 1) {
    // Try splitting by numbered sections like "1. " or "【1】"
    sections = content.split(/\n(?=\d+[\.。]\s|【\d+】)/);
  }
  
  for (let i = 0; i < Math.min(sections.length, maxHypotheses); i++) {
    const section = sections[i].trim();
    if (!section) continue;
    
    // Extract title from first line or heading
    const lines = section.split("\n");
    let title = lines[0].replace(/^#{1,3}\s*/, "").replace(/^【\d+】\s*/, "").replace(/^\d+[\.。]\s*/, "").trim();
    if (title.length > 100) {
      title = title.substring(0, 100) + "...";
    }
    
    // Prepend custom prompt if provided
    const finalContent = customPrompt ? `${customPrompt}\n\n${section}` : section;
    
    documents.push({
      title: title || `仮説${i + 1}`,
      content: finalContent,
    });
  }
  
  return documents;
}

// Execute STEP3 for reprocess mode
async function executeReprocessStep3(
  context: { title: string; content: string; technicalAssets: string },
  modelChoice: string,
  runId: number,
  hypothesisNumber: number
): Promise<string> {
  const prompt = STEP3_INDIVIDUAL_PROMPT
    .replace("{HYPOTHESIS_TITLE}", context.title)
    .replace("{STEP2_2_REPORT}", context.content)
    .replace("{TARGET_SPECIFICATION}", "")  // Not available in reprocess mode
    .replace("{TECHNICAL_ASSETS}", context.technicalAssets);
  
  console.log(`[Run ${runId}] Reprocess STEP3 for hypothesis ${hypothesisNumber} (${modelChoice})`);
  
  if (modelChoice === "flash") {
    return await generateWithFlash(prompt);
  } else {
    return await generateWithPro(prompt);
  }
}

// Execute STEP4 for reprocess mode
async function executeReprocessStep4(
  context: { title: string; content: string; technicalAssets: string },
  step3Output: string,
  modelChoice: string,
  runId: number,
  hypothesisNumber: number
): Promise<string> {
  const prompt = STEP4_INDIVIDUAL_PROMPT
    .replace("{HYPOTHESIS_TITLE}", context.title)
    .replace("{STEP2_2_REPORT}", context.content)
    .replace("{STEP3_OUTPUT}", step3Output)
    .replace("{TARGET_SPECIFICATION}", "")  // Not available in reprocess mode
    .replace("{TECHNICAL_ASSETS}", context.technicalAssets);
  
  console.log(`[Run ${runId}] Reprocess STEP4 for hypothesis ${hypothesisNumber} (${modelChoice})`);
  
  if (modelChoice === "flash") {
    return await generateWithFlash(prompt);
  } else {
    return await generateWithPro(prompt);
  }
}

// Execute STEP5 for reprocess mode
async function executeReprocessStep5(
  context: { title: string; content: string; technicalAssets: string },
  step3Output: string,
  step4Output: string,
  modelChoice: string,
  runId: number,
  hypothesisNumber: number
): Promise<string> {
  // Get STEP5 template from database or use default
  const step5Template = await storage.getActivePrompt(5);
  const step5Prompt = step5Template?.content || STEP5_INDIVIDUAL_PROMPT;
  
  const prompt = step5Prompt
    .replace("{HYPOTHESIS_TITLE}", context.title)
    .replace("{STEP2_2_REPORT}", context.content)
    .replace("{STEP3_OUTPUT}", step3Output)
    .replace("{STEP4_OUTPUT}", step4Output);
  
  console.log(`[Run ${runId}] Reprocess STEP5 for hypothesis ${hypothesisNumber} (${modelChoice})`);
  
  if (modelChoice === "flash") {
    return await generateWithFlash(prompt);
  } else {
    return await generateWithPro(prompt);
  }
}
