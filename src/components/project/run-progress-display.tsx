'use client';

import { Play, Pause, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { Run } from '@/lib/db/schema';

interface RunProgressDisplayProps {
  run: Run;
  onPause: (runId: number) => void;
  onResume: (runId: number) => void;
  onStop: (runId: number) => void;
}

export function RunProgressDisplay({ run, onPause, onResume, onStop }: RunProgressDisplayProps) {
  const steps = [
    { step: 1, label: 'STEP1: ターゲット仕様・技術アセット' },
    { step: 2, label: 'STEP2-1: 仮説生成' },
    { step: 3, label: 'STEP2-2: Deep Research' },
    { step: 4, label: 'STEP3: リスク評価' },
    { step: 5, label: 'STEP4: アクションプラン' },
    { step: 6, label: 'STEP5: 個別レポート生成' },
  ];

  const currentStepInfo = steps.find(s => s.step === run.currentStep) || steps[0];
  const progress = ((run.currentStep - 1) / (steps.length - 1)) * 100;

  return (
    <Card className="border-frost/30 bg-frost/5 fade-in">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-frost">
              実行中のジョブ: {run.jobName}
            </h3>
            <p className="text-sm font-light text-muted-foreground">
              {currentStepInfo.label}
            </p>
          </div>
          <div className="flex gap-2">
            {run.status === 'running' ? (
              <Button variant="outline" size="sm" onClick={() => onPause(run.id)}>
                <Pause className="h-4 w-4 mr-2" />
                一時停止
              </Button>
            ) : run.status === 'paused' ? (
              <Button variant="outline" size="sm" onClick={() => onResume(run.id)}>
                <Play className="h-4 w-4 mr-2" />
                再開
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStop(run.id)}
              className="hover:border-aurora-red/50 hover:text-aurora-red"
            >
              <Square className="h-4 w-4 mr-2" />
              停止
            </Button>
          </div>
        </div>
        <div className="relative">
          <Progress value={progress} className="mb-2 h-2" />
          <div className="absolute inset-0 h-2 rounded-full overflow-hidden">
            <div
              className="h-full progress-gradient transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        {run.progressInfo ? (
          <div className="text-sm font-light text-muted-foreground mt-2">
            {typeof run.progressInfo === 'string'
              ? run.progressInfo
              : JSON.stringify(run.progressInfo)}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
