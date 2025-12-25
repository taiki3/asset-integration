import { useState, useEffect } from "react";
import { Search, Brain, FileText, Loader2, Clock, Timer, Pause, Play, Square } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface ProgressInfo {
  planningAnalysis?: string;
  planningQueries?: string[];
  currentPhase?: string;
  currentIteration?: number;
  maxIterations?: number;
  stepTimings?: { [key: string]: number };
  stepStartTime?: number;
}

interface RunProgressDisplayProps {
  currentStep: number;
  currentLoop?: number;
  totalLoops?: number;
  progressInfo?: ProgressInfo;
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

const phaseLabels: { [key: string]: string } = {
  planning: "計画中",
  exploring: "探索中",
  reasoning: "推論中",
  synthesizing: "統合中",
  validating: "検証中",
  completed: "完了",
  deep_research_starting: "Deep Research 起動中",
  deep_research_running: "Deep Research 実行中",
};

const stepLabels: { [key: number]: string } = {
  2: "Step 2: 仮説提案 (Deep Research)",
  3: "Step 3: 科学×経済評価",
  4: "Step 4: 戦略監査",
  5: "Step 5: 統合",
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
    if (status !== "running" && status !== "paused") {
      setElapsedSeconds(0);
      return;
    }
    
    const startTime = progressInfo?.stepStartTime || (runCreatedAt ? new Date(runCreatedAt).getTime() : Date.now());
    
    const updateElapsed = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);
    };
    
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    
    return () => clearInterval(interval);
  }, [status, progressInfo?.stepStartTime, runCreatedAt, currentStep]);
  
  if (status !== "running" && status !== "paused") return null;
  
  const isPaused = status === "paused";

  const phases = ["deep_research_starting", "deep_research_running", "validating", "completed"];
  const phaseProgress = progressInfo?.currentPhase ? 
    (phases.indexOf(progressInfo.currentPhase) + 1) / phases.length * 100 
    : 0;

  return (
    <Card className={`border-primary/20 ${isPaused ? "bg-yellow-500/10" : "bg-primary/5"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-medium flex items-center gap-2 flex-wrap">
            {isPaused ? (
              <Pause className="h-4 w-4 text-yellow-600" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {isPaused ? "一時停止中" : "実行中"}: {stepLabels[currentStep] || `Step ${currentStep}`}
            {totalLoops > 1 && (
              <Badge variant="secondary">
                ループ {currentLoop}/{totalLoops}
              </Badge>
            )}
            {isPauseRequested && !isPaused && (
              <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                一時停止待機中
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm font-mono text-muted-foreground">
              <Timer className="h-4 w-4" />
              <span data-testid="text-elapsed-time">{formatElapsedTime(elapsedSeconds)}</span>
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
        {currentStep === 2 && progressInfo && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">フェーズ:</span>
                <span className="font-medium">
                  {phaseLabels[progressInfo.currentPhase || "planning"] || progressInfo.currentPhase}
                  {progressInfo.currentIteration && progressInfo.maxIterations && 
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
                      {query.length > 30 ? query.slice(0, 30) + "..." : query}
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

            {progressInfo.stepTimings && Object.keys(progressInfo.stepTimings).length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  処理時間
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(progressInfo.stepTimings).map(([phase, time]) => (
                    <div key={phase} className="flex justify-between bg-muted/30 p-1 rounded">
                      <span className="text-muted-foreground">
                        {phase === "planning" ? "計画" :
                         phase === "synthesizing" ? "統合" :
                         phase === "validating" ? "検証" :
                         phase === "deep_research" ? "Deep Research" :
                         phase.startsWith("exploring_") ? `探索${phase.split("_")[1]}` :
                         phase.startsWith("reasoning_") ? `推論${phase.split("_")[1]}` : phase}
                      </span>
                      <span className="font-mono">{formatTime(time)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {currentStep > 2 && (
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span>
              {currentStep === 3 && "科学×経済観点で仮説を評価中..."}
              {currentStep === 4 && "戦略的観点で監査中..."}
              {currentStep === 5 && "最終データを統合中..."}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
