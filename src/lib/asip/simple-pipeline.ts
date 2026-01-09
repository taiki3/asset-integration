/**
 * ASIP Pipeline with Deep Research
 *
 * This pipeline uses Gemini's Deep Research Agent for Steps 2-1 and 2-2.
 * Deep Research provides thorough web-based investigation.
 *
 * Step Structure:
 * - Step 2-1: Generate N hypotheses using Deep Research (~10 min)
 * - Step 2-2: Detailed research for each hypothesis using Deep Research (~10 min each)
 * - Step 3-5: Evaluation steps using standard Gemini API (faster)
 *
 * Note: Deep Research has a rate limit of 1 request per minute.
 */

// Ensure proxy is set up before any API calls
import '@/lib/gemini/proxy-setup';
import { db } from '@/lib/db';
import { runs, resources, hypotheses } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  executeDeepResearch,
  generateContent,
} from '@/lib/gemini/interactions';
import {
  STEP2_1_PROMPT,
  STEP3_PROMPT,
  STEP4_PROMPT,
  STEP5_PROMPT,
  buildInstructionDocument,
  formatPrompt,
} from './prompts';

// Helper to generate UUID
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Update run status in database
 */
async function updateRunStatus(
  runId: number,
  updates: Partial<{
    status: 'pending' | 'running' | 'completed' | 'error';
    currentStep: number;
    errorMessage: string | null;
    step2_1Output: string;
    completedAt: Date;
    progressInfo: any;
  }>
): Promise<void> {
  await db.update(runs).set(updates).where(eq(runs.id, runId));
}

/**
 * Start the ASIP pipeline with Deep Research
 */
