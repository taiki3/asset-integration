/**
 * ASIP Pipeline with Deep Research
 *
 * This is the main entry point for the ASIP pipeline.
 * It uses the refactored pipeline-core with dependency injection.
 *
 * Step Structure:
 * - Step 2-1: Generate N hypotheses using Deep Research (~10 min)
 * - Step 2-2: Detailed research for each hypothesis using Deep Research (~10 min each)
 * - Step 3-5: Evaluation steps using standard Gemini API (faster)
 *
 * Note: Deep Research has a rate limit of 10 requests per minute.
 */

// Ensure proxy is set up before any API calls
import '@/lib/gemini/proxy-setup';
import { db } from '@/lib/db';
import { runs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { runPipeline, PipelineDependencies } from './pipeline-core';
import { createDatabaseAdapter } from './db-adapter';
import { createAIAdapter } from './ai-adapter';

/**
 * Start the ASIP pipeline
 *
 * This is the main entry point called from API routes.
 * It creates the dependencies and delegates to the core pipeline.
 */
export async function startSimplePipeline(runId: number): Promise<void> {
  console.log(`[Pipeline] Starting run ${runId}`);

  // Create dependencies
  const deps: PipelineDependencies = {
    db: createDatabaseAdapter(),
    ai: createAIAdapter(),
    logger: {
      log: (message: string) => console.log(`[Pipeline] ${message}`),
      error: (message: string, error?: unknown) => console.error(`[Pipeline] ${message}`, error),
      warn: (message: string) => console.warn(`[Pipeline] ${message}`),
    },
  };

  // Run the pipeline
  await runPipeline(deps, runId);
}

/**
 * Get run status for polling
 */
export async function getRunStatus(runId: number): Promise<{
  status: string;
  currentStep: number;
  progressInfo: unknown;
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
