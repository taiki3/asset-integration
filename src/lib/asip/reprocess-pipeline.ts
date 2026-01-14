/**
 * ASIP Reprocess Pipeline
 *
 * Simplified pipeline for reprocessing uploaded content.
 * Instead of using Deep Research for hypothesis generation,
 * it processes the uploaded content directly.
 */

import '@/lib/gemini/proxy-setup';
import { db } from '@/lib/db';
import { runs, resources, hypotheses } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createAIAdapter } from './ai-adapter';
import {
  generateUUID,
  extractJsonFromResponse,
  isHypothesesResponse,
  validateAndCleanHypotheses,
  buildHypothesisContext,
} from './utils';
import { formatPrompt, STEP3_PROMPT, STEP4_PROMPT, STEP5_PROMPT } from './prompts';

interface Logger {
  log: (message: string) => void;
  error: (message: string, error?: unknown) => void;
  warn: (message: string) => void;
}

const defaultLogger: Logger = {
  log: (message: string) => console.log(`[Reprocess] ${message}`),
  error: (message: string, error?: unknown) => console.error(`[Reprocess] ${message}`, error),
  warn: (message: string) => console.warn(`[Reprocess] ${message}`),
};

/**
 * Start the reprocess pipeline
 */
export async function startReprocessPipeline(
  runId: number,
  uploadedContent: string,
  customPrompt?: string | null
): Promise<void> {
  const logger = defaultLogger;
  const ai = createAIAdapter();

  logger.log(`Starting reprocess run ${runId}`);

  try {
    // Get run data
    const [run] = await db.select().from(runs).where(eq(runs.id, runId));
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    // Get technical assets if specified
    let technicalAssetsContent = '';
    if (run.technicalAssetsId) {
      const [techAssets] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, run.technicalAssetsId));
      if (techAssets) {
        technicalAssetsContent = techAssets.content;
      }
    }

    // Update status to running
    await db
      .update(runs)
      .set({
        status: 'running',
        currentStep: 2,
        progressInfo: {
          message: '再処理: アップロードされたコンテンツを分析中...',
          phase: 'reprocess_analysis',
        },
      })
      .where(eq(runs.id, runId));

    // ===== Extract hypotheses from uploaded content =====
    logger.log('Extracting hypotheses from uploaded content');

    const extractionPrompt = `以下のドキュメントから事業仮説を${run.hypothesisCount}件抽出し、JSON形式で出力してください。

=== アップロードされたドキュメント ===
${uploadedContent.slice(0, 50000)}

${technicalAssetsContent ? `
=== 技術資産情報 ===
${technicalAssetsContent.slice(0, 10000)}
` : ''}

${customPrompt ? `
=== 追加の指示 ===
${customPrompt}
` : ''}

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
1. ドキュメントの内容に基づいて${run.hypothesisCount}件の仮説を抽出すること
2. タイトルは具体的で分かりやすいものにすること
3. 概要には市場機会、技術の活用方法、期待される効果を含めること
4. 重複や類似した仮説は統合すること`;

    const extractionResponse = await ai.generateContent({ prompt: extractionPrompt });
    const parsed = extractJsonFromResponse(extractionResponse, isHypothesesResponse);

    let parsedHypotheses = parsed ? validateAndCleanHypotheses(parsed.hypotheses) : [];

    if (parsedHypotheses.length === 0) {
      // Fallback: create a single hypothesis from the content
      parsedHypotheses = [{
        title: run.jobName || '再処理された仮説',
        summary: uploadedContent.slice(0, 2000),
      }];
    }

    logger.log(`Extracted ${parsedHypotheses.length} hypotheses`);

    // Store raw output
    await db
      .update(runs)
      .set({
        step2_1Output: `[再処理モード]\n\n${extractionResponse}`,
        progressInfo: {
          message: `再処理: ${parsedHypotheses.length}件の仮説を抽出しました`,
          phase: 'hypothesis_extraction',
          totalHypotheses: parsedHypotheses.length,
        },
      })
      .where(eq(runs.id, runId));

    // Create hypothesis records
    const createdHypotheses: Array<{ uuid: string; title: string }> = [];
    for (let i = 0; i < parsedHypotheses.length; i++) {
      const h = parsedHypotheses[i];
      const uuid = generateUUID();

      await db.insert(hypotheses).values({
        uuid,
        projectId: run.projectId,
        runId: runId,
        hypothesisNumber: i + 1,
        indexInRun: i,
        displayTitle: h.title,
        step2_1Summary: h.summary,
        processingStatus: 'pending',
        fullData: { raw: h, reprocessed: true },
      });

      createdHypotheses.push({ uuid, title: h.title });
      logger.log(`Created hypothesis ${i + 1}: ${h.title}`);
    }

    // ===== Steps 3-5: Evaluate each hypothesis =====
    logger.log(`Starting evaluation for ${createdHypotheses.length} hypotheses`);

    await db
      .update(runs)
      .set({
        currentStep: 3,
        progressInfo: {
          message: `Step 3-5: ${createdHypotheses.length}件の仮説を評価中...`,
          phase: 'evaluation',
          totalHypotheses: createdHypotheses.length,
        },
      })
      .where(eq(runs.id, runId));

    // Process each hypothesis through Steps 3-5
    const evaluationPromises = createdHypotheses.map(async (h) => {
      try {
        await processEvaluationSteps(
          ai,
          h.uuid,
          uploadedContent,
          technicalAssetsContent,
          logger
        );
      } catch (error) {
        logger.error(`Evaluation error for hypothesis ${h.uuid}:`, error);
        await db
          .update(hypotheses)
          .set({
            processingStatus: 'error',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          })
          .where(eq(hypotheses.uuid, h.uuid));
      }
    });

    await Promise.all(evaluationPromises);

    // Complete
    await db
      .update(runs)
      .set({
        status: 'completed',
        currentStep: 5,
        completedAt: new Date(),
        progressInfo: { message: '再処理が完了しました', phase: 'completed' },
      })
      .where(eq(runs.id, runId));

    logger.log(`Reprocess run ${runId} completed successfully`);
  } catch (error) {
    logger.error(`Fatal error for reprocess run ${runId}:`, error);
    await db
      .update(runs)
      .set({
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(runs.id, runId));
  }
}

