import { GoogleGenAI } from "@google/genai";
import { storage } from "./storage";
import { STEP2_PROMPT, STEP3_PROMPT, STEP4_PROMPT, STEP5_PROMPT } from "./prompts";
import type { InsertHypothesis } from "@shared/schema";

const MODEL_PRO = "gemini-3-pro-preview";
const MODEL_FLASH = "gemini-3-flash-preview";

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
      httpOptions: { apiVersion: "v1alpha" },
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

interface ProgressInfo {
  planningAnalysis?: string;
  planningQueries?: string[];
  currentPhase?: string;
  currentIteration?: number;
  maxIterations?: number;
  stepTimings?: { [key: string]: number };
  phaseStartTime?: number;
  stepStartTime?: number;
}

async function updateProgress(runId: number, progressInfo: ProgressInfo): Promise<void> {
  await storage.updateRun(runId, { progressInfo });
}

async function executeDeepResearchStep2(context: PipelineContext, runId: number): Promise<DeepResearchResult> {
  const searchQueries: string[] = [];
  let searchResults = "";
  let iterationCount = 0;
  const maxIterations = 3;
  const stepTimings: { [key: string]: number } = {};

  const planningStartTime = Date.now();
  await updateProgress(runId, { 
    currentPhase: "planning", 
    currentIteration: 0, 
    maxIterations,
    stepTimings,
    stepStartTime: planningStartTime,
  });

  console.log(`[Run ${runId}] Phase 1: Planning...`);
  const planningPrompt = PLANNING_PROMPT
    .replace("{TARGET_SPEC}", context.targetSpec)
    .replace("{TECHNICAL_ASSETS}", context.technicalAssets)
    .replace("{PREVIOUS_HYPOTHESES}", context.previousHypotheses || "なし（初回実行）");
  
  const planningResult = await generateWithFlash(planningPrompt);
  stepTimings["planning"] = Date.now() - planningStartTime;
  
  let queries: string[] = [];
  let planningAnalysis = "";
  try {
    const jsonMatch = planningResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      queries = parsed.queries || [];
      planningAnalysis = parsed.analysis || "";
    }
  } catch (e) {
    console.log(`[Run ${runId}] Planning JSON parse failed, using fallback queries`);
    queries = [
      `${context.targetSpec.slice(0, 100)} 市場動向`,
      `${context.technicalAssets.slice(0, 100)} 応用`,
    ];
  }
  searchQueries.push(...queries);
  
  await updateProgress(runId, { 
    currentPhase: "exploring", 
    currentIteration: 1, 
    maxIterations,
    planningAnalysis,
    planningQueries: queries,
    stepTimings,
    stepStartTime: planningStartTime,
  });

  while (iterationCount < maxIterations) {
    iterationCount++;
    const iterationStartTime = Date.now();
    
    await updateProgress(runId, { 
      currentPhase: "exploring", 
      currentIteration: iterationCount, 
      maxIterations,
      planningAnalysis,
      planningQueries: searchQueries,
      stepTimings,
      stepStartTime: planningStartTime,
    });
    
    console.log(`[Run ${runId}] Phase 2: Exploring (iteration ${iterationCount}/${maxIterations})...`);
    
    const explorationPrompt = EXPLORATION_PROMPT
      .replace("{QUERIES}", queries.join("\n"))
      .replace("{TARGET_SPEC}", context.targetSpec)
      .replace("{TECHNICAL_ASSETS}", context.technicalAssets);
    
    const explorationResult = await generateWithFlashAndSearch(explorationPrompt);
    searchResults += `\n\n【探索結果 ${iterationCount}】\n${explorationResult}`;
    stepTimings[`exploring_${iterationCount}`] = Date.now() - iterationStartTime;

    const reasoningStartTime = Date.now();
    await updateProgress(runId, { 
      currentPhase: "reasoning", 
      currentIteration: iterationCount, 
      maxIterations,
      planningAnalysis,
      planningQueries: searchQueries,
      stepTimings,
      stepStartTime: planningStartTime,
    });
    
    console.log(`[Run ${runId}] Phase 3: Reasoning (iteration ${iterationCount}/${maxIterations})...`);
    const reasoningPrompt = REASONING_PROMPT
      .replace("{SEARCH_RESULTS}", searchResults)
      .replace("{TARGET_SPEC}", context.targetSpec)
      .replace("{TECHNICAL_ASSETS}", context.technicalAssets)
      .replace("{HYPOTHESIS_COUNT}", context.hypothesisCount.toString());
    
    const reasoningResult = await generateWithFlash(reasoningPrompt);
    stepTimings[`reasoning_${iterationCount}`] = Date.now() - reasoningStartTime;
    
    try {
      const jsonMatch = reasoningResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.isSufficient || parsed.confidence >= 0.8) {
          console.log(`[Run ${runId}] Sufficient information gathered (confidence: ${parsed.confidence})`);
          break;
        }
        if (parsed.additionalQueries && parsed.additionalQueries.length > 0) {
          queries = parsed.additionalQueries;
          searchQueries.push(...queries);
        } else {
          break;
        }
      } else {
        break;
      }
    } catch (e) {
      console.log(`[Run ${runId}] Reasoning JSON parse failed, proceeding to synthesis`);
      break;
    }
  }

  const synthesisStartTime = Date.now();
  await updateProgress(runId, { 
    currentPhase: "synthesizing", 
    currentIteration: iterationCount, 
    maxIterations,
    planningAnalysis,
    planningQueries: searchQueries,
    stepTimings,
    stepStartTime: planningStartTime,
  });
  
  console.log(`[Run ${runId}] Phase 4: Synthesizing with Pro model...`);
  
  let synthesisPrompt = STEP2_PROMPT
    .replace(/{HYPOTHESIS_COUNT}/g, context.hypothesisCount.toString())
    .replace("{TARGET_SPEC}", context.targetSpec)
    .replace("{TECHNICAL_ASSETS}", context.technicalAssets)
    .replace("{PREVIOUS_HYPOTHESES}", context.previousHypotheses || "なし（初回実行）");
  
  synthesisPrompt = `【収集した調査情報】
${searchResults}

---

${synthesisPrompt}

【重要な追加指示】
- 上記の調査情報を活用して、より具体的で根拠のある仮説を生成してください。
- リサーチ計画の承認を待つ必要はありません。一回で完全なレポートを出力してください。
- 対話的なやり取りは不要です。最終的なレポートのみを出力してください。`;

  const report = await generateWithPro(synthesisPrompt);
  stepTimings["synthesizing"] = Date.now() - synthesisStartTime;

  const validationStartTime = Date.now();
  await updateProgress(runId, { 
    currentPhase: "validating", 
    currentIteration: iterationCount, 
    maxIterations,
    planningAnalysis,
    planningQueries: searchQueries,
    stepTimings,
    stepStartTime: planningStartTime,
  });
  
  console.log(`[Run ${runId}] Post-process: Validating hypotheses...`);
  const validationResult = await validateHypotheses(report, context.hypothesisCount, runId);
  stepTimings["validating"] = Date.now() - validationStartTime;

  await updateProgress(runId, { 
    currentPhase: "completed", 
    currentIteration: iterationCount, 
    maxIterations,
    planningAnalysis,
    planningQueries: searchQueries,
    stepTimings,
    stepStartTime: planningStartTime,
  });

  return {
    report,
    searchQueries,
    iterationCount,
    validationResult,
  };
}

