/**
 * Step Executor - Executes pipeline steps one at a time
 *
 * This module enables serverless-friendly pipeline execution by:
 * 1. Executing one step at a time
 * 2. Allowing self-chaining via after() for continuous execution
 * 3. Supporting cron-based recovery for stuck runs
 */

import {
  DatabaseOperations,
  AIOperations,
  RunData,
  HypothesisData,
  HypothesisProcessingStatus,
  DeepResearchHandle,
} from './pipeline-core';
import {
  generateUUID,
  parseHypothesesFromOutput,
  extractJsonFromResponse,
  isHypothesesResponse,
  validateAndCleanHypotheses,
  buildHypothesisContext,
} from './utils';
import { formatPrompt, STEP3_PROMPT, STEP4_PROMPT, STEP5_PROMPT, buildInstructionDocument, ExistingHypothesis } from './prompts';

/**
 * Pipeline execution phases
 *
 * Async phases (for serverless):
 * - step2_1_start: Start Deep Research, save handle
 * - step2_1_polling: Check if Deep Research complete
 * - step2_2_start: Start hypothesis Deep Research
 * - step2_2_polling: Check if hypothesis research complete
 */
export type PipelinePhase =
  | 'pending'
  | 'step2_1_start'      // Start Deep Research (async)
  | 'step2_1_polling'    // Poll for completion
  | 'step2_1'            // Legacy blocking (for tests)
  | 'step2_1_5'
  | 'step2_2_start'      // Start hypothesis research (async)
  | 'step2_2_polling'    // Poll for completion
  | 'step2_2'            // Legacy blocking (for tests)
  | 'evaluation'
  | 'completed'
  | 'error';

/**
 * Extended DatabaseOperations with getHypothesesForRun
 */
export interface ExtendedDatabaseOperations extends DatabaseOperations {
  getHypothesesForRun(runId: number): Promise<HypothesisData[]>;
}

/**
 * Step executor dependencies
 */
export interface StepExecutorDependencies {
  db: ExtendedDatabaseOperations;
  ai: AIOperations;
  logger?: {
    log: (message: string) => void;
    error: (message: string, error?: unknown) => void;
    warn: (message: string) => void;
  };
}

/**
 * Extended run data with status fields
 */
interface ExtendedRunData extends RunData {
  status: string;
  currentStep?: number;
  step2_1Output?: string | null;
  updatedAt?: Date;
}

/**
 * Extended progress info with Deep Research handle
 */
interface ExtendedProgressInfo {
  message?: string;
  phase?: string;
  detail?: string;
  deepResearchHandle?: DeepResearchHandle;
  // Legacy single handle (deprecated, kept for backwards compatibility)
  hypothesisDeepResearchHandle?: {
    hypothesisUuid: string;
    handle: DeepResearchHandle;
  };
  existingFilter?: {
    enabled: boolean;
    targetSpecIds?: number[];
    technicalAssetsIds?: number[];
  };
  // Parallel processing stats
  inFlightCount?: number;
  completedCount?: number;
  [key: string]: unknown;
}

/**
 * Extended hypothesis full data with Deep Research handle
 */
interface ExtendedHypothesisFullData {
  raw?: unknown;
  deepResearchHandle?: DeepResearchHandle;
  [key: string]: unknown;
}

// Maximum concurrent Deep Research requests for hypotheses
const MAX_CONCURRENT_HYPOTHESIS_RESEARCH = 5;

/**
 * Step execution result
 */
export interface StepExecutionResult {
  phase: PipelinePhase;
  hasMore: boolean;
  error?: string;
}

const defaultLogger = {
  log: (message: string) => console.log(`[StepExecutor] ${message}`),
  error: (message: string, error?: unknown) => console.error(`[StepExecutor] ${message}`, error),
  warn: (message: string) => console.warn(`[StepExecutor] ${message}`),
};

/**
 * Helper to get hypothesis Deep Research handle from fullData
 */
function getHypothesisHandle(h: HypothesisData): DeepResearchHandle | undefined {
  return (h.fullData as ExtendedHypothesisFullData)?.deepResearchHandle;
}

/**
 * Categorize hypotheses by their processing state
 */
