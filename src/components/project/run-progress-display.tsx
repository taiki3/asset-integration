'use client';

import {
  Play,
  Pause,
  Square,
  Loader2,
  Timer,
  Brain,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  Circle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { Run } from '@/lib/db/schema';
import {
  useElapsedTime,
  formatElapsedTime,
  formatTime,
  STEP_LABELS,
  PHASE_LABELS,
  PIPELINE_STEPS,
  DEEP_RESEARCH_PHASES,
  type ProgressInfo,
  type ParallelItem,
} from '@/lib/run-progress';

interface RunProgressDisplayProps {
  run: Run;
  onPause: (runId: number) => void;
  onResume: (runId: number) => void;
  onStop: (runId: number) => void;
  isPauseRequested?: boolean;
}

// Step Indicator Component
function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-1 text-xs" data-testid="step-indicator">
      {PIPELINE_STEPS.map((step, idx) => {
        const isCompleted = step.step < currentStep;
        const isCurrent = step.step === currentStep;

        return (
          <div key={step.step} className="flex items-center">
            <div
              className={`
                flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium
                ${isCompleted ? 'bg-status-success text-white' : ''}
                ${isCurrent ? 'bg-agc-gold text-white' : ''}
                ${!isCompleted && !isCurrent ? 'bg-muted text-muted-foreground' : ''}
              `}
              title={step.label}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                step.shortLabel
              )}
            </div>
            {idx < PIPELINE_STEPS.length - 1 && (
              <div
                className={`w-4 h-0.5 mx-0.5 ${
                  isCompleted ? 'bg-status-success' : 'bg-muted'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Control Bar Component
function ControlBar({
  runId,
  status,
  isPauseRequested,
  onPause,
  onResume,
  onStop,
}: {
  runId: number;
  status: string;
  isPauseRequested?: boolean;
  onPause: (runId: number) => void;
  onResume: (runId: number) => void;
  onStop: (runId: number) => void;
}) {
  const isPaused = status === 'paused';

  return (
    <div className="flex items-center gap-1" data-testid="run-control-bar">
      {isPaused ? (
        <Button
          size="icon"
          variant="outline"
          onClick={() => onResume(runId)}
          title="再開"
          data-testid="button-resume"
        >
          <Play className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          size="icon"
          variant="outline"
          onClick={() => onPause(runId)}
          disabled={isPauseRequested}
          title="一時停止（現在のステップ完了後）"
          data-testid="button-pause"
        >
          <Pause className="h-4 w-4" />
        </Button>
      )}
      <Button
        size="icon"
        variant="outline"
        onClick={() => onStop(runId)}
        title="停止（再開不可）"
        data-testid="button-stop"
        className="text-status-error hover:text-status-error hover:border-status-error/50"
      >
        <Square className="h-4 w-4" />
      </Button>
    </div>
  );
}

// Parallel Items Display Component
function ParallelItemsDisplay({ items }: { items: ParallelItem[] }) {
  const completedCount = items.filter((i) => i.status === 'completed').length;

  return (
    <div className="space-y-2" data-testid="parallel-items-display">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-3 w-3" />
        並列処理状況 ({completedCount}/{items.length} 完了)
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item, idx) => (
          <div
            key={`parallel-${idx}-${item.hypothesisNumber}`}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border ${
              item.status === 'running'
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300'
                : item.status === 'completed'
                  ? 'bg-status-success/10 border-status-success/30 text-status-success'
                  : item.status === 'error'
                    ? 'bg-status-error/10 border-status-error/30 text-status-error'
                    : 'bg-muted/50 border-border text-muted-foreground'
            }`}
            data-testid={`parallel-item-${item.hypothesisNumber}`}
          >
            {item.status === 'running' && (
              <Loader2 className="h-3 w-3 animate-spin" />
            )}
            {item.status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
            {item.status === 'error' && <AlertCircle className="h-3 w-3" />}
            {item.status === 'waiting' && <Circle className="h-3 w-3" />}
            <span className="font-medium">H{item.hypothesisNumber}</span>
            <span className="max-w-[100px] truncate">{item.hypothesisTitle}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Phase Progress Display Component
function PhaseProgressDisplay({ progressInfo }: { progressInfo: ProgressInfo }) {
  const phaseProgress = progressInfo.currentPhase
    ? ((DEEP_RESEARCH_PHASES.indexOf(progressInfo.currentPhase) + 1) /
        DEEP_RESEARCH_PHASES.length) *
      100
    : 0;

  return (
    <div className="space-y-4" data-testid="phase-progress">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">フェーズ:</span>
          <span className="font-medium">
            {PHASE_LABELS[progressInfo.currentPhase || 'planning'] ||
              progressInfo.currentPhase}
            {progressInfo.currentIteration &&
              progressInfo.maxIterations &&
              ` (${progressInfo.currentIteration}/${progressInfo.maxIterations})`}
          </span>
        </div>
        <Progress value={phaseProgress} className="h-2" />
      </div>

      {progressInfo.planningAnalysis && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Brain className="h-3 w-3" />
            計画結果
          </div>
          <p className="text-sm bg-muted/50 p-2 rounded-md">
            {progressInfo.planningAnalysis}
          </p>
        </div>
      )}

      {progressInfo.planningQueries && progressInfo.planningQueries.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Search className="h-3 w-3" />
            検索クエリ ({progressInfo.planningQueries.length}件)
          </div>
          <div className="flex flex-wrap gap-1">
            {progressInfo.planningQueries.slice(0, 5).map((query, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {query.length > 30 ? query.slice(0, 30) + '...' : query}
              </Badge>
            ))}
            {progressInfo.planningQueries.length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{progressInfo.planningQueries.length - 5}件
              </Badge>
            )}
          </div>
        </div>
      )}

      {progressInfo.stepTimings &&
        Object.keys(progressInfo.stepTimings).length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-3 w-3" />
              処理時間
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(progressInfo.stepTimings).map(([phase, time]) => (
                <div
                  key={phase}
                  className="flex justify-between bg-muted/30 p-1 rounded"
                >
                  <span className="text-muted-foreground">
                    {phase === 'planning'
                      ? '計画'
                      : phase === 'synthesizing'
                        ? '統合'
                        : phase === 'validating'
                          ? '検証'
                          : phase === 'deep_research'
                            ? 'Deep Research'
                            : phase.startsWith('exploring_')
                              ? `探索${phase.split('_')[1]}`
                              : phase.startsWith('reasoning_')
                                ? `推論${phase.split('_')[1]}`
                                : phase}
                  </span>
                  <span className="font-mono">{formatTime(time)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}

export function RunProgressDisplay({
  run,
  onPause,
  onResume,
  onStop,
  isPauseRequested,
}: RunProgressDisplayProps) {
  const progressInfo = run.progressInfo as ProgressInfo | null;
  const startTime =
    progressInfo?.stepStartTime ||
    (run.createdAt ? new Date(run.createdAt).getTime() : undefined);

  const isActive = run.status === 'running' || run.status === 'paused';
  const elapsedSeconds = useElapsedTime(isActive, startTime);

  // Don't render if not active
  if (!isActive) return null;

  const isPaused = run.status === 'paused';
  const currentStep = run.currentStep;
  const stepLabel = STEP_LABELS[currentStep] || `Step ${currentStep}`;

  return (
    <Card
      className={`border-agc-gold/30 ${isPaused ? 'bg-yellow-500/10' : 'bg-agc-gold/5'} fade-in`}
      data-testid="run-progress-card"
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-medium flex items-center gap-2 flex-wrap">
            {isPaused ? (
              <Pause className="h-4 w-4 text-yellow-600" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-agc-gold" />
            )}
            <span className="font-display font-bold text-agc-gold">
              {isPaused ? '一時停止中' : '実行中'}: {run.jobName}
            </span>
            {run.loopCount && run.loopCount > 1 && (
              <Badge variant="secondary">
                ループ {run.currentLoop}/{run.loopCount}
              </Badge>
            )}
            {isPauseRequested && !isPaused && (
              <Badge
                variant="outline"
                className="text-yellow-600 border-yellow-600"
              >
                一時停止待機中
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-sm font-mono text-muted-foreground">
              <Timer className="h-4 w-4" />
              <span data-testid="text-elapsed-time">
                {formatElapsedTime(elapsedSeconds)}
              </span>
            </div>
            <ControlBar
              runId={run.id}
              status={run.status}
              isPauseRequested={isPauseRequested}
              onPause={onPause}
              onResume={onResume}
              onStop={onStop}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current step info */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-light text-muted-foreground">{stepLabel}</p>
          <StepIndicator currentStep={currentStep} />
        </div>

        {/* Phase progress for Step 2-1 (Deep Research) */}
        {currentStep === 21 && progressInfo && (
          <PhaseProgressDisplay progressInfo={progressInfo} />
        )}

        {/* Step descriptions for steps 3-5 */}
        {currentStep >= 3 && currentStep <= 5 && (
          <div className="text-sm text-muted-foreground">
            {currentStep === 3 && 'テーマの魅力度を多角的に評価中...'}
            {currentStep === 4 && 'AGCの参入可能性を検討中...'}
            {currentStep === 5 && 'テーマ一覧表を作成中...'}
          </div>
        )}

        {/* Parallel items */}
        {progressInfo?.parallelItems && progressInfo.parallelItems.length > 0 && (
          <ParallelItemsDisplay items={progressInfo.parallelItems} />
        )}
      </CardContent>
    </Card>
  );
}
