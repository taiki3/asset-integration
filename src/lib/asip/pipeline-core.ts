/**
 * ASIP Pipeline Core - Refactored with Dependency Injection
 *
 * This module contains the core pipeline logic with injected dependencies,
 * making it easier to test and maintain.
 */

import {
  generateUUID,
  parseHypothesesFromOutput,
  extractJsonFromResponse,
  isHypothesesResponse,
  validateAndCleanHypotheses,
  buildHypothesisContext,
  ParsedHypothesis,
} from './utils';
import { formatPrompt, STEP3_PROMPT, STEP4_PROMPT, STEP5_PROMPT, buildInstructionDocument, ExistingHypothesis } from './prompts';

/**
 * Run status type
 */
export type RunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'error' | 'cancelled';

/**
 * Hypothesis processing status type
 */
export type HypothesisProcessingStatus = 'pending' | 'step2_2' | 'step3' | 'step4' | 'step5' | 'completed' | 'error';

/**
 * Progress info structure
 */
export interface ProgressInfo {
  message: string;
  phase: string;
  detail?: string;
  totalHypotheses?: number;
  processingHypotheses?: string[];
}

/**
 * Existing hypothesis filter configuration
 */
export interface ExistingHypothesisFilter {
  enabled: boolean;
  targetSpecIds?: number[];
  technicalAssetsIds?: number[];
}

/**
 * Run data structure
 */
export interface RunData {
  id: number;
  projectId: number;
  hypothesisCount: number;
  jobName?: string | null;
  targetSpecId?: number | null;
  technicalAssetsId?: number | null;
  progressInfo?: {
    existingFilter?: ExistingHypothesisFilter;
    [key: string]: unknown;
  } | null;
}

/**
 * Resource data structure
 */
export interface ResourceData {
  id: number;
  content: string;
}

/**
 * Hypothesis data structure
 */
export interface HypothesisData {
  uuid: string;
  displayTitle: string | null;
  hypothesisNumber: number;
  step2_1Summary?: string | null;
  step2_2Output?: string | null;
  step3Output?: string | null;
  step4Output?: string | null;
  step5Output?: string | null;
  processingStatus: HypothesisProcessingStatus | null;
  errorMessage?: string | null;
}

/**
 * Database operations interface
 */
export interface DatabaseOperations {
  getRun(runId: number): Promise<RunData | null>;
  getResource(resourceId: number): Promise<ResourceData | null>;
  updateRunStatus(runId: number, updates: Partial<{
    status: RunStatus;
    currentStep: number;
    errorMessage: string | null;
    step2_1Output: string;
    completedAt: Date;
    progressInfo: ProgressInfo;
    updatedAt: Date;
  }>): Promise<void>;
  createHypothesis(data: {
    uuid: string;
    projectId: number;
    runId: number;
    hypothesisNumber: number;
    indexInRun: number;
    displayTitle: string;
    step2_1Summary: string;
    processingStatus: HypothesisProcessingStatus;
    fullData: unknown;
  }): Promise<void>;
  getHypothesis(uuid: string): Promise<HypothesisData | null>;
  updateHypothesis(uuid: string, updates: Partial<{
    processingStatus: HypothesisProcessingStatus;
    step2_2Output: string;
    step3Output: string;
    step4Output: string;
    step5Output: string;
    errorMessage: string;
  }>): Promise<void>;
  getExistingHypotheses?(
    projectId: number,
    filter: { targetSpecIds?: number[]; technicalAssetsIds?: number[] }
  ): Promise<Array<{ title: string; summary: string }>>;
}

/**
 * AI operations interface
 */
export interface AIOperations {
  executeDeepResearch(params: {
    prompt: string;
    files: Array<{ name: string; content: string }>;
    storeName: string;
    onProgress?: (phase: string, detail: string) => void;
  }): Promise<string>;
  generateContent(params: {
    prompt: string;
    systemInstruction?: string;
  }): Promise<string>;
}

/**
 * Pipeline dependencies
 */
export interface PipelineDependencies {
  db: DatabaseOperations;
  ai: AIOperations;
  logger?: {
    log: (message: string) => void;
    error: (message: string, error?: unknown) => void;
    warn: (message: string) => void;
  };
}

/**
 * Default logger using console
 */
const defaultLogger = {
  log: (message: string) => console.log(`[Pipeline] ${message}`),
  error: (message: string, error?: unknown) => console.error(`[Pipeline] ${message}`, error),
  warn: (message: string) => console.warn(`[Pipeline] ${message}`),
};

/**
 * Structure hypotheses using AI
 */