export async function startSimplePipeline(runId: number): Promise<void> {
  console.log(`[Pipeline] Starting run ${runId}`);

  try {
    // Get run and resources
    const [run] = await db.select().from(runs).where(eq(runs.id, runId));
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    const targetSpec = run.targetSpecId
      ? (await db.select().from(resources).where(eq(resources.id, run.targetSpecId)))[0]
      : null;
    const technicalAssets = run.technicalAssetsId
      ? (await db.select().from(resources).where(eq(resources.id, run.technicalAssetsId)))[0]
      : null;

    if (!targetSpec || !technicalAssets) {
      await updateRunStatus(runId, {
        status: 'error',
        errorMessage: 'ターゲット仕様または技術資産が見つかりません',
      });
      return;
    }

    // Update status to running
    await updateRunStatus(runId, {
      status: 'running',
      currentStep: 2,
      progressInfo: { message: 'Step 2-1: Deep Research で仮説生成を開始しています...', phase: 'step2_1' },
    });

    // ===== STEP 2-1: Generate Hypotheses using Deep Research =====
    console.log(`[Pipeline] Step 2-1: Starting Deep Research for hypothesis generation`);

    const instructions = buildInstructionDocument(run.hypothesisCount, false);

    let step2_1Output: string;
    try {
      step2_1Output = await executeDeepResearch({
        prompt: 'task_instructionsの指示に従い、事業仮説を生成してください。',
        files: [
          { name: 'target_specification', content: targetSpec.content },
          { name: 'technical_assets', content: technicalAssets.content },
          { name: 'task_instructions', content: instructions },
        ],
        storeName: `asip-run-${runId}-step2_1`,
        onProgress: async (phase, detail) => {
          console.log(`[Pipeline] Step 2-1 progress: ${phase} - ${detail}`);
          await updateRunStatus(runId, {
            progressInfo: { message: `Step 2-1: ${detail}`, phase: 'step2_1', detail: phase },
          });
        },
      });
    } catch (error) {
      console.error(`[Pipeline] Step 2-1 failed:`, error);
      await updateRunStatus(runId, {
        status: 'error',
        errorMessage: `Step 2-1 Deep Research 失敗: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      return;
    }

    console.log(`[Pipeline] Step 2-1 completed. Output length: ${step2_1Output.length}`);

    await updateRunStatus(runId, {
      currentStep: 2,
      step2_1Output: step2_1Output,
      progressInfo: { message: 'Step 2-1.5: AIで仮説を構造化しています...', phase: 'step2_1_5' },
    });

    // ===== STEP 2-1.5: Structure hypotheses using AI =====
    console.log(`[Pipeline] Step 2-1.5: Structuring hypotheses with AI`);

    const structuredHypotheses = await structureHypothesesWithAI(
      step2_1Output,
      run.hypothesisCount,
      targetSpec.content,
      technicalAssets.content
    );

    console.log(`[Pipeline] Step 2-1.5: Structured ${structuredHypotheses.length} hypotheses`);

    const parsedHypotheses = structuredHypotheses;

    if (parsedHypotheses.length === 0) {
      // Fallback: If AI structuring failed, create one from the entire output
      parsedHypotheses.push({
        title: run.jobName || '生成された仮説',
        summary: step2_1Output.slice(0, 2000),
      });
    }

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
        fullData: { raw: h },
      });

      createdHypotheses.push({ uuid, title: h.title });
      console.log(`[Pipeline] Created hypothesis ${i + 1}: ${h.title}`);
    }

    // ===== STEP 2-2: Deep Research for each hypothesis (parallel, max 10 concurrent) =====
    console.log(`[Pipeline] Step 2-2: Starting parallel Deep Research for ${createdHypotheses.length} hypotheses`);

    await updateRunStatus(runId, {
      progressInfo: {
        message: `Step 2-2: ${createdHypotheses.length}件の仮説をDeep Researchで並列調査中...`,
        phase: 'step2_2',
        totalHypotheses: createdHypotheses.length,
        processingHypotheses: createdHypotheses.map(h => h.title.slice(0, 30)),
      },
    });

    // Process all hypotheses in parallel (rate limiting handled in executeDeepResearch)
    const step2_2Promises = createdHypotheses.map(async (h, i) => {
      try {
        console.log(`[Pipeline] Step 2-2 starting for hypothesis ${i + 1}: ${h.uuid}`);
        await processStep2_2(runId, h.uuid, targetSpec.content, technicalAssets.content);
        console.log(`[Pipeline] Step 2-2 completed for hypothesis ${i + 1}: ${h.uuid}`);
      } catch (error) {
        console.error(`[Pipeline] Step 2-2 error for hypothesis ${h.uuid}:`, error);
        await db
          .update(hypotheses)
          .set({
            processingStatus: 'error',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          })
          .where(eq(hypotheses.uuid, h.uuid));
      }
    });

    await Promise.all(step2_2Promises);

    // ===== STEP 3-5: Evaluate each hypothesis (parallel, using standard API) =====
    console.log(`[Pipeline] Steps 3-5: Starting parallel evaluation`);

    await updateRunStatus(runId, {
      currentStep: 3,
      progressInfo: {
        message: `Step 3-5: ${createdHypotheses.length}件の仮説を評価中...`,
        phase: 'evaluation',
        totalHypotheses: createdHypotheses.length,
      },
    });

    // Process all hypotheses through Steps 3-5 in parallel
    const evaluationPromises = createdHypotheses.map(async (h, i) => {
      try {
        console.log(`[Pipeline] Starting Steps 3-5 for hypothesis ${i + 1}: ${h.uuid}`);
        await processSteps3to5(runId, h.uuid, targetSpec.content, technicalAssets.content);
        console.log(`[Pipeline] Completed Steps 3-5 for hypothesis ${i + 1}: ${h.uuid}`);
      } catch (error) {
        console.error(`[Pipeline] Steps 3-5 error for hypothesis ${h.uuid}:`, error);
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

    // ===== Complete =====
    await updateRunStatus(runId, {
      status: 'completed',
      currentStep: 5,
      completedAt: new Date(),
      progressInfo: { message: '完了しました', phase: 'completed' },
    });

    console.log(`[Pipeline] Run ${runId} completed successfully`);

  } catch (error) {
    console.error(`[Pipeline] Fatal error for run ${runId}:`, error);
    await updateRunStatus(runId, {
      status: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Process Step 2-2: Deep Research for a single hypothesis
 */
async function processStep2_2(
  runId: number,
  hypothesisUuid: string,
  targetSpecContent: string,
  technicalAssetsContent: string
): Promise<void> {
  const [hypothesis] = await db.select().from(hypotheses).where(eq(hypotheses.uuid, hypothesisUuid));
  if (!hypothesis) return;

  console.log(`[Pipeline] Step 2-2 for hypothesis ${hypothesisUuid}`);
  await db.update(hypotheses).set({ processingStatus: 'step2_2' }).where(eq(hypotheses.uuid, hypothesisUuid));

  // Prepare context for Deep Research
  const hypothesisContext = `
=== 仮説情報 ===
タイトル: ${hypothesis.displayTitle}
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

  const step2_2Output = await executeDeepResearch({
    prompt: `hypothesis_contextの仮説について、task_instructionsの指示に従って詳細な調査レポートを作成してください。`,
    files: [
      { name: 'target_specification', content: targetSpecContent },
      { name: 'technical_assets', content: technicalAssetsContent },
      { name: 'hypothesis_context', content: hypothesisContext },
      { name: 'task_instructions', content: taskInstructions },
    ],
    storeName: `asip-${runId}-${hypothesisUuid.slice(0, 8)}`,
    onProgress: (phase, detail) => {
      console.log(`[Pipeline] Step 2-2 [${hypothesis.hypothesisNumber}] ${phase}: ${detail}`);
    },
  });

  await db.update(hypotheses).set({ step2_2Output }).where(eq(hypotheses.uuid, hypothesisUuid));
  console.log(`[Pipeline] Step 2-2 completed for hypothesis ${hypothesisUuid}`);
}

/**
 * Process Steps 3-5 for a single hypothesis (uses standard Gemini API)
 */
async function processSteps3to5(
  runId: number,
  hypothesisUuid: string,
  targetSpecContent: string,
  technicalAssetsContent: string
): Promise<void> {
  const [hypothesis] = await db.select().from(hypotheses).where(eq(hypotheses.uuid, hypothesisUuid));
  if (!hypothesis) return;

  // Build context including Step 2-2 results
  const context = `
=== 仮説情報 ===
タイトル: ${hypothesis.displayTitle}
UUID: ${hypothesis.uuid}

=== 仮説概要 (Step 2-1) ===
${hypothesis.step2_1Summary || ''}

=== 詳細調査レポート (Step 2-2) ===
${hypothesis.step2_2Output || ''}

=== 市場・顧客ニーズ ===
${targetSpecContent}

=== 技術資産 ===
${technicalAssetsContent}
`;

  // Step 3: Technical Evaluation
  console.log(`[Pipeline] Step 3 for hypothesis ${hypothesisUuid}`);
  await db.update(hypotheses).set({ processingStatus: 'step3' }).where(eq(hypotheses.uuid, hypothesisUuid));

  const step3Prompt = formatPrompt(STEP3_PROMPT, { HYPOTHESIS_COUNT: 1 }) + '\n\n' + context;
  const step3Output = await generateContent({ prompt: step3Prompt });

  await db.update(hypotheses).set({ step3Output }).where(eq(hypotheses.uuid, hypothesisUuid));

  // Step 4: Competitive Analysis
  console.log(`[Pipeline] Step 4 for hypothesis ${hypothesisUuid}`);
  await db.update(hypotheses).set({ processingStatus: 'step4' }).where(eq(hypotheses.uuid, hypothesisUuid));

  const step4Prompt = formatPrompt(STEP4_PROMPT, { HYPOTHESIS_COUNT: 1 }) + '\n\n' + context +
    `\n\n=== Step 3 技術評価結果 ===\n${step3Output}`;
  const step4Output = await generateContent({ prompt: step4Prompt });

  await db.update(hypotheses).set({ step4Output }).where(eq(hypotheses.uuid, hypothesisUuid));

  // Step 5: Integration
  console.log(`[Pipeline] Step 5 for hypothesis ${hypothesisUuid}`);
  await db.update(hypotheses).set({ processingStatus: 'step5' }).where(eq(hypotheses.uuid, hypothesisUuid));

  const step5Prompt = formatPrompt(STEP5_PROMPT, { HYPOTHESIS_COUNT: 1 }) + '\n\n' + context +
    `\n\n=== Step 3 技術評価 ===\n${step3Output}` +
    `\n\n=== Step 4 競合分析 ===\n${step4Output}`;
  const step5Output = await generateContent({ prompt: step5Prompt });

  await db
    .update(hypotheses)
    .set({
      step5Output,
      processingStatus: 'completed',
    })
    .where(eq(hypotheses.uuid, hypothesisUuid));

  console.log(`[Pipeline] Hypothesis ${hypothesisUuid} completed`);
}

/**
 * Step 2-1.5: Structure hypotheses using AI
 * Takes raw Deep Research output and extracts exactly N hypotheses in structured format
 */
async function structureHypothesesWithAI(
  rawOutput: string,
  targetCount: number,
  targetSpecContent: string,
  technicalAssetsContent: string
): Promise<Array<{ title: string; summary: string }>> {
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
    const response = await generateContent({ prompt: structuringPrompt });

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*"hypotheses"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Pipeline] Step 2-1.5: No JSON found in response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.hypotheses || !Array.isArray(parsed.hypotheses)) {
      console.error('[Pipeline] Step 2-1.5: Invalid JSON structure');
      return [];
    }

    // Validate and clean hypotheses
    const validHypotheses = parsed.hypotheses
      .filter((h: any) => h.title && h.summary && typeof h.title === 'string' && typeof h.summary === 'string')
      .map((h: any) => ({
        title: h.title.trim().slice(0, 100),
        summary: h.summary.trim().slice(0, 2000),
      }));

    console.log(`[Pipeline] Step 2-1.5: Extracted ${validHypotheses.length} valid hypotheses`);
    return validHypotheses;

  } catch (error) {
    console.error('[Pipeline] Step 2-1.5: Failed to structure hypotheses:', error);
    return [];
  }
}

/**
 * Parse hypotheses from Step 2-1 output (legacy fallback)
 */
function parseHypothesesFromOutput(output: string): Array<{
  title: string;
  summary: string;
}> {
  const results: Array<{ title: string; summary: string }> = [];

  // Strategy 1: 【仮説N】 pattern
  const pattern1 = /【仮説(\d+)】\s*([^\n]+)([\s\S]*?)(?=【仮説\d+】|$)/g;
  let match;

  while ((match = pattern1.exec(output)) !== null) {
    const title = match[2].trim();
    const summary = match[3].trim().slice(0, 2000);
    if (title && title.length > 0) {
      results.push({ title, summary });
    }
  }

  // Strategy 2: Markdown headers ### 仮説 N or ## 仮説N
  if (results.length === 0) {
    const pattern2 = /#{2,3}\s*仮説\s*(\d+)[：:]*\s*([^\n]+)([\s\S]*?)(?=#{2,3}\s*仮説|$)/g;
    while ((match = pattern2.exec(output)) !== null) {
      const title = match[2].trim();
      const summary = match[3].trim().slice(0, 2000);
      if (title && title.length > 0) {
        results.push({ title, summary });
      }
    }
  }

  // Strategy 3: Numbered patterns (1. or 1)
  if (results.length === 0) {
    const pattern3 = /(?:^|\n)(\d+)[.）)]\s*(?:\*\*)?([^\n*]+)(?:\*\*)?([\s\S]*?)(?=(?:^|\n)\d+[.）)]|$)/gm;
    while ((match = pattern3.exec(output)) !== null) {
      const title = match[2].trim();
      const summary = match[3].trim().slice(0, 2000);
      if (title && title.length > 5 && title.length < 200) {
        results.push({ title, summary });
      }
    }
  }

  // Remove duplicates by title
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Get run status for polling
 */
export async function getRunStatus(runId: number): Promise<{
  status: string;
  currentStep: number;
  progressInfo: any;
  error?: string;
}> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));

  if (!run) {
    return {
      status: 'not_found',
      currentStep: 0,
      progressInfo: null,
    };
  }

  return {
    status: run.status,
    currentStep: run.currentStep,
    progressInfo: run.progressInfo,
    error: run.errorMessage || undefined,
  };
}