function categorizeHypotheses(hypotheses: HypothesisData[]) {
  const pending: HypothesisData[] = [];
  const polling: HypothesisData[] = [];
  const readyForEval: HypothesisData[] = [];
  const inEvaluation: HypothesisData[] = [];
  const completed: HypothesisData[] = [];
  const stuck: HypothesisData[] = [];

  for (const h of hypotheses) {
    const handle = getHypothesisHandle(h);

    if (h.processingStatus === 'pending') {
      pending.push(h);
    } else if (h.processingStatus === 'step2_2') {
      if (handle && !h.step2_2Output) {
        // Has handle, waiting for completion
        polling.push(h);
      } else if (h.step2_2Output) {
        // Has output, ready for evaluation
        readyForEval.push(h);
      } else {
        // No handle and no output - stuck
        stuck.push(h);
      }
    } else if (h.processingStatus && ['step3', 'step4', 'step5'].includes(h.processingStatus)) {
      inEvaluation.push(h);
    } else if (h.processingStatus === 'completed' || h.processingStatus === 'error') {
      completed.push(h);
    }
  }

  return { pending, polling, readyForEval, inEvaluation, completed, stuck };
}

/**
 * Determine the next phase to execute based on current state
 *
 * For parallel processing:
 * - Poll all hypotheses with handles (quick status checks)
 * - Start new Deep Researches up to MAX_CONCURRENT limit
 * - Evaluate any hypothesis that completed step2_2
 *
 * @param progressInfo - Contains Deep Research handles for async operations
 */
export function getNextPhase(
  status: string,
  currentStep: number,
  hypotheses: HypothesisData[],
  progressInfo?: ExtendedProgressInfo | null
): PipelinePhase | null {
  // Terminal states
  if (status === 'completed') return null;
  if (status === 'error') return null;
  if (status === 'cancelled') return null;

  // Step 2-1: Check for pending async Deep Research (run-level)
  if (progressInfo?.deepResearchHandle) {
    return 'step2_1_polling';
  }

  // Legacy: Check for single hypothesis handle (backwards compatibility)
  if (progressInfo?.hypothesisDeepResearchHandle) {
    return 'step2_2_polling';
  }

  // Pending -> Start step 2-1 (async)
  if (status === 'pending') {
    return 'step2_1_start';
  }

  // Running states
  if (status === 'running') {
    // Step 2-1 complete, need to structure hypotheses
    if (currentStep === 1 && hypotheses.length === 0) {
      return 'step2_1_5';
    }

    // Categorize hypotheses for parallel processing
    const { pending, polling, readyForEval, inEvaluation, completed, stuck } = categorizeHypotheses(hypotheses);

    // Priority 1: Poll any hypotheses that have handles (quick API calls)
    if (polling.length > 0) {
      return 'step2_2_polling';
    }

    // Priority 2: Start new Deep Researches if under capacity
    // Include stuck hypotheses (they need to restart)
    const canStart = pending.length + stuck.length;
    const inFlight = polling.length;
    if (canStart > 0 && inFlight < MAX_CONCURRENT_HYPOTHESIS_RESEARCH) {
      return 'step2_2_start';
    }

    // Priority 3: Evaluate any hypothesis ready for evaluation
    if (readyForEval.length > 0) {
      return 'evaluation';
    }

    // Check if all hypotheses are done
    if (hypotheses.length > 0 && completed.length === hypotheses.length) {
      return 'completed';
    }

    // If something is still in evaluation, keep going
    if (inEvaluation.length > 0) {
      return 'evaluation';
    }
  }

  return null;
}

/**
 * Execute step 2-1 START: Begin Deep Research asynchronously
 * This returns quickly, saving the handle for later polling
 */
async function executeStep2_1Start(
  deps: StepExecutorDependencies,
  run: ExtendedRunData,
  targetSpecContent: string,
  technicalAssetsContent: string
): Promise<void> {
  const { db, ai, logger = defaultLogger } = deps;

  logger.log(`Step 2-1 START: Beginning async Deep Research for run ${run.id}`);

  // Check if AI adapter supports async operations
  if (!ai.startDeepResearchAsync) {
    throw new Error('AI adapter does not support async Deep Research');
  }

  // Update status to running
  await db.updateRunStatus(run.id, {
    status: 'running',
    currentStep: 1,
    progressInfo: { message: 'Step 2-1: Deep Research を開始しています...', phase: 'step2_1_start' },
    updatedAt: new Date(),
  });

  // Check for existing hypothesis filter
  let existingHypotheses: ExistingHypothesis[] = [];
  const existingFilter = (run.progressInfo as ExtendedProgressInfo)?.existingFilter;

  if (existingFilter?.enabled && db.getExistingHypotheses) {
    logger.log(`Querying existing hypotheses with filter`);
    existingHypotheses = await db.getExistingHypotheses(run.projectId, {
      targetSpecIds: existingFilter.targetSpecIds,
      technicalAssetsIds: existingFilter.technicalAssetsIds,
    });
    logger.log(`Found ${existingHypotheses.length} existing hypotheses to exclude`);
  }

  const instructions = buildInstructionDocument(run.hypothesisCount, false, existingHypotheses);

  // Start Deep Research asynchronously (returns immediately)
  const handle = await ai.startDeepResearchAsync({
    prompt: 'task_instructionsの指示に従い、事業仮説を生成してください。',
    files: [
      { name: 'target_specification', content: targetSpecContent },
      { name: 'technical_assets', content: technicalAssetsContent },
      { name: 'task_instructions', content: instructions },
    ],
    storeName: `asip-run-${run.id}-step2_1`,
  });

  logger.log(`Step 2-1 START complete. Interaction ID: ${handle.interactionId}`);

  // Save the handle in progressInfo for polling
  await db.updateRunStatus(run.id, {
    progressInfo: {
      message: 'Step 2-1: Deep Research 実行中...',
      phase: 'step2_1_polling',
      deepResearchHandle: handle,
      existingFilter: existingFilter,
    },
    updatedAt: new Date(),
  });
}