export async function structureHypothesesWithAI(
  ai: AIOperations,
  rawOutput: string,
  targetCount: number
): Promise<ParsedHypothesis[]> {
  const structuringPrompt = `以下のDeep Researchレポートから、最も有望な事業仮説を${targetCount}件抽出し、JSON形式で出力してください。

=== Deep Research レポート ===
${rawOutput.slice(0, 50000)}

=== 出力形式 ===
以下のJSON形式で出力してください。JSONのみを出力し、他のテキストは含めないでください。

{
  "hypotheses": [
    {
      "title": "仮説のタイトル（50文字以内）",
      "summary": "仮説の概要説明（500文字程度）"
    }
  ]
}

=== 重要な条件 ===
1. 必ず${targetCount}件の仮説を抽出すること
2. タイトルは具体的で分かりやすいものにすること（技術名や市場名を含める）
3. 概要には市場機会、技術の活用方法、競合優位性を含めること
4. 重複や類似した仮説は統合すること
5. 最も有望で実現可能性の高いものを優先すること`;

  try {
    const response = await ai.generateContent({ prompt: structuringPrompt });
    const parsed = extractJsonFromResponse(response, isHypothesesResponse);

    if (!parsed) {
      return [];
    }

    return validateAndCleanHypotheses(parsed.hypotheses);
  } catch {
    return [];
  }
}

/**
 * Process Step 2-2: Deep Research for a single hypothesis
 */
export async function processStep2_2(
  deps: PipelineDependencies,
  runId: number,
  hypothesisUuid: string,
  targetSpecContent: string,
  technicalAssetsContent: string
): Promise<void> {
  const { db, ai, logger = defaultLogger } = deps;

  const hypothesis = await db.getHypothesis(hypothesisUuid);
  if (!hypothesis) return;

  logger.log(`Step 2-2 for hypothesis ${hypothesisUuid}`);
  await db.updateHypothesis(hypothesisUuid, { processingStatus: 'step2_2' });

  const hypothesisContext = `
=== 仮説情報 ===
タイトル: ${hypothesis.displayTitle || ''}
UUID: ${hypothesis.uuid}
仮説番号: ${hypothesis.hypothesisNumber}

=== 仮説概要 (Step 2-1より) ===
${hypothesis.step2_1Summary || ''}
`;

  const taskInstructions = `この仮説について詳細な調査を行い、以下の観点から深掘りしたレポートを作成してください：

1. 市場機会の詳細分析
   - ターゲット市場の規模と成長予測
   - 主要プレイヤーと市場構造
   - 規制環境と参入障壁

2. 技術的実現可能性
   - 必要な技術要素と現在の成熟度
   - 開発ロードマップの想定
   - 技術的リスクと対策

3. ビジネスモデル詳細
   - 収益モデルの具体案
   - 必要な初期投資と回収期間
   - パートナーシップ戦略

4. 競合優位性の深掘り
   - 差別化ポイントの具体化
   - 競合の動向と対抗策
   - 持続可能な優位性の構築方法

調査結果は具体的なデータや事例を含めて記述してください。`;

  const step2_2Output = await ai.executeDeepResearch({
    prompt: `hypothesis_contextの仮説について、task_instructionsの指示に従って詳細な調査レポートを作成してください。`,
    files: [
      { name: 'target_specification', content: targetSpecContent },
      { name: 'technical_assets', content: technicalAssetsContent },
      { name: 'hypothesis_context', content: hypothesisContext },
      { name: 'task_instructions', content: taskInstructions },
    ],
    storeName: `asip-${runId}-${hypothesisUuid.slice(0, 8)}`,
    onProgress: (phase, detail) => {
      logger.log(`Step 2-2 [${hypothesis.hypothesisNumber}] ${phase}: ${detail}`);
    },
  });

  await db.updateHypothesis(hypothesisUuid, { step2_2Output });
  logger.log(`Step 2-2 completed for hypothesis ${hypothesisUuid}`);
}

/**
 * Process Steps 3-5 for a single hypothesis (evaluation)
 */
