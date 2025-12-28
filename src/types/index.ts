export type {
  Project,
  NewProject,
  Resource,
  NewResource,
  Run,
  NewRun,
  Hypothesis,
  NewHypothesis,
  PromptVersion,
  StepFileAttachment,
  RunStatus,
  StepStatus,
} from '@/lib/db/schema';

export interface GeminiInteraction {
  step: string;
  interactionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
}

export interface RunProgress {
  currentStep: number;
  currentLoop: number;
  totalLoops: number;
  hypothesisCount: number;
  completedHypotheses: number;
  message: string;
}