async function validateHypotheses(
  report: string, 
  expectedCount: number,
  runId: number
): Promise<ValidationResult> {
  const extractionPrompt = EXTRACTION_PROMPT.replace("{REPORT}", report);
  const extractionResult = await generateWithFlash(extractionPrompt);
  
  const result: ValidationResult = {
    hypothesisCount: 0,
    isValid: false,
    errors: [],
    extractedHypotheses: [],
  };

  try {
    const jsonMatch = extractionResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const hypotheses = parsed.hypotheses || [];
      result.hypothesisCount = hypotheses.length;
      result.extractedHypotheses = hypotheses;

      if (hypotheses.length !== expectedCount) {
        result.errors.push(`仮説数が期待値と異なります（期待: ${expectedCount}, 実際: ${hypotheses.length}）`);
      }

      hypotheses.forEach((h: ExtractedHypothesis, i: number) => {
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

      result.isValid = result.errors.length === 0;
    }
  } catch (e) {
    result.errors.push("仮説の抽出に失敗しました");
  }

  console.log(`[Run ${runId}] Validation result: ${result.isValid ? "PASS" : "FAIL"} (${result.errors.length} errors)`);
  if (result.errors.length > 0) {
    console.log(`[Run ${runId}] Validation errors:`, result.errors.slice(0, 5));
  }

  return result;
}

async function executeStep3(context: PipelineContext): Promise<string> {
  const prompt = STEP3_PROMPT
    .replace(/{HYPOTHESIS_COUNT}/g, context.hypothesisCount.toString())
    .replace("{TECHNICAL_ASSETS}", context.technicalAssets)
    .replace("{STEP2_OUTPUT}", context.step2Output || "");
  
  return generateWithPro(prompt);
}

async function executeStep4(context: PipelineContext): Promise<string> {
  const prompt = STEP4_PROMPT
    .replace(/{HYPOTHESIS_COUNT}/g, context.hypothesisCount.toString())
    .replace("{TECHNICAL_ASSETS}", context.technicalAssets)
    .replace("{STEP2_OUTPUT}", context.step2Output || "")
    .replace("{STEP3_OUTPUT}", context.step3Output || "");
  
  return generateWithPro(prompt);
}

async function executeStep5(context: PipelineContext): Promise<string> {
  const prompt = STEP5_PROMPT
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

    console.log(`[Run ${runId}] Starting Step 2 (Deep Research)...`);
    const deepResearchResult = await executeDeepResearchStep2(context, runId);
    context.step2Output = deepResearchResult.report;
    
    const validationMetadata = {
      searchQueries: deepResearchResult.searchQueries,
      iterationCount: deepResearchResult.iterationCount,
      validation: deepResearchResult.validationResult,
      validationPassed: deepResearchResult.validationResult.isValid,
    };
    console.log(`[Run ${runId}] Step 2 completed: ${deepResearchResult.iterationCount} iterations, ${deepResearchResult.searchQueries.length} queries`);
    
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

    console.log(`[Run ${runId}] Starting Step 3 (Scientific Evaluation with Pro)...`);
    context.step3Output = await executeStep3(context);
    await storage.updateRun(runId, { step3Output: context.step3Output, currentStep: 4 });

    console.log(`[Run ${runId}] Starting Step 4 (Strategic Audit with Pro)...`);
    context.step4Output = await executeStep4(context);
    await storage.updateRun(runId, { step4Output: context.step4Output, currentStep: 5 });

    console.log(`[Run ${runId}] Starting Step 5 (Integration with Flash)...`);
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