export async function processSteps3to5(
  deps: PipelineDependencies,
  hypothesisUuid: string,
  targetSpecContent: string,
  technicalAssetsContent: string
): Promise<void> {
  const { db, ai, logger = defaultLogger } = deps;

  const hypothesis = await db.getHypothesis(hypothesisUuid);
  if (!hypothesis) return;

  const context = buildHypothesisContext({
    displayTitle: hypothesis.displayTitle,
    uuid: hypothesis.uuid,
    step2_1Summary: hypothesis.step2_1Summary,
    step2_2Output: hypothesis.step2_2Output,
    targetSpecContent,
    technicalAssetsContent,
  });

  // Step 3: Technical Evaluation
  logger.log(`Step 3 for hypothesis ${hypothesisUuid}`);
  await db.updateHypothesis(hypothesisUuid, { processingStatus: 'step3' });

  const step3Prompt = formatPrompt(STEP3_PROMPT, { HYPOTHESIS_COUNT: 1 }) + '\n\n' + context;
  const step3Output = await ai.generateContent({ prompt: step3Prompt });
  await db.updateHypothesis(hypothesisUuid, { step3Output });

  // Step 4: Competitive Analysis
  logger.log(`Step 4 for hypothesis ${hypothesisUuid}`);
  await db.updateHypothesis(hypothesisUuid, { processingStatus: 'step4' });

  const step4Prompt = formatPrompt(STEP4_PROMPT, { HYPOTHESIS_COUNT: 1 }) + '\n\n' + context +
    `\n\n=== Step 3 技術評価結果 ===\n${step3Output}`;
  const step4Output = await ai.generateContent({ prompt: step4Prompt });
  await db.updateHypothesis(hypothesisUuid, { step4Output });

  // Step 5: Integration
  logger.log(`Step 5 for hypothesis ${hypothesisUuid}`);
  await db.updateHypothesis(hypothesisUuid, { processingStatus: 'step5' });

  const step5Prompt = formatPrompt(STEP5_PROMPT, { HYPOTHESIS_COUNT: 1 }) + '\n\n' + context +
    `\n\n=== Step 3 技術評価 ===\n${step3Output}` +
    `\n\n=== Step 4 競合分析 ===\n${step4Output}`;
  const step5Output = await ai.generateContent({ prompt: step5Prompt });

  await db.updateHypothesis(hypothesisUuid, {
    step5Output,
    processingStatus: 'completed',
  });

  logger.log(`Hypothesis ${hypothesisUuid} completed`);
}

/**
 * Run the complete ASIP pipeline
 */