/**
 * Execute step 2-1 POLLING: Check if Deep Research is complete
 */
async function executeStep2_1Polling(
  deps: StepExecutorDependencies,
  run: ExtendedRunData
): Promise<{ completed: boolean }> {
  const { db, ai, logger = defaultLogger } = deps;

  const progressInfo = run.progressInfo as ExtendedProgressInfo;
  const handle = progressInfo?.deepResearchHandle;

  if (!handle) {
    throw new Error('No Deep Research handle found in progressInfo');
  }

  if (!ai.checkDeepResearchStatus) {
    throw new Error('AI adapter does not support async Deep Research');
  }

  logger.log(`Step 2-1 POLLING: Checking status for ${handle.interactionId}`);

  const status = await ai.checkDeepResearchStatus(handle);

  logger.log(`Step 2-1 POLLING: Status = ${status.status}`);

  if (status.status === 'completed') {
    logger.log(`Step 2-1 POLLING: Deep Research completed! Output length: ${status.result?.length || 0}`);

    // Cleanup resources
    if (ai.cleanupDeepResearch) {
      await ai.cleanupDeepResearch(handle);
    }

    // Save result and clear handle
    await db.updateRunStatus(run.id, {
      currentStep: 1,
      step2_1Output: status.result || '',
      progressInfo: {
        message: 'Step 2-1 完了',
        phase: 'step2_1',
        existingFilter: progressInfo.existingFilter,
      },
      updatedAt: new Date(),
    });

    return { completed: true };
  }

  if (status.status === 'failed') {
    // Cleanup resources
    if (ai.cleanupDeepResearch) {
      await ai.cleanupDeepResearch(handle);
    }

    throw new Error(`Deep Research failed: ${status.error}`);
  }

  // Still running - update progress and return
  await db.updateRunStatus(run.id, {
    progressInfo: {
      ...progressInfo,
      message: `Step 2-1: Deep Research ${status.status}...`,
    },
    updatedAt: new Date(),
  });

  return { completed: false };
}

/**
 * Execute step 2-1: Generate hypotheses using Deep Research (BLOCKING - for tests)
 */
async function executeStep2_1(
  deps: StepExecutorDependencies,
  run: ExtendedRunData,
  targetSpecContent: string,
  technicalAssetsContent: string
): Promise<void> {
  const { db, ai, logger = defaultLogger } = deps;

  logger.log(`Step 2-1: Starting Deep Research for run ${run.id}`);

  // Update status to running
  await db.updateRunStatus(run.id, {
    status: 'running',
    currentStep: 1,
    progressInfo: { message: 'Step 2-1: Deep Research で仮説生成中...', phase: 'step2_1' },
    updatedAt: new Date(),
  });

  // Check for existing hypothesis filter
  let existingHypotheses: ExistingHypothesis[] = [];
  const existingFilter = (run.progressInfo as ExtendedProgressInfo)?.existingFilter;

  if (existingFilter?.enabled && db.getExistingHypotheses) {
    logger.log(`Querying existing hypotheses with filter`);
    existingHypotheses = await db.getExistingHypotheses(run.projectId, {
      targetSpecIds: existingFilter.targetSpecIds,
      technicalAssetsIds: existingFilter.technicalAssetsIds,
    });
    logger.log(`Found ${existingHypotheses.length} existing hypotheses to exclude`);
  }

  const instructions = buildInstructionDocument(run.hypothesisCount, false, existingHypotheses);

  const step2_1Output = await ai.executeDeepResearch({
    prompt: 'task_instructionsの指示に従い、事業仮説を生成してください。',
    files: [
      { name: 'target_specification', content: targetSpecContent },
      { name: 'technical_assets', content: technicalAssetsContent },
      { name: 'task_instructions', content: instructions },
    ],
    storeName: `asip-run-${run.id}-step2_1`,
    onProgress: async (phase, detail) => {
      logger.log(`Step 2-1 progress: ${phase} - ${detail}`);
      await db.updateRunStatus(run.id, {
        progressInfo: { message: `Step 2-1: ${detail}`, phase: 'step2_1', detail: phase },
        updatedAt: new Date(),
      });
    },
  });

  logger.log(`Step 2-1 completed. Output length: ${step2_1Output.length}`);

  await db.updateRunStatus(run.id, {
    currentStep: 1,
    step2_1Output: step2_1Output,
    progressInfo: { message: 'Step 2-1 完了', phase: 'step2_1' },
    updatedAt: new Date(),
  });
}