/**
 * Process Steps 3-5 for a single hypothesis
 */
async function processEvaluationSteps(
  ai: ReturnType<typeof createAIAdapter>,
  hypothesisUuid: string,
  uploadedContent: string,
  technicalAssetsContent: string,
  logger: Logger
): Promise<void> {
  const [hypothesis] = await db
    .select()
    .from(hypotheses)
    .where(eq(hypotheses.uuid, hypothesisUuid));

  if (!hypothesis) return;

  const context = buildHypothesisContext({
    displayTitle: hypothesis.displayTitle,
    uuid: hypothesis.uuid,
    step2_1Summary: hypothesis.step2_1Summary,
    step2_2Output: uploadedContent.slice(0, 5000), // Use uploaded content as context
    targetSpecContent: uploadedContent,
    technicalAssetsContent,
  });

  // Step 3: Technical Evaluation
  logger.log(`Step 3 for hypothesis ${hypothesisUuid}`);
  await db
    .update(hypotheses)
    .set({ processingStatus: 'step3' })
    .where(eq(hypotheses.uuid, hypothesisUuid));

  const step3Prompt = formatPrompt(STEP3_PROMPT, { HYPOTHESIS_COUNT: 1 }) + '\n\n' + context;
  const step3Output = await ai.generateContent({ prompt: step3Prompt });
  await db
    .update(hypotheses)
    .set({ step3Output })
    .where(eq(hypotheses.uuid, hypothesisUuid));

  // Step 4: Competitive Analysis
  logger.log(`Step 4 for hypothesis ${hypothesisUuid}`);
  await db
    .update(hypotheses)
    .set({ processingStatus: 'step4' })
    .where(eq(hypotheses.uuid, hypothesisUuid));

  const step4Prompt =
    formatPrompt(STEP4_PROMPT, { HYPOTHESIS_COUNT: 1 }) +
    '\n\n' +
    context +
    `\n\n=== Step 3 技術評価結果 ===\n${step3Output}`;
  const step4Output = await ai.generateContent({ prompt: step4Prompt });
  await db
    .update(hypotheses)
    .set({ step4Output })
    .where(eq(hypotheses.uuid, hypothesisUuid));

  // Step 5: Integration
  logger.log(`Step 5 for hypothesis ${hypothesisUuid}`);
  await db
    .update(hypotheses)
    .set({ processingStatus: 'step5' })
    .where(eq(hypotheses.uuid, hypothesisUuid));

  const step5Prompt =
    formatPrompt(STEP5_PROMPT, { HYPOTHESIS_COUNT: 1 }) +
    '\n\n' +
    context +
    `\n\n=== Step 3 技術評価 ===\n${step3Output}` +
    `\n\n=== Step 4 競合分析 ===\n${step4Output}`;
  const step5Output = await ai.generateContent({ prompt: step5Prompt });

  await db
    .update(hypotheses)
    .set({
      step5Output,
      processingStatus: 'completed',
    })
    .where(eq(hypotheses.uuid, hypothesisUuid));

  logger.log(`Hypothesis ${hypothesisUuid} evaluation completed`);
}
