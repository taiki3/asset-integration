// Types for Run Progress Display

export interface ParallelItem {
  hypothesisNumber: number;
  hypothesisTitle: string;
  status: 'waiting' | 'running' | 'completed' | 'error';
  currentStep?: string;
  startTime?: number;
  endTime?: number;
}

export interface ProgressInfo {
  // Phase information
  currentPhase?: string;
  currentIteration?: number;
  maxIterations?: number;

  // Deep Research specific
  planningAnalysis?: string;
  planningQueries?: string[];

  // Timing information
  stepTimings?: Record<string, number>;
  stepStartTime?: number;

  // Parallel processing
  parallelItems?: ParallelItem[];
}

// Phase labels in Japanese
export const PHASE_LABELS: Record<string, string> = {
  planning: '計画中',
  exploring: '探索中',
  reasoning: '推論中',
  synthesizing: '統合中',
  validating: '検証中',
  completed: '完了',
  deep_research_starting: 'Deep Research 起動中',
  deep_research_running: 'Deep Research 実行中',
  extracting_hypotheses: '仮説抽出中',
  step2_2_parallel: 'S2-2 並列実行中',
  steps3to5_parallel: 'S3-5 並列実行中',
};

// Step labels in Japanese
export const STEP_LABELS: Record<number, string> = {
  21: 'S2-1: テーマ創出と選定',
  22: 'S2-2: テーマの詳細検討',
  3: 'S3: テーマ魅力度評価',
  4: 'S4: AGC参入検討',
  5: 'S5: テーマ一覧表作成',
};

// All available steps for the step indicator
export const PIPELINE_STEPS = [
  { step: 21, label: 'テーマ創出と選定', shortLabel: '2-1' },
  { step: 22, label: 'テーマの詳細検討', shortLabel: '2-2' },
  { step: 3, label: 'テーマ魅力度評価', shortLabel: '3' },
  { step: 4, label: 'AGC参入検討', shortLabel: '4' },
  { step: 5, label: 'テーマ一覧表作成', shortLabel: '5' },
];

// Phases for progress calculation
export const DEEP_RESEARCH_PHASES = [
  'deep_research_starting',
  'deep_research_running',
  'validating',
  'completed',
];