/**
 * Execute step 2-1.5: Structure hypotheses using AI
 */
async function executeStep2_1_5(
  deps: StepExecutorDependencies,
  run: ExtendedRunData
): Promise<void> {
  const { db, ai, logger = defaultLogger } = deps;

  logger.log(`Step 2-1.5: Structuring hypotheses for run ${run.id}`);

  await db.updateRunStatus(run.id, {
    progressInfo: { message: 'Step 2-1.5: AIで仮説を構造化しています...', phase: 'step2_1_5' },
    updatedAt: new Date(),
  });

  const step2_1Output = run.step2_1Output || '';

  // Structure hypotheses using AI
  const structuringPrompt = `以下のDeep Researchレポートから、最も有望な事業仮説を${run.hypothesisCount}件抽出し、JSON形式で出力してください。

=== Deep Research レポート ===
${step2_1Output.slice(0, 50000)}

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
1. 必ず${run.hypothesisCount}件の仮説を抽出すること
2. タイトルは具体的で分かりやすいものにすること
3. 概要には市場機会、技術の活用方法を含めること
4. 重複や類似した仮説は統合すること`;

  let parsedHypotheses: Array<{ title: string; summary: string }> = [];

  try {
    const response = await ai.generateContent({ prompt: structuringPrompt });
    const parsed = extractJsonFromResponse(response, isHypothesesResponse);

    if (parsed) {
      parsedHypotheses = validateAndCleanHypotheses(parsed.hypotheses);
    }
  } catch (error) {
    logger.warn(`AI structuring failed: ${error}`);
  }

  // Fallback to legacy parsing
  if (parsedHypotheses.length === 0) {
    parsedHypotheses = parseHypothesesFromOutput(step2_1Output);
  }

  // Last resort: create one from entire output
  if (parsedHypotheses.length === 0) {
    parsedHypotheses = [{
      title: run.jobName || '生成された仮説',
      summary: step2_1Output.slice(0, 2000),
    }];
  }

  logger.log(`Structured ${parsedHypotheses.length} hypotheses`);

  // Create hypothesis records
  for (let i = 0; i < parsedHypotheses.length; i++) {
    const h = parsedHypotheses[i];
    const uuid = generateUUID();

    await db.createHypothesis({
      uuid,
      projectId: run.projectId,
      runId: run.id,
      hypothesisNumber: i + 1,
      indexInRun: i,
      displayTitle: h.title,
      step2_1Summary: h.summary,
      processingStatus: 'pending',
      fullData: { raw: h },
    });

    logger.log(`Created hypothesis ${i + 1}: ${h.title}`);
  }

  await db.updateRunStatus(run.id, {
    currentStep: 2,
    progressInfo: {
      message: `Step 2-1.5 完了: ${parsedHypotheses.length}件の仮説を作成`,
      phase: 'step2_1_5',
      totalHypotheses: parsedHypotheses.length,
    },
    updatedAt: new Date(),
  });
}

/**
 * Execute step 2-2 START: Begin hypothesis Deep Research asynchronously
 * Now supports starting MULTIPLE hypotheses in parallel
 */
