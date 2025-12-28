import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runs } from '@/lib/db/schema';
import { eq, and, or } from 'drizzle-orm';
import {
  getInteractionStatus,
  extractTextOutput,
} from '@/lib/gemini/interactions';

/**
 * Cron endpoint for polling Gemini interaction statuses
 * Runs every minute via Vercel Cron
 *
 * This is the heart of the async job architecture:
 * 1. Find all runs with status 'running'
 * 2. Check each pending Gemini interaction
 * 3. If completed, save result and trigger next step
 * 4. If failed, mark run as error
 */
export async function GET(request: NextRequest) {
  // Verify cron secret in production
  const authHeader = request.headers.get('authorization');
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Find all running jobs
    const activeRuns = await db
      .select()
      .from(runs)
      .where(
        or(
          eq(runs.status, 'running'),
          eq(runs.status, 'pending')
        )
      );

    const results: Array<{
      runId: number;
      status: string;
      updated: boolean;
    }> = [];

    for (const run of activeRuns) {
      const interactions = run.geminiInteractions || [];
      let updated = false;

      for (const interaction of interactions) {
        if (interaction.status === 'running') {
          try {
            const result = await getInteractionStatus(interaction.interactionId);

            if (result.status === 'completed') {
              // Update interaction status
              interaction.status = 'completed';
              interaction.completedAt = new Date().toISOString();

              const textOutput = extractTextOutput(result);

              // Save output based on step
              await saveStepOutput(run.id, interaction.step, textOutput || '');

              updated = true;
            } else if (result.status === 'failed') {
              interaction.status = 'failed';

              // Mark run as error
              await db
                .update(runs)
                .set({
                  status: 'error',
                  errorMessage: result.error || 'Gemini interaction failed',
                  geminiInteractions: interactions,
                })
                .where(eq(runs.id, run.id));

              updated = true;
            }
          } catch (error) {
            console.error(
              `Error polling interaction ${interaction.interactionId}:`,
              error
            );
          }
        }
      }

      if (updated) {
        // Check if all interactions are complete
        const allCompleted = interactions.every(
          (i) => i.status === 'completed' || i.status === 'failed'
        );
        const anyFailed = interactions.some((i) => i.status === 'failed');

        if (allCompleted) {
          if (anyFailed) {
            await db
              .update(runs)
              .set({
                status: 'error',
                geminiInteractions: interactions,
              })
              .where(eq(runs.id, run.id));
          } else {
            // Check if we need to start next step
            await triggerNextStep(run.id, run.currentStep);
          }
        } else {
          // Just update interactions
          await db
            .update(runs)
            .set({ geminiInteractions: interactions })
            .where(eq(runs.id, run.id));
        }
      }

      results.push({
        runId: run.id,
        status: run.status,
        updated,
      });
    }

    return NextResponse.json({
      processed: results.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron poll-jobs error:', error);
    return NextResponse.json(
      { error: 'Failed to poll jobs' },
      { status: 500 }
    );
  }
}

async function saveStepOutput(
  runId: number,
  step: string,
  output: string
): Promise<void> {
  const updates: Partial<typeof runs.$inferInsert> = {};

  switch (step) {
    case '2-1':
      updates.step2_1Output = output;
      break;
    case '2-2':
      // Individual outputs are stored separately
      break;
    // Add more step handlers as needed
  }

  if (Object.keys(updates).length > 0) {
    await db.update(runs).set(updates).where(eq(runs.id, runId));
  }
}

async function triggerNextStep(
  runId: number,
  currentStep: number
): Promise<void> {
  // This would trigger the next step in the pipeline
  // For now, we'll just update the step number
  // The actual step logic would be handled by another API endpoint

  const nextStep = currentStep + 1;

  if (nextStep > 5) {
    // All steps complete
    await db
      .update(runs)
      .set({
        status: 'completed',
        currentStep: 5,
        completedAt: new Date(),
      })
      .where(eq(runs.id, runId));
  } else {
    await db
      .update(runs)
      .set({ currentStep: nextStep })
      .where(eq(runs.id, runId));

    // TODO: Call the step execution endpoint
    // await fetch(`/api/runs/${runId}/execute-step`, { method: 'POST' });
  }
}
