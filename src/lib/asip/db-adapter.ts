/**
 * Database Adapter for ASIP Pipeline
 *
 * Implements the DatabaseOperations interface using Drizzle ORM
 */

import { db } from '@/lib/db';
import { runs, resources, hypotheses } from '@/lib/db/schema';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import {
  DatabaseOperations,
  RunData,
  ResourceData,
  HypothesisData,
  RunStatus,
  ProgressInfo,
  HypothesisProcessingStatus,
} from './pipeline-core';

/**
 * Create database adapter using Drizzle ORM
 */
export function createDatabaseAdapter(): DatabaseOperations {
  return {
    async getRun(runId: number): Promise<RunData | null> {
      const [run] = await db.select().from(runs).where(eq(runs.id, runId));
      if (!run) return null;

      return {
        id: run.id,
        projectId: run.projectId,
        hypothesisCount: run.hypothesisCount,
        jobName: run.jobName,
        targetSpecId: run.targetSpecId,
        technicalAssetsId: run.technicalAssetsId,
        progressInfo: run.progressInfo as RunData['progressInfo'],
      };
    },

    async getResource(resourceId: number): Promise<ResourceData | null> {
      const [resource] = await db.select().from(resources).where(eq(resources.id, resourceId));
      if (!resource) return null;

      return {
        id: resource.id,
        content: resource.content,
      };
    },

    async updateRunStatus(
      runId: number,
      updates: Partial<{
        status: RunStatus;
        currentStep: number;
        errorMessage: string | null;
        step2_1Output: string;
        completedAt: Date;
        progressInfo: ProgressInfo;
      }>
    ): Promise<void> {
      await db.update(runs).set(updates).where(eq(runs.id, runId));
    },

    async createHypothesis(data: {
      uuid: string;
      projectId: number;
      runId: number;
      hypothesisNumber: number;
      indexInRun: number;
      displayTitle: string;
      step2_1Summary: string;
      processingStatus: HypothesisProcessingStatus;
      fullData: unknown;
    }): Promise<void> {
      await db.insert(hypotheses).values({
        uuid: data.uuid,
        projectId: data.projectId,
        runId: data.runId,
        hypothesisNumber: data.hypothesisNumber,
        indexInRun: data.indexInRun,
        displayTitle: data.displayTitle,
        step2_1Summary: data.step2_1Summary,
        processingStatus: data.processingStatus,
        fullData: data.fullData,
      });
    },

    async getHypothesis(uuid: string): Promise<HypothesisData | null> {
      const [hypothesis] = await db.select().from(hypotheses).where(eq(hypotheses.uuid, uuid));
      if (!hypothesis) return null;

      return {
        uuid: hypothesis.uuid,
        displayTitle: hypothesis.displayTitle,
        hypothesisNumber: hypothesis.hypothesisNumber,
        step2_1Summary: hypothesis.step2_1Summary,
        step2_2Output: hypothesis.step2_2Output,
        step3Output: hypothesis.step3Output,
        step4Output: hypothesis.step4Output,
        step5Output: hypothesis.step5Output,
        processingStatus: hypothesis.processingStatus as HypothesisProcessingStatus | null,
        errorMessage: hypothesis.errorMessage,
      };
    },

    async updateHypothesis(
      uuid: string,
      updates: Partial<{
        processingStatus: HypothesisProcessingStatus;
        step2_2Output: string;
        step3Output: string;
        step4Output: string;
        step5Output: string;
        errorMessage: string;
      }>
    ): Promise<void> {
      await db.update(hypotheses).set(updates).where(eq(hypotheses.uuid, uuid));
    },

    async getExistingHypotheses(
      projectId: number,
      filter: { targetSpecIds?: number[]; technicalAssetsIds?: number[] }
    ): Promise<Array<{ title: string; summary: string }>> {
      // Get runs that match the filter criteria
      const filterConditions = [];

      if (filter.targetSpecIds && filter.targetSpecIds.length > 0) {
        filterConditions.push(inArray(runs.targetSpecId, filter.targetSpecIds));
      }
      if (filter.technicalAssetsIds && filter.technicalAssetsIds.length > 0) {
        filterConditions.push(inArray(runs.technicalAssetsId, filter.technicalAssetsIds));
      }

      if (filterConditions.length === 0) {
        return [];
      }

      // Get completed runs matching the filter
      const matchingRuns = await db
        .select({ id: runs.id })
        .from(runs)
        .where(
          and(
            eq(runs.projectId, projectId),
            eq(runs.status, 'completed'),
            ...filterConditions
          )
        );

      if (matchingRuns.length === 0) {
        return [];
      }

      const runIds = matchingRuns.map(r => r.id);

      // Get hypotheses from those runs
      const existingHypotheses = await db
        .select({
          displayTitle: hypotheses.displayTitle,
          step2_1Summary: hypotheses.step2_1Summary,
        })
        .from(hypotheses)
        .where(
          and(
            inArray(hypotheses.runId, runIds),
            isNull(hypotheses.deletedAt)
          )
        );

      return existingHypotheses.map(h => ({
        title: h.displayTitle || '',
        summary: h.step2_1Summary || '',
      }));
    },
  };
}