async function executeStep2_2Start(
  deps: StepExecutorDependencies,
  run: ExtendedRunData,
  hypotheses: HypothesisData[],
  targetSpecContent: string,
  technicalAssetsContent: string
): Promise<{ started: number }> {
  const { db, ai, logger = defaultLogger } = deps;

  if (!ai.startDeepResearchAsync) {
    throw new Error('AI adapter does not support async Deep Research');
  }

  // Categorize to find hypotheses to start
  const { pending, polling, stuck } = categorizeHypotheses(hypotheses);
  const inFlightCount = polling.length;
  const availableSlots = MAX_CONCURRENT_HYPOTHESIS_RESEARCH - inFlightCount;

  if (availableSlots <= 0) {
    logger.log(`Step 2-2 START: No slots available (${inFlightCount} in flight)`);
    return { started: 0 };
  }

  // Combine pending and stuck hypotheses, prioritize pending
  const toStart = [...pending, ...stuck].slice(0, availableSlots);

  logger.log(`Step 2-2 START: Starting ${toStart.length} hypotheses (${inFlightCount} already in flight)`);

  let startedCount = 0;

  for (const hypothesis of toStart) {
    try {
      logger.log(`Step 2-2 START for hypothesis ${hypothesis.uuid} (${hypothesis.displayTitle})`);

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
2. 技術的実現可能性
3. ビジネスモデル詳細
4. 競合優位性の深掘り

調査結果は具体的なデータや事例を含めて記述してください。`;

      const handle = await ai.startDeepResearchAsync({
        prompt: `hypothesis_contextの仮説について、task_instructionsの指示に従って詳細な調査レポートを作成してください。`,
        files: [
          { name: 'target_specification', content: targetSpecContent },
          { name: 'technical_assets', content: technicalAssetsContent },
          { name: 'hypothesis_context', content: hypothesisContext },
          { name: 'task_instructions', content: taskInstructions },
        ],
        storeName: `asip-${run.id}-${hypothesis.uuid.slice(0, 8)}`,
      });

      logger.log(`Step 2-2 START complete for ${hypothesis.uuid}. Interaction ID: ${handle.interactionId}`);

      // Store handle in hypothesis fullData (not progressInfo)
      const existingFullData = (hypothesis.fullData || {}) as ExtendedHypothesisFullData;
      await db.updateHypothesis(hypothesis.uuid, {
        processingStatus: 'step2_2',
        fullData: {
          ...existingFullData,
          deepResearchHandle: handle,
        },
      });

      startedCount++;
    } catch (error) {
      logger.error(`Failed to start Deep Research for hypothesis ${hypothesis.uuid}:`, error);
      // Mark this hypothesis as error but continue with others
      await db.updateHypothesis(hypothesis.uuid, {
        processingStatus: 'error',
        errorMessage: error instanceof Error ? error.message : 'Failed to start Deep Research',
      });
    }
  }

  // Update run progress info
  const existingProgressInfo = run.progressInfo as ExtendedProgressInfo;
  await db.updateRunStatus(run.id, {
    progressInfo: {
      ...existingProgressInfo,
      message: `Step 2-2: ${inFlightCount + startedCount}件の仮説を並列調査中...`,
      phase: 'step2_2_polling',
      inFlightCount: inFlightCount + startedCount,
    },
    updatedAt: new Date(),
  });

  return { started: startedCount };
}

/**
 * Execute step 2-2 POLLING: Check ALL hypotheses with Deep Research handles
 * Now polls multiple hypotheses in parallel
 */
async function executeStep2_2Polling(
  deps: StepExecutorDependencies,
  run: ExtendedRunData,
  hypotheses: HypothesisData[]
): Promise<{ completed: number; stillRunning: number }> {
  const { db, ai, logger = defaultLogger } = deps;

  if (!ai.checkDeepResearchStatus) {
    throw new Error('AI adapter does not support async Deep Research');
  }

  // Find all hypotheses with handles that need polling
  const { polling } = categorizeHypotheses(hypotheses);

  logger.log(`Step 2-2 POLLING: Checking ${polling.length} hypotheses`);

  let completedCount = 0;
  let stillRunningCount = 0;

  // Poll each hypothesis
  for (const hypothesis of polling) {
    const handle = getHypothesisHandle(hypothesis);
    if (!handle) continue;

    try {
      logger.log(`Step 2-2 POLLING: Checking ${hypothesis.uuid} (${hypothesis.displayTitle})`);

      const status = await ai.checkDeepResearchStatus(handle);

      logger.log(`Step 2-2 POLLING: ${hypothesis.uuid} status = ${status.status}`);

      if (status.status === 'completed') {
        logger.log(`Step 2-2 POLLING: ${hypothesis.uuid} completed! Output length: ${status.result?.length || 0}`);

        // Cleanup resources
        if (ai.cleanupDeepResearch) {
          await ai.cleanupDeepResearch(handle);
        }

        // Save result and clear handle
        const existingFullData = (hypothesis.fullData || {}) as ExtendedHypothesisFullData;
        await db.updateHypothesis(hypothesis.uuid, {
          step2_2Output: status.result || '',
          fullData: {
            ...existingFullData,
            deepResearchHandle: undefined,
          },
        });

        completedCount++;
      } else if (status.status === 'failed') {
        logger.error(`Step 2-2 POLLING: ${hypothesis.uuid} failed: ${status.error}`);

        // Cleanup resources
        if (ai.cleanupDeepResearch) {
          await ai.cleanupDeepResearch(handle);
        }

        // Mark as error and clear handle
        const existingFullData = (hypothesis.fullData || {}) as ExtendedHypothesisFullData;
        await db.updateHypothesis(hypothesis.uuid, {
          processingStatus: 'error',
          errorMessage: status.error || 'Deep Research failed',
          fullData: {
            ...existingFullData,
            deepResearchHandle: undefined,
          },
        });

        completedCount++; // Count as "done" for progress
      } else {
        // Still running
        stillRunningCount++;
      }
    } catch (error) {
      logger.error(`Step 2-2 POLLING: Error polling ${hypothesis.uuid}:`, error);
      // Don't fail the whole batch, just log and continue
      stillRunningCount++;
    }
  }

  // Update run progress info
  const existingProgressInfo = run.progressInfo as ExtendedProgressInfo;
  const { pending, readyForEval, completed: doneHypotheses } = categorizeHypotheses(hypotheses);

  await db.updateRunStatus(run.id, {
    progressInfo: {
      ...existingProgressInfo,
      message: `Step 2-2: ${stillRunningCount}件調査中, ${readyForEval.length + completedCount}件完了`,
      phase: stillRunningCount > 0 ? 'step2_2_polling' : 'step2_2',
      inFlightCount: stillRunningCount,
      completedCount: doneHypotheses.length + readyForEval.length + completedCount,
    },
    updatedAt: new Date(),
  });

  return { completed: completedCount, stillRunning: stillRunningCount };
}

/**
 * Legacy: Execute step 2-2 POLLING for single hypothesis (backwards compatibility)
 */
async function executeStep2_2PollingSingle(
  deps: StepExecutorDependencies,
  run: ExtendedRunData
): Promise<{ completed: boolean }> {
  const { db, ai, logger = defaultLogger } = deps;

  const progressInfo = run.progressInfo as ExtendedProgressInfo;
  const handleInfo = progressInfo?.hypothesisDeepResearchHandle;

  if (!handleInfo) {
    throw new Error('No hypothesis Deep Research handle found in progressInfo');
  }

  if (!ai.checkDeepResearchStatus) {
    throw new Error('AI adapter does not support async Deep Research');
  }

  const { hypothesisUuid, handle } = handleInfo;

  logger.log(`Step 2-2 POLLING (legacy): Checking status for hypothesis ${hypothesisUuid}`);

  const status = await ai.checkDeepResearchStatus(handle);

  logger.log(`Step 2-2 POLLING (legacy): Status = ${status.status}`);

  if (status.status === 'completed') {
    logger.log(`Step 2-2 POLLING (legacy): Completed! Output length: ${status.result?.length || 0}`);

    // Cleanup resources
    if (ai.cleanupDeepResearch) {
      await ai.cleanupDeepResearch(handle);
    }

    // Save result
    await db.updateHypothesis(hypothesisUuid, { step2_2Output: status.result || '' });

    // Clear handle from progressInfo
    await db.updateRunStatus(run.id, {
      progressInfo: {
        ...progressInfo,
        message: `Step 2-2: 仮説の調査完了`,
        phase: 'step2_2',
        hypothesisDeepResearchHandle: undefined,
      },
      updatedAt: new Date(),
    });

    return { completed: true };
  }

  if (status.status === 'failed') {
    // Cleanup resources
    if (ai.cleanupDeepResearch) {
      await ai.cleanupDeepResearch(handle);
    }

    // Mark hypothesis as error
    await db.updateHypothesis(hypothesisUuid, {
      processingStatus: 'error',
      errorMessage: status.error || 'Deep Research failed',
    });

    // Clear handle
    await db.updateRunStatus(run.id, {
      progressInfo: {
        ...progressInfo,
        hypothesisDeepResearchHandle: undefined,
      },
      updatedAt: new Date(),
    });

    return { completed: true }; // Move on to next hypothesis
  }

  // Still running
  await db.updateRunStatus(run.id, {
    progressInfo: {
      ...progressInfo,
      message: `Step 2-2: 仮説調査 ${status.status}...`,
    },
    updatedAt: new Date(),
  });

  return { completed: false };
}

/**
 * Execute step 2-2: Deep Research for a single hypothesis (BLOCKING - for tests)
 */
async function executeStep2_2ForOne(
  deps: StepExecutorDependencies,
  run: ExtendedRunData,
  hypothesis: HypothesisData,
  targetSpecContent: string,
  technicalAssetsContent: string
): Promise<void> {
  const { db, ai, logger = defaultLogger } = deps;

  logger.log(`Step 2-2 for hypothesis ${hypothesis.uuid}`);

  await db.updateHypothesis(hypothesis.uuid, { processingStatus: 'step2_2' });

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
2. 技術的実現可能性
3. ビジネスモデル詳細
4. 競合優位性の深掘り

調査結果は具体的なデータや事例を含めて記述してください。`;

  const step2_2Output = await ai.executeDeepResearch({
    prompt: `hypothesis_contextの仮説について、task_instructionsの指示に従って詳細な調査レポートを作成してください。`,
    files: [
      { name: 'target_specification', content: targetSpecContent },
      { name: 'technical_assets', content: technicalAssetsContent },
      { name: 'hypothesis_context', content: hypothesisContext },
      { name: 'task_instructions', content: taskInstructions },
    ],
    storeName: `asip-${run.id}-${hypothesis.uuid.slice(0, 8)}`,
    onProgress: (phase, detail) => {
      logger.log(`Step 2-2 [${hypothesis.hypothesisNumber}] ${phase}: ${detail}`);
    },
  });

  await db.updateHypothesis(hypothesis.uuid, { step2_2Output });

  await db.updateRunStatus(run.id, {
    progressInfo: {
      message: `Step 2-2: 仮説 ${hypothesis.hypothesisNumber} の調査完了`,
      phase: 'step2_2',
    },
    updatedAt: new Date(),
  });

  logger.log(`Step 2-2 completed for hypothesis ${hypothesis.uuid}`);
}

/**
 * Execute steps 3-5: Evaluation for a single hypothesis
 */
async function executeEvaluationForOne(
  deps: StepExecutorDependencies,
  run: ExtendedRunData,
  hypothesis: HypothesisData,
  targetSpecContent: string,
  technicalAssetsContent: string
): Promise<void> {
  const { db, ai, logger = defaultLogger } = deps;

  logger.log(`Steps 3-5 for hypothesis ${hypothesis.uuid}`);

  const context = buildHypothesisContext({
    displayTitle: hypothesis.displayTitle,
    uuid: hypothesis.uuid,
    step2_1Summary: hypothesis.step2_1Summary,
    step2_2Output: hypothesis.step2_2Output,
    targetSpecContent,
    technicalAssetsContent,
  });

  // Step 3: Technical Evaluation
  logger.log(`Step 3 for hypothesis ${hypothesis.uuid}`);
  await db.updateHypothesis(hypothesis.uuid, { processingStatus: 'step3' });

  const step3Prompt = formatPrompt(STEP3_PROMPT, { HYPOTHESIS_COUNT: 1 }) + '\n\n' + context;
  const step3Output = await ai.generateContent({ prompt: step3Prompt });
  await db.updateHypothesis(hypothesis.uuid, { step3Output });

  // Step 4: Competitive Analysis
  logger.log(`Step 4 for hypothesis ${hypothesis.uuid}`);
  await db.updateHypothesis(hypothesis.uuid, { processingStatus: 'step4' });

  const step4Prompt = formatPrompt(STEP4_PROMPT, { HYPOTHESIS_COUNT: 1 }) + '\n\n' + context +
    `\n\n=== Step 3 技術評価結果 ===\n${step3Output}`;
  const step4Output = await ai.generateContent({ prompt: step4Prompt });
  await db.updateHypothesis(hypothesis.uuid, { step4Output });

  // Step 5: Integration
  logger.log(`Step 5 for hypothesis ${hypothesis.uuid}`);
  await db.updateHypothesis(hypothesis.uuid, { processingStatus: 'step5' });

  const step5Prompt = formatPrompt(STEP5_PROMPT, { HYPOTHESIS_COUNT: 1 }) + '\n\n' + context +
    `\n\n=== Step 3 技術評価 ===\n${step3Output}` +
    `\n\n=== Step 4 競合分析 ===\n${step4Output}`;
  const step5Output = await ai.generateContent({ prompt: step5Prompt });

  await db.updateHypothesis(hypothesis.uuid, {
    step5Output,
    processingStatus: 'completed',
  });

  await db.updateRunStatus(run.id, {
    progressInfo: {
      message: `Step 3-5: 仮説 ${hypothesis.hypothesisNumber} の評価完了`,
      phase: 'evaluation',
    },
    updatedAt: new Date(),
  });

  logger.log(`Evaluation completed for hypothesis ${hypothesis.uuid}`);
}

/**
 * Execute the next step in the pipeline
 *
 * This is the main entry point for step-by-step execution.
 * Returns whether there are more steps to execute.
 */
export async function executeNextStep(
  deps: StepExecutorDependencies,
  runId: number
): Promise<StepExecutionResult> {
  const { db, logger = defaultLogger } = deps;

  try {
    // Get run and validate
    const run = await db.getRun(runId) as ExtendedRunData | null;
    if (!run) {
      return { phase: 'error', hasMore: false, error: `Run ${runId} not found` };
    }

    // Check terminal states
    if (run.status === 'completed') {
      return { phase: 'completed', hasMore: false };
    }
    if (run.status === 'error') {
      return { phase: 'error', hasMore: false };
    }
    if (run.status === 'cancelled') {
      return { phase: 'error', hasMore: false };
    }

    // Get resources
    const targetSpec = run.targetSpecId
      ? await db.getResource(run.targetSpecId)
      : null;
    const technicalAssets = run.technicalAssetsId
      ? await db.getResource(run.technicalAssetsId)
      : null;

    if (!targetSpec || !technicalAssets) {
      await db.updateRunStatus(runId, {
        status: 'error',
        errorMessage: 'リソースが見つかりません',
        updatedAt: new Date(),
      });
      return { phase: 'error', hasMore: false, error: 'リソースが見つかりません' };
    }

    // Get hypotheses
    const hypotheses = await db.getHypothesesForRun(runId);

    // Determine next phase (pass progressInfo for async state detection)
    const progressInfo = run.progressInfo as ExtendedProgressInfo;
    const phase = getNextPhase(run.status, run.currentStep || 0, hypotheses, progressInfo);

    if (!phase) {
      return { phase: 'completed', hasMore: false };
    }

    logger.log(`Executing phase: ${phase} for run ${runId}`);

    // Execute the appropriate phase
    switch (phase) {
      // ===== ASYNC PHASES (for serverless) =====

      case 'step2_1_start':
        // Start Deep Research asynchronously
        await executeStep2_1Start(deps, run, targetSpec.content, technicalAssets.content);
        return { phase, hasMore: true };

      case 'step2_1_polling': {
        // Poll for Deep Research completion
        const result = await executeStep2_1Polling(deps, run);
        // hasMore is true whether complete or not - we continue either way
        return { phase, hasMore: true };
      }

      case 'step2_2_start': {
        // Start hypothesis Deep Research asynchronously (parallel)
        const result = await executeStep2_2Start(deps, run, hypotheses, targetSpec.content, technicalAssets.content);
        logger.log(`Step 2-2 START: Started ${result.started} hypotheses`);
        return { phase, hasMore: true };
      }

      case 'step2_2_polling': {
        // Check if this is legacy single-handle mode
        const progressInfo = run.progressInfo as ExtendedProgressInfo;
        if (progressInfo?.hypothesisDeepResearchHandle) {
          // Legacy mode: use single-hypothesis polling
          const result = await executeStep2_2PollingSingle(deps, run);
          return { phase, hasMore: true };
        }

        // Parallel mode: poll all hypotheses with handles
        const result = await executeStep2_2Polling(deps, run, hypotheses);
        logger.log(`Step 2-2 POLLING: ${result.completed} completed, ${result.stillRunning} still running`);
        return { phase, hasMore: true };
      }

      // ===== LEGACY BLOCKING PHASES (for tests) =====

      case 'step2_1':
        await executeStep2_1(deps, run, targetSpec.content, technicalAssets.content);
        return { phase, hasMore: true };

      case 'step2_1_5':
        await executeStep2_1_5(deps, run);
        return { phase, hasMore: true };

      case 'step2_2': {
        // Find next hypothesis to process (blocking)
        const pendingHypothesis = hypotheses.find(h => h.processingStatus === 'pending');
        if (pendingHypothesis) {
          await executeStep2_2ForOne(deps, run, pendingHypothesis, targetSpec.content, technicalAssets.content);
          return { phase, hasMore: true };
        }
        return { phase, hasMore: true };
      }

      // ===== COMMON PHASES =====

      case 'evaluation': {
        // Find next hypothesis ready for evaluation
        const readyHypothesis = hypotheses.find(
          h => h.processingStatus === 'step2_2' && h.step2_2Output
        );
        if (readyHypothesis) {
          await executeEvaluationForOne(deps, run, readyHypothesis, targetSpec.content, technicalAssets.content);
          // Check if there are more
          const remainingToEvaluate = hypotheses.filter(
            h => (h.processingStatus === 'step2_2' && h.step2_2Output) ||
                 h.processingStatus === 'step3' ||
                 h.processingStatus === 'step4' ||
                 h.processingStatus === 'step5'
          ).length - 1;
          return { phase, hasMore: remainingToEvaluate > 0 };
        }
        return { phase, hasMore: false };
      }

      case 'completed': {
        await db.updateRunStatus(runId, {
          status: 'completed',
          currentStep: 5,
          completedAt: new Date(),
          progressInfo: { message: '完了しました', phase: 'completed' },
          updatedAt: new Date(),
        });
        logger.log(`Run ${runId} completed successfully`);
        return { phase, hasMore: false };
      }

      default:
        return { phase: 'error', hasMore: false, error: `Unknown phase: ${phase}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error executing step for run ${runId}:`, error);

    try {
      await db.updateRunStatus(runId, {
        status: 'error',
        errorMessage: errorMessage,
        updatedAt: new Date(),
      });
    } catch (dbError) {
      logger.error(`Failed to update run status:`, dbError);
    }

    return { phase: 'error', hasMore: false, error: errorMessage };
  }
}
