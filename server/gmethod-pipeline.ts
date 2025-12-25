import { GoogleGenAI } from "@google/genai";
import { storage } from "./storage";
import { STEP2_PROMPT, STEP2_DEEP_RESEARCH_PROMPT, STEP2_1_DEEP_RESEARCH_PROMPT, STEP2_2_DEEP_RESEARCH_PROMPT, STEP3_PROMPT, STEP4_PROMPT, STEP5_PROMPT } from "./prompts";
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
      config: { 
        displayName,
        mimeType: 'text/plain'
      }
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

// Extended DeepResearchResult to include 2-phase outputs
interface TwoPhaseDeepResearchResult extends DeepResearchResult {
  step2_1Output: string;
  step2_2Output: string;
  step2_2IndividualOutputs?: string[];
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
async function summarizeReportForMerge(report: string, hypothesisNum: number): Promise<string> {
  const summarizePrompt = `以下の仮説レポートを、以下の構造で要約してください（800〜1200文字）：

【入力レポート】
${report.substring(0, 8000)}

【出力形式】
### 仮説${hypothesisNum}
- タイトル: [仮説タイトル]
- エグゼクティブサマリー: [100文字]
- 市場・顧客: [顧客セグメント、市場規模]
- Trade-off: [顧客のジレンマと素材必然性]
- メカニズム: [Structure→Property→Performance]
- Moat: [競争優位性]
- ロードマップ: [短期/中期/長期]
- リスク: [主要リスクと対策]
- 参考文献: [主要3-5件のURL]

重要：定量データ（市場規模、成長率など）を必ず含めてください。`;

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
  
  // First, summarize each report to reduce token count
  console.log(`[Run ${runId}] Summarizing individual reports...`);
  const summaries: string[] = [];
  for (let i = 0; i < individualReports.length; i++) {
    const summary = await summarizeReportForMerge(individualReports[i], i + 1);
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
  
  const mergePrompt = `あなたは戦略レポートの編集者です。以下の要約された個別仮説レポートを統合し、最終レポートを作成してください。

【Step 2-1の監査ストリップ（概要のみ）】
${step2_1Output.substring(0, 3000)}

【要約された個別仮説レポート】
${summarizedReportsSection}

【統合参考文献候補（重複除去済み、最初の20件）】
${allReferences.slice(0, 20).map((ref, idx) => `[${idx + 1}] ${ref}`).join('\n')}

【出力指示】
以下の構成で統合レポートを作成してください：

【レポートタイトル】
[市場・顧客ニーズ] における [自社技術] を活用した戦略的事業仮説ポートフォリオ (Top ${hypothesisCount} Selection)

【第1章：エグゼクティブサマリー】（600〜1000文字）
- The Shift: 市場の構造的変化
- The Pain: 解決すべき本質的課題
- The Solution: 提案する解決策
- The Value: 創出される価値

【第2章：事業機会を創出する構造的変曲点 (Why Now?)】

【第3章：戦略的事業仮説ポートフォリオ】
各仮説について、要約の内容を展開して記載（各500〜800文字）

【第4章：実行ロードマップ】

【第5章：リスク要因と対策】

【第6章：参考文献】
（重複除去、番号を振り直し）`;

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

    await uploadTextToFileSearchStore(fileSearchStoreName1, context.targetSpec, "target_specification");
    console.log(`[Run ${runId}] Uploaded target specification`);

    await uploadTextToFileSearchStore(fileSearchStoreName1, context.technicalAssets, "technical_assets");
    console.log(`[Run ${runId}] Uploaded technical assets`);

    if (context.previousHypotheses) {
      await uploadTextToFileSearchStore(fileSearchStoreName1, context.previousHypotheses, "previous_hypotheses");
      console.log(`[Run ${runId}] Uploaded previous hypotheses`);
    }

    stepTimings["step2_1_file_upload"] = Date.now() - startTime;

    // Get Step 2-1 prompt (divergent selection)
    let researchPrompt2_1 = await getDeepResearchPrompt2_1();
    researchPrompt2_1 = researchPrompt2_1
      .replace(/{HYPOTHESIS_COUNT}/g, context.hypothesisCount.toString())
      .replace("{PREVIOUS_HYPOTHESES}", context.previousHypotheses || "なし");
    
    console.log(`[Run ${runId}] Step 2-1 Prompt: ${researchPrompt2_1.length} chars`);

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

    // ===== PHASE 2: Step 2-2 Parallel (N個のDeep Researchを並列実行) =====
    console.log(`[Run ${runId}] === PHASE 2: Step 2-2 Parallel (${context.hypothesisCount}個の仮説を並列深掘り) ===`);
    
    const step2_2StartTime = Date.now();
    
    // Extract individual hypotheses from Step 2-1 output
    await updateProgress(runId, { 
      currentPhase: "step2_2_extracting", 
      currentIteration: 2, 
      maxIterations: context.hypothesisCount + 2,
      planningAnalysis: "Step 2-2: Step 2-1の結果から個別仮説を抽出中...",
      stepTimings,
      stepStartTime: startTime,
    });

    const extractedHypotheses = await extractHypothesesFromStep2_1(step2_1Output, context.hypothesisCount);
    console.log(`[Run ${runId}] Extracted ${extractedHypotheses.length} hypotheses for parallel processing`);

    // Get Step 2-2 prompt template (individual hypothesis deep-dive)
    const researchPrompt2_2Template = await getDeepResearchPrompt2_2();
    
    // Run N Deep Research tasks sequentially (due to rate limiting: 1 request/minute)
    const individualReports: string[] = [];
    const fileSearchStores: string[] = [];
    
    for (let i = 0; i < extractedHypotheses.length; i++) {
      const hypothesis = extractedHypotheses[i];
      const hypothesisNum = i + 1;
      
      console.log(`[Run ${runId}] Starting Deep Research for Hypothesis ${hypothesisNum}/${extractedHypotheses.length}: ${hypothesis.title}`);
      
      await updateProgress(runId, { 
        currentPhase: `step2_2_hypothesis_${hypothesisNum}`, 
        currentIteration: hypothesisNum + 1, 
        maxIterations: context.hypothesisCount + 2,
        planningAnalysis: `Step 2-2: 仮説${hypothesisNum}「${hypothesis.title}」をDeep Research中... (${hypothesisNum}/${extractedHypotheses.length})`,
        stepTimings,
        stepStartTime: startTime,
      });

      // Create File Search Store for this hypothesis
      const storeName = await createFileSearchStore(`gmethod-run-${runId}-step2-2-h${hypothesisNum}-${Date.now()}`);
      fileSearchStores.push(storeName);
      console.log(`[Run ${runId}] Created File Search Store for Hypothesis ${hypothesisNum}: ${storeName}`);

      // Upload context for this specific hypothesis
      const hypothesisContext = `【対象仮説】
仮説番号: ${hypothesisNum}
タイトル: ${hypothesis.title}
カテゴリ: ${hypothesis.category}
スコア: I=${hypothesis.scores.I}, M=${hypothesis.scores.M}, L=${hypothesis.scores.L}, U=${hypothesis.scores.U}, Total=${hypothesis.scores.total}

【Step 2-1からの詳細情報】
${hypothesis.rawText}

【Step 2-1全体の監査ストリップ（参考）】
${step2_1Output}`;

      await uploadTextToFileSearchStore(storeName, hypothesisContext, "hypothesis_context");
      await uploadTextToFileSearchStore(storeName, context.targetSpec, "target_specification");
      await uploadTextToFileSearchStore(storeName, context.technicalAssets, "technical_assets");
      
      // Customize prompt for this specific hypothesis
      const individualPrompt = researchPrompt2_2Template
        .replace(/{HYPOTHESIS_COUNT}/g, "1")
        .replace(/{HYPOTHESIS_NUMBER}/g, hypothesisNum.toString())
        .replace(/{HYPOTHESIS_TITLE}/g, hypothesis.title);
      
      try {
        // Execute Deep Research for this hypothesis
        const hypothesisReport = await runDeepResearchPhase(
          client, 
          individualPrompt, 
          storeName, 
          runId, 
          `Step 2-2 Hypothesis ${hypothesisNum}`,
          startTime
        );
        
        individualReports.push(hypothesisReport);
        console.log(`[Run ${runId}] Hypothesis ${hypothesisNum} completed. Output length: ${hypothesisReport.length} chars`);
        
        stepTimings[`step2_2_hypothesis_${hypothesisNum}`] = Date.now() - step2_2StartTime;
      } catch (error: any) {
        console.error(`[Run ${runId}] Hypothesis ${hypothesisNum} failed:`, error);
        individualReports.push(`【仮説${hypothesisNum}: ${hypothesis.title}】\nDeep Researchの実行に失敗しました: ${error?.message || error}`);
      }
      
      // Cleanup this hypothesis's File Search Store
      await deleteFileSearchStore(storeName);
    }
    
    stepTimings["step2_2_all_hypotheses"] = Date.now() - step2_2StartTime;
    console.log(`[Run ${runId}] All ${individualReports.length} hypothesis Deep Research tasks completed`);

    // ===== PHASE 3: Merge individual reports using Gemini 3.0 Pro =====
    console.log(`[Run ${runId}] === PHASE 3: Step 2-3 (統合レポート生成 - Gemini 3.0 Pro) ===`);
    
    const step2_3StartTime = Date.now();
    
    await updateProgress(runId, { 
      currentPhase: "step2_3_merging", 
      currentIteration: context.hypothesisCount + 2, 
      maxIterations: context.hypothesisCount + 2,
      planningAnalysis: "Step 2-3: 個別レポートを統合中（Gemini 3.0 Pro）...",
      stepTimings,
      stepStartTime: startTime,
    });

    step2_2Output = await mergeIndividualReports(step2_1Output, individualReports, context.hypothesisCount, runId);
    
    stepTimings["step2_3_merge"] = Date.now() - step2_3StartTime;
    console.log(`[Run ${runId}] Merge completed. Final report length: ${step2_2Output.length} chars`);

    // Save Step 2-2 output to database
    await storage.updateRun(runId, { step2_2Output });

    // ===== Combine outputs =====
    const combinedReport = `【Step 2-1：発散・選定フェーズ（監査ストリップ）】

${step2_1Output}

${'='.repeat(80)}

【Step 2-2：収束・深掘りフェーズ（${context.hypothesisCount}個のAIによる並列詳細分析 + 統合レポート）】

${step2_2Output}`;

    stepTimings["total"] = Date.now() - startTime;

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

    console.log(`[Run ${runId}] Three-Phase Deep Research completed. Total time: ${Math.floor(stepTimings["total"] / 1000)}s`);

    return {
      report: combinedReport,
      searchQueries: [],
      iterationCount: context.hypothesisCount + 2,
      validationResult,
      step2_1Output,
      step2_2Output,
      step2_2IndividualOutputs: individualReports
    };
  } catch (error: any) {
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