export async function runPipeline(
  deps: PipelineDependencies,
  runId: number
): Promise<void> {
  const { db, ai, logger = defaultLogger } = deps;

  logger.log(`Starting run ${runId}`);

  try {
    // Get run and resources
    const run = await db.getRun(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    const targetSpec = run.targetSpecId
      ? await db.getResource(run.targetSpecId)
      : null;
    const technicalAssets = run.technicalAssetsId
      ? await db.getResource(run.technicalAssetsId)
      : null;

    if (!targetSpec || !technicalAssets) {
      await db.updateRunStatus(runId, {
        status: 'error',
        errorMessage: 'ターゲット仕様または技術資産が見つかりません',
      });
      return;
    }

    // Update status to running
    await db.updateRunStatus(runId, {
      status: 'running',
      currentStep: 2,
      progressInfo: { message: 'Step 2-1: Deep Research で仮説生成を開始しています...', phase: 'step2_1' },
    });

    // ===== Check for existing hypothesis filter =====
    let existingHypotheses: ExistingHypothesis[] = [];
    const existingFilter = run.progressInfo?.existingFilter;

    if (existingFilter?.enabled && db.getExistingHypotheses) {
      logger.log(`Querying existing hypotheses with filter: ${JSON.stringify(existingFilter)}`);
      existingHypotheses = await db.getExistingHypotheses(run.projectId, {
        targetSpecIds: existingFilter.targetSpecIds,
        technicalAssetsIds: existingFilter.technicalAssetsIds,
      });
      logger.log(`Found ${existingHypotheses.length} existing hypotheses to exclude`);
    }

    // ===== STEP 2-1: Generate Hypotheses using Deep Research =====
    logger.log(`Step 2-1: Starting Deep Research for hypothesis generation`);

    const instructions = buildInstructionDocument(run.hypothesisCount, false, existingHypotheses);

    let step2_1Output: string;
    try {
      step2_1Output = await ai.executeDeepResearch({
        prompt: 'task_instructionsの指示に従い、事業仮説を生成してください。',
        files: [
          { name: 'target_specification', content: targetSpec.content },
          { name: 'technical_assets', content: technicalAssets.content },
          { name: 'task_instructions', content: instructions },
        ],
        storeName: `asip-run-${runId}-step2_1`,
        onProgress: async (phase, detail) => {
          logger.log(`Step 2-1 progress: ${phase} - ${detail}`);
          await db.updateRunStatus(runId, {
            progressInfo: { message: `Step 2-1: ${detail}`, phase: 'step2_1', detail: phase },
          });
        },
      });
    } catch (error) {
      logger.error(`Step 2-1 failed:`, error);
      await db.updateRunStatus(runId, {
        status: 'error',
        errorMessage: `Step 2-1 Deep Research 失敗: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      return;
    }

    logger.log(`Step 2-1 completed. Output length: ${step2_1Output.length}`);

    await db.updateRunStatus(runId, {
      currentStep: 2,
      step2_1Output: step2_1Output,
      progressInfo: { message: 'Step 2-1.5: AIで仮説を構造化しています...', phase: 'step2_1_5' },
    });

    // ===== STEP 2-1.5: Structure hypotheses using AI =====
    logger.log(`Step 2-1.5: Structuring hypotheses with AI`);

    let parsedHypotheses = await structureHypothesesWithAI(ai, step2_1Output, run.hypothesisCount);

    logger.log(`Step 2-1.5: Structured ${parsedHypotheses.length} hypotheses`);

    if (parsedHypotheses.length === 0) {
      // Fallback: If AI structuring failed, try legacy parsing
      parsedHypotheses = parseHypothesesFromOutput(step2_1Output);

      if (parsedHypotheses.length === 0) {
        // Last resort: create one from entire output
        parsedHypotheses = [{
          title: run.jobName || '生成された仮説',
          summary: step2_1Output.slice(0, 2000),
        }];
      }
    }

    // Create hypothesis records
    const createdHypotheses: Array<{ uuid: string; title: string }> = [];
    for (let i = 0; i < parsedHypotheses.length; i++) {
      const h = parsedHypotheses[i];
      const uuid = generateUUID();

      await db.createHypothesis({
        uuid,
        projectId: run.projectId,
        runId: runId,
        hypothesisNumber: i + 1,
        indexInRun: i,
        displayTitle: h.title,
        step2_1Summary: h.summary,
        processingStatus: 'pending',
        fullData: { raw: h },
      });

      createdHypotheses.push({ uuid, title: h.title });
      logger.log(`Created hypothesis ${i + 1}: ${h.title}`);
    }

    // ===== STEP 2-2: Deep Research for each hypothesis =====
    logger.log(`Step 2-2: Starting parallel Deep Research for ${createdHypotheses.length} hypotheses`);

    await db.updateRunStatus(runId, {
      progressInfo: {
        message: `Step 2-2: ${createdHypotheses.length}件の仮説をDeep Researchで並列調査中...`,
        phase: 'step2_2',
        totalHypotheses: createdHypotheses.length,
        processingHypotheses: createdHypotheses.map(h => h.title.slice(0, 30)),
      },
    });

    const step2_2Promises = createdHypotheses.map(async (h, i) => {
      try {
        logger.log(`Step 2-2 starting for hypothesis ${i + 1}: ${h.uuid}`);
        await processStep2_2(deps, runId, h.uuid, targetSpec.content, technicalAssets.content);
        logger.log(`Step 2-2 completed for hypothesis ${i + 1}: ${h.uuid}`);
      } catch (error) {
        logger.error(`Step 2-2 error for hypothesis ${h.uuid}:`, error);
        await db.updateHypothesis(h.uuid, {
          processingStatus: 'error',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    await Promise.all(step2_2Promises);

    // ===== STEP 3-5: Evaluate each hypothesis =====
    logger.log(`Steps 3-5: Starting parallel evaluation`);

    await db.updateRunStatus(runId, {
      currentStep: 3,
      progressInfo: {
        message: `Step 3-5: ${createdHypotheses.length}件の仮説を評価中...`,
        phase: 'evaluation',
        totalHypotheses: createdHypotheses.length,
      },
    });

    const evaluationPromises = createdHypotheses.map(async (h, i) => {
      try {
        logger.log(`Starting Steps 3-5 for hypothesis ${i + 1}: ${h.uuid}`);
        await processSteps3to5(deps, h.uuid, targetSpec.content, technicalAssets.content);
        logger.log(`Completed Steps 3-5 for hypothesis ${i + 1}: ${h.uuid}`);
      } catch (error) {
        logger.error(`Steps 3-5 error for hypothesis ${h.uuid}:`, error);
        await db.updateHypothesis(h.uuid, {
          processingStatus: 'error',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    await Promise.all(evaluationPromises);

    // ===== Complete =====
    await db.updateRunStatus(runId, {
      status: 'completed',
      currentStep: 5,
      completedAt: new Date(),
      progressInfo: { message: '完了しました', phase: 'completed' },
    });

    logger.log(`Run ${runId} completed successfully`);

  } catch (error) {
    logger.error(`Fatal error for run ${runId}:`, error);
    await db.updateRunStatus(runId, {
      status: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
