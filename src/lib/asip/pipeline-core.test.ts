import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  structureHypothesesWithAI,
  processStep2_2,
  processSteps3to5,
  runPipeline,
  DatabaseOperations,
  AIOperations,
  PipelineDependencies,
  RunData,
  ResourceData,
  HypothesisData,
} from './pipeline-core';

// Mock factories
function createMockDb(overrides: Partial<DatabaseOperations> = {}): DatabaseOperations {
  return {
    getRun: vi.fn().mockResolvedValue(null),
    getResource: vi.fn().mockResolvedValue(null),
    updateRunStatus: vi.fn().mockResolvedValue(undefined),
    createHypothesis: vi.fn().mockResolvedValue(undefined),
    getHypothesis: vi.fn().mockResolvedValue(null),
    updateHypothesis: vi.fn().mockResolvedValue(undefined),
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

function createMockLogger() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

function createMockDeps(
  dbOverrides: Partial<DatabaseOperations> = {},
  aiOverrides: Partial<AIOperations> = {}
): PipelineDependencies {
  return {
    db: createMockDb(dbOverrides),
    ai: createMockAI(aiOverrides),
    logger: createMockLogger(),
  };
}

// Sample data
const sampleRun: RunData = {
  id: 1,
  projectId: 100,
  hypothesisCount: 3,
  jobName: 'Test Run',
  targetSpecId: 10,
  technicalAssetsId: 20,
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

describe('pipeline-core', () => {
  describe('structureHypothesesWithAI', () => {
    it('extracts hypotheses from valid JSON response', async () => {
      const mockAI = createMockAI({
        generateContent: vi.fn().mockResolvedValue(`
          Here's the analysis:
          {
            "hypotheses": [
              {"title": "Hypothesis 1", "summary": "Summary 1"},
              {"title": "Hypothesis 2", "summary": "Summary 2"}
            ]
          }
        `),
      });

      const result = await structureHypothesesWithAI(mockAI, 'raw output', 2);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Hypothesis 1');
      expect(result[1].title).toBe('Hypothesis 2');
    });

    it('returns empty array for invalid JSON', async () => {
      const mockAI = createMockAI({
        generateContent: vi.fn().mockResolvedValue('No JSON here'),
      });

      const result = await structureHypothesesWithAI(mockAI, 'raw output', 2);

      expect(result).toHaveLength(0);
    });

    it('returns empty array on API error', async () => {
      const mockAI = createMockAI({
        generateContent: vi.fn().mockRejectedValue(new Error('API Error')),
      });

      const result = await structureHypothesesWithAI(mockAI, 'raw output', 2);

      expect(result).toHaveLength(0);
    });

    it('truncates long content in prompt', async () => {
      const mockAI = createMockAI();
      const longOutput = 'x'.repeat(100000);

      await structureHypothesesWithAI(mockAI, longOutput, 2);

      const calledPrompt = (mockAI.generateContent as ReturnType<typeof vi.fn>).mock.calls[0][0].prompt;
      expect(calledPrompt.length).toBeLessThan(60000);
    });
  });

  describe('processStep2_2', () => {
    it('updates hypothesis with research output', async () => {
      const deps = createMockDeps(
        {
          getHypothesis: vi.fn().mockResolvedValue(sampleHypothesis),
        },
        {
          executeDeepResearch: vi.fn().mockResolvedValue('Detailed research output'),
        }
      );

      await processStep2_2(deps, 1, 'test-uuid-123', 'target spec', 'tech assets');

      expect(deps.db.updateHypothesis).toHaveBeenCalledWith(
        'test-uuid-123',
        expect.objectContaining({ processingStatus: 'step2_2' })
      );
      expect(deps.db.updateHypothesis).toHaveBeenCalledWith(
        'test-uuid-123',
        expect.objectContaining({ step2_2Output: 'Detailed research output' })
      );
    });

    it('does nothing if hypothesis not found', async () => {
      const deps = createMockDeps({
        getHypothesis: vi.fn().mockResolvedValue(null),
      });

      await processStep2_2(deps, 1, 'nonexistent', 'target', 'tech');

      expect(deps.ai.executeDeepResearch).not.toHaveBeenCalled();
    });

    it('passes correct files to deep research', async () => {
      const deps = createMockDeps({
        getHypothesis: vi.fn().mockResolvedValue(sampleHypothesis),
      });

      await processStep2_2(deps, 1, 'test-uuid', 'TARGET_CONTENT', 'TECH_CONTENT');

      const call = (deps.ai.executeDeepResearch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.files).toHaveLength(4);
      expect(call.files.find((f: any) => f.name === 'target_specification').content).toBe('TARGET_CONTENT');
      expect(call.files.find((f: any) => f.name === 'technical_assets').content).toBe('TECH_CONTENT');
    });
  });

  describe('processSteps3to5', () => {
    it('processes all three steps in sequence', async () => {
      const deps = createMockDeps({
        getHypothesis: vi.fn().mockResolvedValue({
          ...sampleHypothesis,
          step2_2Output: 'Research output',
        }),
      });

      await processSteps3to5(deps, 'test-uuid', 'target', 'tech');

      const updateCalls = (deps.db.updateHypothesis as ReturnType<typeof vi.fn>).mock.calls;

      // Should update status for each step
      expect(updateCalls).toContainEqual(['test-uuid', expect.objectContaining({ processingStatus: 'step3' })]);
      expect(updateCalls).toContainEqual(['test-uuid', expect.objectContaining({ processingStatus: 'step4' })]);
      expect(updateCalls).toContainEqual(['test-uuid', expect.objectContaining({ processingStatus: 'step5' })]);

      // Should save outputs
      expect(updateCalls).toContainEqual(['test-uuid', expect.objectContaining({ step3Output: expect.any(String) })]);
      expect(updateCalls).toContainEqual(['test-uuid', expect.objectContaining({ step4Output: expect.any(String) })]);
      expect(updateCalls).toContainEqual(['test-uuid', expect.objectContaining({
        step5Output: expect.any(String),
        processingStatus: 'completed',
      })]);
    });

    it('builds context with all available data', async () => {
      const fullHypothesis: HypothesisData = {
        ...sampleHypothesis,
        step2_1Summary: 'Summary from step 2-1',
        step2_2Output: 'Output from step 2-2',
      };

      const deps = createMockDeps({
        getHypothesis: vi.fn().mockResolvedValue(fullHypothesis),
      });

      await processSteps3to5(deps, 'test-uuid', 'target spec', 'tech assets');

      const generateCalls = (deps.ai.generateContent as ReturnType<typeof vi.fn>).mock.calls;
      const step3Prompt = generateCalls[0][0].prompt;

      expect(step3Prompt).toContain('Test Hypothesis');
      expect(step3Prompt).toContain('Summary from step 2-1');
      expect(step3Prompt).toContain('Output from step 2-2');
      expect(step3Prompt).toContain('target spec');
      expect(step3Prompt).toContain('tech assets');
    });
  });

  describe('runPipeline', () => {
    it('completes successfully with valid data', async () => {
      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue(sampleRun),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesis: vi.fn().mockResolvedValue(sampleHypothesis),
        },
        {
          executeDeepResearch: vi.fn().mockResolvedValue('Research output'),
          generateContent: vi.fn().mockResolvedValue(`{
            "hypotheses": [
              {"title": "Test", "summary": "Summary"}
            ]
          }`),
        }
      );

      await runPipeline(deps, 1);

      expect(deps.db.updateRunStatus).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: 'completed' })
      );
    });

    it('handles missing run', async () => {
      const deps = createMockDeps({
        getRun: vi.fn().mockResolvedValue(null),
      });

      await runPipeline(deps, 999);

      expect(deps.db.updateRunStatus).toHaveBeenCalledWith(
        999,
        expect.objectContaining({
          status: 'error',
          errorMessage: expect.stringContaining('not found'),
        })
      );
    });

    it('handles missing resources', async () => {
      const deps = createMockDeps({
        getRun: vi.fn().mockResolvedValue(sampleRun),
        getResource: vi.fn().mockResolvedValue(null),
      });

      await runPipeline(deps, 1);

      expect(deps.db.updateRunStatus).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          status: 'error',
          errorMessage: expect.stringContaining('見つかりません'),
        })
      );
    });

    it('handles Deep Research failure in Step 2-1', async () => {
      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue(sampleRun),
          getResource: vi.fn().mockResolvedValue(sampleResource),
        },
        {
          executeDeepResearch: vi.fn().mockRejectedValue(new Error('API timeout')),
        }
      );

      await runPipeline(deps, 1);

      expect(deps.db.updateRunStatus).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          status: 'error',
          errorMessage: expect.stringContaining('API timeout'),
        })
      );
    });

    it('falls back to legacy parsing when AI structuring fails', async () => {
      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue(sampleRun),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesis: vi.fn().mockResolvedValue(sampleHypothesis),
        },
        {
          executeDeepResearch: vi.fn().mockResolvedValue(`
            【仮説1】 テスト仮説
            これはテスト仮説の説明です。
          `),
          generateContent: vi.fn().mockResolvedValue('Invalid JSON response'),
        }
      );

      await runPipeline(deps, 1);

      // Should still complete despite AI structuring failure
      expect(deps.db.createHypothesis).toHaveBeenCalled();
    });

    it('creates fallback hypothesis when all parsing fails', async () => {
      const runWithName: RunData = { ...sampleRun, jobName: 'Fallback Job' };

      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue(runWithName),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesis: vi.fn().mockResolvedValue(sampleHypothesis),
        },
        {
          executeDeepResearch: vi.fn().mockResolvedValue('Plain text with no structure'),
          generateContent: vi.fn().mockResolvedValue('Also invalid'),
        }
      );

      await runPipeline(deps, 1);

      expect(deps.db.createHypothesis).toHaveBeenCalledWith(
        expect.objectContaining({
          displayTitle: 'Fallback Job',
        })
      );
    });

    it('handles errors during hypothesis processing', async () => {
      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue(sampleRun),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesis: vi.fn()
            .mockResolvedValueOnce(sampleHypothesis) // For Step 2-2
            .mockRejectedValueOnce(new Error('DB Error')), // For Steps 3-5
        },
        {
          executeDeepResearch: vi.fn().mockResolvedValue('Output'),
          generateContent: vi.fn().mockResolvedValue(`{
            "hypotheses": [{"title": "Test", "summary": "Summary"}]
          }`),
        }
      );

      await runPipeline(deps, 1);

      // Pipeline should still complete
      expect(deps.db.updateRunStatus).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: 'completed' })
      );
    });

    it('updates progress info throughout execution', async () => {
      const deps = createMockDeps(
        {
          getRun: vi.fn().mockResolvedValue(sampleRun),
          getResource: vi.fn().mockResolvedValue(sampleResource),
          getHypothesis: vi.fn().mockResolvedValue(sampleHypothesis),
        },
        {
          executeDeepResearch: vi.fn().mockResolvedValue('Output'),
          generateContent: vi.fn().mockResolvedValue(`{
            "hypotheses": [{"title": "Test", "summary": "Summary"}]
          }`),
        }
      );

      await runPipeline(deps, 1);

      const progressCalls = (deps.db.updateRunStatus as ReturnType<typeof vi.fn>).mock.calls;

      // Should have progress updates for each phase
      const phases = progressCalls
        .filter((call: any) => call[1].progressInfo)
        .map((call: any) => call[1].progressInfo.phase);

      expect(phases).toContain('step2_1');
      expect(phases).toContain('step2_1_5');
      expect(phases).toContain('step2_2');
      expect(phases).toContain('evaluation');
      expect(phases).toContain('completed');
    });
  });
});
