import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeNextStep,
  getNextPhase,
  StepExecutorDependencies,
  PipelinePhase,
  ExtendedDatabaseOperations,
} from './step-executor';
import { AIOperations, RunData, ResourceData, HypothesisData } from './pipeline-core';

// Mock factories
function createMockDb(overrides: Partial<ExtendedDatabaseOperations> = {}): ExtendedDatabaseOperations {
  return {
    getRun: vi.fn().mockResolvedValue(null),
    getResource: vi.fn().mockResolvedValue(null),
    updateRunStatus: vi.fn().mockResolvedValue(undefined),
    createHypothesis: vi.fn().mockResolvedValue(undefined),
    getHypothesis: vi.fn().mockResolvedValue(null),
    updateHypothesis: vi.fn().mockResolvedValue(undefined),
    getHypothesesForRun: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function createMockAI(overrides: Partial<AIOperations> = {}): AIOperations {
  return {
    executeDeepResearch: vi.fn().mockResolvedValue('Mock research output'),
    generateContent: vi.fn().mockResolvedValue('Mock generated content'),
    // Async Deep Research methods for serverless
    startDeepResearchAsync: vi.fn().mockResolvedValue({
      interactionId: 'mock-interaction-id',
      fileSearchStoreName: 'mock-store-name',
    }),
    checkDeepResearchStatus: vi.fn().mockResolvedValue({
      status: 'completed',
      result: 'Mock async research output',
    }),
    cleanupDeepResearch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockDeps(
  dbOverrides: Partial<ExtendedDatabaseOperations> = {},
  aiOverrides: Partial<AIOperations> = {}
): StepExecutorDependencies {
  return {
    db: createMockDb(dbOverrides),
    ai: createMockAI(aiOverrides),
    logger: {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  };
}

// Sample data
const sampleRun: RunData & { status: string; updatedAt: Date } = {
  id: 1,
  projectId: 100,
  hypothesisCount: 3,
  jobName: 'Test Run',
  targetSpecId: 10,
  technicalAssetsId: 20,
  status: 'pending',
  updatedAt: new Date(),
};

const sampleResource: ResourceData = {
  id: 10,
  content: 'Sample resource content',
};

const sampleHypothesis: HypothesisData = {
  uuid: 'test-uuid-123',
  displayTitle: 'Test Hypothesis',
  hypothesisNumber: 1,
  step2_1Summary: 'Initial summary',
  step2_2Output: null,
  step3Output: null,
  step4Output: null,
  step5Output: null,
  processingStatus: 'pending',
  fullData: null,
};

describe('step-executor', () => {
  describe('getNextPhase', () => {
    it('returns step2_1_start for pending run (async mode)', () => {
      expect(getNextPhase('pending', 0, [])).toBe('step2_1_start');
    });

    it('returns step2_1_polling when Deep Research handle exists', () => {
      const progressInfo = {
        deepResearchHandle: { interactionId: 'test', fileSearchStoreName: 'test-store' },
      };
      expect(getNextPhase('running', 1, [], progressInfo)).toBe('step2_1_polling');
    });

    it('returns step2_1_5 after step 2-1 output exists', () => {
      expect(getNextPhase('running', 1, [])).toBe('step2_1_5');
    });

    it('returns step2_2_start when hypotheses exist but not researched (async mode)', () => {
      const hypotheses = [
        { ...sampleHypothesis, processingStatus: 'pending' as const },
      ];
      expect(getNextPhase('running', 2, hypotheses)).toBe('step2_2_start');
    });

    it('returns step2_2_polling when hypothesis has Deep Research handle in fullData', () => {
      const hypotheses = [
        {
          ...sampleHypothesis,
          processingStatus: 'step2_2' as const,
          fullData: {
            deepResearchHandle: { interactionId: 'test', fileSearchStoreName: 'test-store' },
          },
        },
      ];
      expect(getNextPhase('running', 2, hypotheses)).toBe('step2_2_polling');
    });

    it('returns step2_2_polling for legacy progressInfo handle (backwards compatibility)', () => {
      const hypotheses = [
        { ...sampleHypothesis, processingStatus: 'step2_2' as const },
      ];
      const progressInfo = {
        hypothesisDeepResearchHandle: {
          hypothesisUuid: 'test-uuid',
          handle: { interactionId: 'test', fileSearchStoreName: 'test-store' },
        },
      };
      expect(getNextPhase('running', 2, hypotheses, progressInfo)).toBe('step2_2_polling');
    });

    it('returns evaluation when all hypotheses have step2_2 output', () => {
      const hypotheses = [
        { ...sampleHypothesis, processingStatus: 'step2_2' as const, step2_2Output: 'done' },
      ];
      expect(getNextPhase('running', 3, hypotheses)).toBe('evaluation');
    });

    it('returns completed when all hypotheses are completed', () => {
      const hypotheses = [
        { ...sampleHypothesis, processingStatus: 'completed' as const },
      ];
      expect(getNextPhase('running', 4, hypotheses)).toBe('completed');
    });

    it('returns null for already completed run', () => {
      expect(getNextPhase('completed', 5, [])).toBeNull();
    });

    it('returns null for errored run', () => {
      expect(getNextPhase('error', 0, [])).toBeNull();
    });
  });

  describe('executeNextStep', () => {
    it('returns hasMore=false for completed run', async () => {
      const deps = createMockDeps({
        getRun: vi.fn().mockResolvedValue({ ...sampleRun, status: 'completed' }),
      });

      const result = await executeNextStep(deps, 1);

      expect(result.hasMore).toBe(false);
      expect(result.phase).toBe('completed');
    });

    it('returns hasMore=false for errored run', async () => {
      const deps = createMockDeps({
        getRun: vi.fn().mockResolvedValue({ ...sampleRun, status: 'error' }),
      });

      const result = await executeNextStep(deps, 1);

      expect(result.hasMore).toBe(false);
      expect(result.phase).toBe('error');
    });

    it('returns error for missing run', async () => {
      const deps = createMockDeps({
        getRun: vi.fn().mockResolvedValue(null),
      });

      const result = await executeNextStep(deps, 999);

      expect(result.hasMore).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('executes step2_1_start for pending run (async mode)', async () => {
      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue({ ...sampleRun, status: 'pending' }),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesesForRun: vi.fn().mockResolvedValue([]),
        },
        {
          startDeepResearchAsync: vi.fn().mockResolvedValue({
            interactionId: 'test-interaction',
            fileSearchStoreName: 'test-store',
          }),
        }
      );

      const result = await executeNextStep(deps, 1);

      expect(result.phase).toBe('step2_1_start');
      expect(result.hasMore).toBe(true);
      expect(deps.ai.startDeepResearchAsync).toHaveBeenCalled();
      // Should save the handle in progressInfo
      expect(deps.db.updateRunStatus).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          progressInfo: expect.objectContaining({
            deepResearchHandle: expect.objectContaining({
              interactionId: 'test-interaction',
            }),
          }),
        })
      );
    });

    it('executes step2_1_polling and completes when ready', async () => {
      const runWithHandle = {
        ...sampleRun,
        status: 'running',
        currentStep: 1,
        progressInfo: {
          deepResearchHandle: {
            interactionId: 'test-interaction',
            fileSearchStoreName: 'test-store',
          },
        },
      };

      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue(runWithHandle),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesesForRun: vi.fn().mockResolvedValue([]),
        },
        {
          checkDeepResearchStatus: vi.fn().mockResolvedValue({
            status: 'completed',
            result: 'Async research output',
          }),
          cleanupDeepResearch: vi.fn().mockResolvedValue(undefined),
        }
      );

      const result = await executeNextStep(deps, 1);

      expect(result.phase).toBe('step2_1_polling');
      expect(result.hasMore).toBe(true);
      expect(deps.ai.checkDeepResearchStatus).toHaveBeenCalled();
      expect(deps.ai.cleanupDeepResearch).toHaveBeenCalled();
      expect(deps.db.updateRunStatus).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ step2_1Output: 'Async research output' })
      );
    });

    it('executes step2_1_5 when step2_1 is complete', async () => {
      const runWithStep2_1 = {
        ...sampleRun,
        status: 'running',
        currentStep: 1,
        step2_1Output: 'Existing research output',
      };

      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue(runWithStep2_1),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesesForRun: vi.fn().mockResolvedValue([]),
        },
        {
          generateContent: vi.fn().mockResolvedValue(`{
            "hypotheses": [
              {"title": "Test Hypothesis", "summary": "Test summary"}
            ]
          }`),
        }
      );

      const result = await executeNextStep(deps, 1);

      expect(result.phase).toBe('step2_1_5');
      expect(result.hasMore).toBe(true);
      expect(deps.db.createHypothesis).toHaveBeenCalled();
    });

    it('executes step2_2_start for pending hypotheses (async mode, parallel)', async () => {
      const runAfterStep2_1_5 = {
        ...sampleRun,
        status: 'running',
        currentStep: 2,
        step2_1Output: 'Research output',
      };

      const pendingHypothesis = { ...sampleHypothesis, processingStatus: 'pending' as const };

      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue(runAfterStep2_1_5),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesesForRun: vi.fn().mockResolvedValue([pendingHypothesis]),
          getHypothesis: vi.fn().mockResolvedValue(pendingHypothesis),
        },
        {
          startDeepResearchAsync: vi.fn().mockResolvedValue({
            interactionId: 'hyp-interaction',
            fileSearchStoreName: 'hyp-store',
          }),
        }
      );

      const result = await executeNextStep(deps, 1);

      expect(result.phase).toBe('step2_2_start');
      expect(result.hasMore).toBe(true);
      expect(deps.ai.startDeepResearchAsync).toHaveBeenCalled();
      // Should save the handle in hypothesis fullData and update progressInfo with parallel stats
      expect(deps.db.updateHypothesis).toHaveBeenCalledWith(
        'test-uuid-123',
        expect.objectContaining({
          processingStatus: 'step2_2',
          fullData: expect.objectContaining({
            deepResearchHandle: expect.objectContaining({
              interactionId: 'hyp-interaction',
            }),
          }),
        })
      );
      expect(deps.db.updateRunStatus).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          progressInfo: expect.objectContaining({
            inFlightCount: 1,
          }),
        })
      );
    });

    it('executes step2_2_polling and completes when ready (parallel)', async () => {
      const runAfterStep2_2Start = {
        ...sampleRun,
        status: 'running',
        currentStep: 2,
        step2_1Output: 'Research output',
      };

      // Hypothesis with handle in fullData (new parallel format)
      const step2_2Hypothesis = {
        ...sampleHypothesis,
        processingStatus: 'step2_2' as const,
        fullData: {
          deepResearchHandle: {
            interactionId: 'hyp-interaction',
            fileSearchStoreName: 'hyp-store',
          },
        },
      };

      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue(runAfterStep2_2Start),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesesForRun: vi.fn().mockResolvedValue([step2_2Hypothesis]),
        },
        {
          checkDeepResearchStatus: vi.fn().mockResolvedValue({
            status: 'completed',
            result: 'Step 2-2 async output',
          }),
          cleanupDeepResearch: vi.fn().mockResolvedValue(undefined),
        }
      );

      const result = await executeNextStep(deps, 1);

      expect(result.phase).toBe('step2_2_polling');
      expect(result.hasMore).toBe(true);
      expect(deps.ai.checkDeepResearchStatus).toHaveBeenCalled();
      expect(deps.ai.cleanupDeepResearch).toHaveBeenCalled();
      expect(deps.db.updateHypothesis).toHaveBeenCalledWith(
        'test-uuid-123',
        expect.objectContaining({ step2_2Output: 'Step 2-2 async output' })
      );
    });

    it('executes step2_2_polling for legacy progressInfo handle (backwards compatibility)', async () => {
      const runWithLegacyHandle = {
        ...sampleRun,
        status: 'running',
        currentStep: 2,
        step2_1Output: 'Research output',
        progressInfo: {
          hypothesisDeepResearchHandle: {
            hypothesisUuid: 'test-uuid-123',
            handle: {
              interactionId: 'hyp-interaction',
              fileSearchStoreName: 'hyp-store',
            },
          },
        },
      };

      const step2_2Hypothesis = { ...sampleHypothesis, processingStatus: 'step2_2' as const };

      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue(runWithLegacyHandle),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesesForRun: vi.fn().mockResolvedValue([step2_2Hypothesis]),
        },
        {
          checkDeepResearchStatus: vi.fn().mockResolvedValue({
            status: 'completed',
            result: 'Step 2-2 async output',
          }),
          cleanupDeepResearch: vi.fn().mockResolvedValue(undefined),
        }
      );

      const result = await executeNextStep(deps, 1);

      expect(result.phase).toBe('step2_2_polling');
      expect(result.hasMore).toBe(true);
      expect(deps.ai.checkDeepResearchStatus).toHaveBeenCalled();
    });

    it('executes step2_2_start for multiple hypotheses (async mode)', async () => {
      const runAfterStep2_1_5 = {
        ...sampleRun,
        status: 'running',
        currentStep: 2,
        step2_1Output: 'Research output',
      };

      const pendingHypothesis1 = { ...sampleHypothesis, uuid: 'uuid-1', processingStatus: 'pending' as const };
      const pendingHypothesis2 = { ...sampleHypothesis, uuid: 'uuid-2', processingStatus: 'pending' as const };

      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue(runAfterStep2_1_5),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesesForRun: vi.fn().mockResolvedValue([pendingHypothesis1, pendingHypothesis2]),
          getHypothesis: vi.fn().mockResolvedValue(pendingHypothesis1),
        },
        {
          startDeepResearchAsync: vi.fn().mockResolvedValue({
            interactionId: 'hyp-interaction',
            fileSearchStoreName: 'hyp-store',
          }),
        }
      );

      const result = await executeNextStep(deps, 1);

      expect(result.phase).toBe('step2_2_start');
      expect(result.hasMore).toBe(true); // Still has more hypotheses
    });

    it('executes evaluation for hypothesis ready for steps 3-5 (parallel)', async () => {
      const runAfterStep2_2 = {
        ...sampleRun,
        status: 'running',
        currentStep: 3,
        step2_1Output: 'Research output',
      };

      const step2_2DoneHypothesis = {
        ...sampleHypothesis,
        processingStatus: 'step2_2' as const,
        step2_2Output: 'Step 2-2 done',
      };

      const completedHypothesis = {
        ...sampleHypothesis,
        processingStatus: 'completed' as const,
        step2_2Output: 'Step 2-2 done',
        step3Output: 'Evaluation output',
        step4Output: 'Evaluation output',
        step5Output: 'Evaluation output',
      };

      // First call returns hypothesis ready for eval, second call returns completed
      const getHypothesesMock = vi.fn()
        .mockResolvedValueOnce([step2_2DoneHypothesis])
        .mockResolvedValueOnce([completedHypothesis]);

      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue(runAfterStep2_2),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesesForRun: getHypothesesMock,
          getHypothesis: vi.fn().mockResolvedValue(step2_2DoneHypothesis),
        },
        {
          generateContent: vi.fn().mockResolvedValue('Evaluation output'),
        }
      );

      const result = await executeNextStep(deps, 1);

      expect(result.phase).toBe('evaluation');
      // After parallel evaluation completes and re-fetch, all are done
      expect(result.hasMore).toBe(false);
      // Should call generateContent for steps 3, 4, 5
      expect(deps.ai.generateContent).toHaveBeenCalledTimes(3);
    });

    it('executes evaluation for multiple hypotheses', async () => {
      const runAfterStep2_2 = {
        ...sampleRun,
        status: 'running',
        currentStep: 3,
        step2_1Output: 'Research output',
      };

      const step2_2DoneHypothesis1 = {
        ...sampleHypothesis,
        uuid: 'uuid-1',
        processingStatus: 'step2_2' as const,
        step2_2Output: 'Step 2-2 done',
      };
      const step2_2DoneHypothesis2 = {
        ...sampleHypothesis,
        uuid: 'uuid-2',
        processingStatus: 'step2_2' as const,
        step2_2Output: 'Step 2-2 done',
      };

      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue(runAfterStep2_2),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesesForRun: vi.fn().mockResolvedValue([step2_2DoneHypothesis1, step2_2DoneHypothesis2]),
          getHypothesis: vi.fn().mockResolvedValue(step2_2DoneHypothesis1),
        },
        {
          generateContent: vi.fn().mockResolvedValue('Evaluation output'),
        }
      );

      const result = await executeNextStep(deps, 1);

      expect(result.phase).toBe('evaluation');
      expect(result.hasMore).toBe(true); // Still has another hypothesis to evaluate
    });

    it('marks run as completed when all hypotheses are done', async () => {
      const runNearCompletion = {
        ...sampleRun,
        status: 'running',
        currentStep: 4,
        step2_1Output: 'Research output',
      };

      const completedHypothesis = {
        ...sampleHypothesis,
        processingStatus: 'completed' as const,
        step2_2Output: 'done',
        step3Output: 'done',
        step4Output: 'done',
        step5Output: 'done',
      };

      const deps = createMockDeps({
        getRun: vi.fn().mockResolvedValue(runNearCompletion),
        getResource: vi.fn().mockResolvedValue(sampleResource),
        getHypothesesForRun: vi.fn().mockResolvedValue([completedHypothesis]),
      });

      const result = await executeNextStep(deps, 1);

      expect(result.phase).toBe('completed');
      expect(result.hasMore).toBe(false);
      expect(deps.db.updateRunStatus).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: 'completed' })
      );
    });

    it('updates updatedAt on each step', async () => {
      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue({ ...sampleRun, status: 'pending' }),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesesForRun: vi.fn().mockResolvedValue([]),
        },
        {
          startDeepResearchAsync: vi.fn().mockResolvedValue({
            interactionId: 'test',
            fileSearchStoreName: 'test-store',
          }),
        }
      );

      await executeNextStep(deps, 1);

      expect(deps.db.updateRunStatus).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ updatedAt: expect.any(Date) })
      );
    });

    it('handles step execution error gracefully', async () => {
      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue({ ...sampleRun, status: 'pending' }),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesesForRun: vi.fn().mockResolvedValue([]),
        },
        {
          startDeepResearchAsync: vi.fn().mockRejectedValue(new Error('API timeout')),
        }
      );

      const result = await executeNextStep(deps, 1);

      expect(result.hasMore).toBe(false);
      expect(result.error).toContain('API timeout');
      expect(deps.db.updateRunStatus).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: 'error' })
      );
    });

    it('handles missing resources', async () => {
      const deps = createMockDeps({
        getRun: vi.fn().mockResolvedValue({ ...sampleRun, status: 'pending' }),
        getResource: vi.fn().mockResolvedValue(null),
        getHypothesesForRun: vi.fn().mockResolvedValue([]),
      });

      const result = await executeNextStep(deps, 1);

      expect(result.hasMore).toBe(false);
      expect(result.error).toContain('リソース');
    });
  });
});
