'use client';

import { useState, useEffect } from 'react';
import {
  Search,
  Brain,
  FileText,
  Loader2,
  Clock,
  Timer,
  Pause,
  Play,
  Square,
  CheckCircle2,
  AlertCircle,
  Circle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { ProgressInfo, ParallelItem } from '@/lib/run-progress/types';
import { PHASE_LABELS, STEP_LABELS, DEEP_RESEARCH_PHASES } from '@/lib/run-progress/types';

interface RunProgressDisplayProps {
  currentStep: number;
  currentLoop?: number;
  totalLoops?: number;
  progressInfo?: ProgressInfo | null;
  status: string;
  runCreatedAt?: string;
  runId?: number;
  onPause?: (runId: number) => void;
  onResume?: (runId: number) => void;
  onStop?: (runId: number) => void;
  isPauseRequested?: boolean;
}

const formatTime = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}秒`;
  return `${(ms / 60000).toFixed(1)}分`;
};

const formatElapsedTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}分${secs}秒`;
  }
  return `${secs}秒`;
};

export function RunProgressDisplay({
  currentStep,
  currentLoop = 1,
  totalLoops = 1,
  progressInfo,
  status,
  runCreatedAt,
  runId,
  onPause,
  onResume,
  onStop,
  isPauseRequested,
}: RunProgressDisplayProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (status !== 'running' && status !== 'paused') {
      setElapsedSeconds(0);
      return;
    }

    const startTime =
      progressInfo?.stepStartTime ||
      (runCreatedAt ? new Date(runCreatedAt).getTime() : Date.now());

    const updateElapsed = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [status, progressInfo?.stepStartTime, runCreatedAt, currentStep]);

  if (status !== 'running' && status !== 'paused') return null;

  const isPaused = status === 'paused';

  // Calculate phase progress
  const phaseProgress = progressInfo?.currentPhase
    ? ((DEEP_RESEARCH_PHASES.indexOf(progressInfo.currentPhase) + 1) /
        DEEP_RESEARCH_PHASES.length) *
      100
    : 0;

  // Get current step label
  const stepLabel = STEP_LABELS[currentStep] || `Step ${currentStep}`;

  return (
    <Card
      className={`border-primary/20 ${isPaused ? 'bg-yellow-500/10' : 'bg-primary/5'}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-medium flex items-center gap-2 flex-wrap">
            {isPaused ? (
              <Pause className="h-4 w-4 text-yellow-600" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {isPaused ? '一時停止中' : '実行中'}: {stepLabel}
            {totalLoops > 1 && (
              <Badge variant="secondary">
                ループ {currentLoop}/{totalLoops}
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
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm font-mono text-muted-foreground">
              <Timer className="h-4 w-4" />
              <span data-testid="text-elapsed-time">
                {formatElapsedTime(elapsedSeconds)}
              </span>
            </div>
            {runId && (
              <div className="flex items-center gap-1">
                {isPaused ? (
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => onResume?.(runId)}
                    title="再開"
                    data-testid="button-resume"
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => onPause?.(runId)}
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
                  onClick={() => onStop?.(runId)}
                  title="停止（再開不可）"
                  data-testid="button-stop"
                  className="text-destructive hover:text-destructive"
                >
                  <Square className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step 2-1: Deep Research progress details */}
        {currentStep === 21 && progressInfo && (
          <>
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

            {progressInfo.planningQueries &&
              progressInfo.planningQueries.length > 0 && (
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
                    {Object.entries(progressInfo.stepTimings).map(
                      ([phase, time]) => (
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
                      )
                    )}
                  </div>
                </div>
              )}
          </>
        )}

        {/* Steps 3-5: Simple status display */}
        {currentStep > 21 && currentStep < 6 && (
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span>
              {currentStep === 22 && 'テーマの詳細検討を実行中...'}
              {currentStep === 3 && 'テーマ魅力度を評価中...'}
              {currentStep === 4 && 'AGC参入可能性を検討中...'}
              {currentStep === 5 && 'テーマ一覧表を作成中...'}
            </span>
          </div>
        )}

        {/* Parallel processing status */}
        {progressInfo?.parallelItems &&
          progressInfo.parallelItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-3 w-3" />
                並列処理状況 (
                {
                  progressInfo.parallelItems.filter(
                    (i) => i.status === 'completed'
                  ).length
                }
                /{progressInfo.parallelItems.length} 完了)
              </div>
              <div className="flex flex-wrap gap-2">
                {progressInfo.parallelItems.map((item, idx) => (
                  <div
                    key={`parallel-${idx}-${item.hypothesisNumber}`}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border ${
                      item.status === 'running'
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300'
                        : item.status === 'completed'
                          ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-300'
                          : item.status === 'error'
                            ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
                            : 'bg-muted/50 border-border text-muted-foreground'
                    }`}
                    data-testid={`parallel-item-${item.hypothesisNumber}`}
                  >
                    {item.status === 'running' && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    {item.status === 'completed' && (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    {item.status === 'error' && (
                      <AlertCircle className="h-3 w-3" />
                    )}
                    {item.status === 'waiting' && (
                      <Circle className="h-3 w-3" />
                    )}
                    <span className="font-medium">H{item.hypothesisNumber}</span>
                    <span className="max-w-[100px] truncate">
                      {item.hypothesisTitle}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
      </CardContent>
    </Card>
  );
}
