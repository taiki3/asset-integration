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
};

describe('step-executor', () => {
  describe('getNextPhase', () => {
    it('returns step2_1 for pending run', () => {
      expect(getNextPhase('pending', 0, [])).toBe('step2_1');
    });

    it('returns step2_1_5 after step 2-1 output exists', () => {
      expect(getNextPhase('running', 1, [])).toBe('step2_1_5');
    });

    it('returns step2_2 when hypotheses exist but not researched', () => {
      const hypotheses = [
        { ...sampleHypothesis, processingStatus: 'pending' as const },
      ];
      expect(getNextPhase('running', 2, hypotheses)).toBe('step2_2');
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

    it('executes step2_1 for pending run', async () => {
      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue({ ...sampleRun, status: 'pending' }),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesesForRun: vi.fn().mockResolvedValue([]),
        },
        {
          executeDeepResearch: vi.fn().mockResolvedValue('Research output'),
        }
      );

      const result = await executeNextStep(deps, 1);

      expect(result.phase).toBe('step2_1');
      expect(result.hasMore).toBe(true);
      expect(deps.ai.executeDeepResearch).toHaveBeenCalled();
      expect(deps.db.updateRunStatus).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ step2_1Output: 'Research output' })
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

    it('executes step2_2 for next pending hypothesis', async () => {
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
          executeDeepResearch: vi.fn().mockResolvedValue('Step 2-2 output'),
        }
      );

      const result = await executeNextStep(deps, 1);

      expect(result.phase).toBe('step2_2');
      // Only 1 hypothesis, after processing it hasMore should indicate next phase (evaluation)
      expect(result.hasMore).toBe(true); // Still has evaluation phase
      expect(deps.db.updateHypothesis).toHaveBeenCalledWith(
        'test-uuid-123',
        expect.objectContaining({ step2_2Output: 'Step 2-2 output' })
      );
    });

    it('executes step2_2 for multiple hypotheses', async () => {
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
          executeDeepResearch: vi.fn().mockResolvedValue('Step 2-2 output'),
        }
      );

      const result = await executeNextStep(deps, 1);

      expect(result.phase).toBe('step2_2');
      expect(result.hasMore).toBe(true); // Still has more hypotheses
    });

    it('executes evaluation for hypothesis ready for steps 3-5', async () => {
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

      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue(runAfterStep2_2),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesesForRun: vi.fn().mockResolvedValue([step2_2DoneHypothesis]),
          getHypothesis: vi.fn().mockResolvedValue(step2_2DoneHypothesis),
        },
        {
          generateContent: vi.fn().mockResolvedValue('Evaluation output'),
        }
      );

      const result = await executeNextStep(deps, 1);

      expect(result.phase).toBe('evaluation');
      // Only 1 hypothesis, after evaluation it will be completed, no more steps
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
          executeDeepResearch: vi.fn().mockResolvedValue('Output'),
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
          executeDeepResearch: vi.fn().mockRejectedValue(new Error('API timeout')),
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
