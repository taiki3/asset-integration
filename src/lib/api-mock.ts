// Mock API responses for development without database
import { mockRuns, mockProjects, mockResources, mockHypotheses } from '@/lib/db/mock';

export async function createMockRun(
  projectId: string,
  targetSpecs: string[],
  technicalAssets: string[],
  jobName?: string
) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  const runId = mockRuns.length + 1;
  const newRun = {
    id: runId,
    projectId: parseInt(projectId, 10),
    targetSpecId: targetSpecs.length > 0 ? parseInt(targetSpecs[0], 10) : 1,
    technicalAssetsId: technicalAssets.length > 0 ? parseInt(technicalAssets[0], 10) : 2,
    jobName: jobName || `job-${Date.now()}`,
    hypothesisCount: 5,
    loopCount: 1,
    loopIndex: 0,
    modelChoice: 'pro' as const,
    status: 'running' as const,
    currentStep: 0,
    currentLoop: 1,
    geminiInteractions: [],
    completedAt: null,
    createdAt: new Date(),
    errorMessage: null,
    // Step outputs
    step1Output: null,
    step2Output: null,
    step3Output: null,
    step4Output: null,
    step5Output: null,
    // New detailed step outputs
    step2_1Output: null,
    step2_2IndividualOutputs: null,
    step2_2IndividualTitles: null,
    step3IndividualOutputs: null,
    step4IndividualOutputs: null,
    step5IndividualOutputs: null,
    integratedList: null,
    progressInfo: null,
    executionTiming: null,
    debugPrompts: null,
  };

  // Add to mock data with proper type casting
  mockRuns.push(newRun as any);

  // Simulate pipeline execution
  setTimeout(() => {
    const run = mockRuns.find(r => r.id === newRun.id);
    if (run) {
      run.status = 'completed';
      run.completedAt = new Date();
      run.step1Output = '市場分析が完了しました。主要なニーズを特定しました。';
      run.step2Output = 'ターゲット顧客セグメントを特定しました。';
      run.step3Output = '技術評価が完了しました。実現可能性を確認しました。';
      run.step4Output = 'ギャップ分析により改善点を特定しました。';
      run.step5Output = '5つの革新的な仮説を生成しました。';
      run.currentStep = 5;
      // Add detailed step outputs
      run.step2_1Output = '市場分析詳細';
      run.step2_2IndividualOutputs = ['深掘り調査1', '深掘り調査2'];
      run.step2_2IndividualTitles = ['テーマ1', 'テーマ2'];
      run.step3IndividualOutputs = ['技術評価1', '技術評価2'];
      run.step4IndividualOutputs = ['ギャップ分析1', 'ギャップ分析2'];
      run.step5IndividualOutputs = ['仮説1', '仮説2', '仮説3', '仮説4', '仮説5'];

      // Create mock hypotheses
      for (let i = 1; i <= 5; i++) {
        mockHypotheses.push({
          id: `550e8400-e29b-41d4-a716-44665544000${i}`,
          runId: run.id,
          content: `仮説${i}: AIを活用した${['自動化', '最適化', '予測', '分析', '統合'][i-1]}システムにより、${['生産性', '効率', '精度', '速度', '品質'][i-1]}を${20 + i * 10}%向上させることができる`,
          evaluation: `実現可能性: ${['高', '中', '高', '中', '高'][i-1]}、インパクト: ${['大', '中', '大', '大', '中'][i-1]}、リスク: ${['低', '中', '低', '中', '中'][i-1]}`,
          createdAt: new Date(),
        });
      }
    }
  }, 5000); // Simulate 5 second execution time

  return newRun;
}

export function getMockRuns(projectId: string) {
  const pid = parseInt(projectId, 10);
  return mockRuns.filter(r => r.projectId === pid);
}

export function getMockHypotheses(runId: string) {
  const rid = parseInt(runId, 10);
  return mockHypotheses.filter(h => h.runId === rid);
}