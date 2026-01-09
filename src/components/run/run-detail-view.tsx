'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, Pause, XCircle, RefreshCw, CheckCircle, Clock, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Project, Run, Resource, Hypothesis } from '@/lib/db/schema';

interface RunDetailViewProps {
  project: Project;
  run: Run;
  resources: {
    targetSpec: Resource | null;
    technicalAssets: Resource | null;
  };
  hypotheses: Hypothesis[];
}

const STEP_LABELS = [
  '初期化',
  'Step 2-1: 仮説生成',
  'Step 2-2: 詳細調査',
  'Step 3: 技術評価',
  'Step 4: 競合分析',
  'Step 5: 統合評価',
  '完了',
];

const statusLabels: Record<string, { label: string; className: string }> = {
  pending: { label: '待機中', className: 'bg-gray-100 text-gray-700' },
  running: { label: '実行中', className: 'bg-blue-100 text-blue-700' },
  paused: { label: '一時停止', className: 'bg-yellow-100 text-yellow-700' },
  completed: { label: '完了', className: 'bg-green-100 text-green-700' },
  error: { label: 'エラー', className: 'bg-red-100 text-red-700' },
  cancelled: { label: 'キャンセル', className: 'bg-gray-100 text-gray-700' },
};

const hypothesisStatusLabels: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  pending: { label: '待機中', icon: Clock, className: 'text-gray-500' },
  step2_2: { label: 'Step 2-2', icon: RefreshCw, className: 'text-blue-500' },
  step3: { label: 'Step 3', icon: RefreshCw, className: 'text-blue-500' },
  step4: { label: 'Step 4', icon: RefreshCw, className: 'text-blue-500' },
  step5: { label: 'Step 5', icon: RefreshCw, className: 'text-blue-500' },
  completed: { label: '完了', icon: CheckCircle, className: 'text-green-500' },
  error: { label: 'エラー', icon: AlertCircle, className: 'text-red-500' },
};

export function RunDetailView({ project, run: initialRun, resources, hypotheses: initialHypotheses }: RunDetailViewProps) {
  const [run, setRun] = useState(initialRun);
  const [hypotheses, setHypotheses] = useState(initialHypotheses);
  const [isUpdating, setIsUpdating] = useState(false);
  const [expandedHypothesis, setExpandedHypothesis] = useState<string | null>(null);

  // Poll for updates while running
  useEffect(() => {
    if (run.status !== 'running' && run.status !== 'pending') return;

    const interval = setInterval(async () => {
      try {
        // Fetch run status
        const runResponse = await fetch(`/api/projects/${project.id}/runs/${run.id}`);
        if (runResponse.ok) {
          const updatedRun = await runResponse.json();
          setRun(updatedRun);
        }

        // Fetch hypotheses
        const hypResponse = await fetch(`/api/projects/${project.id}/runs/${run.id}/hypotheses`);
        if (hypResponse.ok) {
          const updatedHypotheses = await hypResponse.json();
          setHypotheses(updatedHypotheses);
        }
      } catch (error) {
        console.error('Failed to poll status:', error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [project.id, run.id, run.status]);

  const updateStatus = async (newStatus: string) => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/runs/${run.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (response.ok) {
        const updatedRun = await response.json();
        setRun(updatedRun);
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const status = statusLabels[run.status] || statusLabels.pending;
  const progress = Math.round((run.currentStep / (STEP_LABELS.length - 1)) * 100);

  // Calculate hypothesis progress
  const completedHypotheses = hypotheses.filter(h => h.processingStatus === 'completed').length;
  const errorHypotheses = hypotheses.filter(h => h.processingStatus === 'error').length;
  const hypothesisProgress = hypotheses.length > 0
    ? Math.round((completedHypotheses / hypotheses.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${project.id}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">{run.jobName}</h1>
            <p className="text-sm text-muted-foreground">{project.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${status.className}`}>
            {status.label}
          </span>
          {run.status === 'running' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateStatus('paused')}
              disabled={isUpdating}
            >
              <Pause className="h-4 w-4 mr-1" />
              一時停止
            </Button>
          )}
          {run.status === 'paused' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateStatus('running')}
              disabled={isUpdating}
            >
              <Play className="h-4 w-4 mr-1" />
              再開
            </Button>
          )}
          {(run.status === 'pending' || run.status === 'running' || run.status === 'paused') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateStatus('cancelled')}
              disabled={isUpdating}
              className="text-destructive"
            >
              <XCircle className="h-4 w-4 mr-1" />
              キャンセル
            </Button>
          )}
        </div>
      </div>

      {/* Overall Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">全体進捗</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span>パイプライン: ステップ {run.currentStep} / {STEP_LABELS.length - 1}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {STEP_LABELS[run.currentStep] || '処理中...'}
          </p>
          {run.status === 'running' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              処理中...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hypothesis Progress */}
      {hypotheses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              仮説処理状況 ({completedHypotheses}/{hypotheses.length} 完了)
              {errorHypotheses > 0 && (
                <span className="text-red-500 ml-2">({errorHypotheses} エラー)</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-500"
                style={{ width: `${hypothesisProgress}%` }}
              />
            </div>

            <div className="space-y-2">
              {hypotheses.map((hypothesis) => {
                const hypStatus = hypothesisStatusLabels[hypothesis.processingStatus || 'pending'];
                const StatusIcon = hypStatus.icon;
                const isExpanded = expandedHypothesis === hypothesis.uuid;

                return (
                  <div key={hypothesis.uuid} className="border rounded-lg">
                    <button
                      className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                      onClick={() => setExpandedHypothesis(isExpanded ? null : hypothesis.uuid)}
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <span className="font-medium">
                          仮説 {hypothesis.hypothesisNumber}: {hypothesis.displayTitle}
                        </span>
                      </div>
                      <div className={`flex items-center gap-1 ${hypStatus.className}`}>
                        <StatusIcon className={`h-4 w-4 ${hypothesis.processingStatus?.startsWith('step') ? 'animate-spin' : ''}`} />
                        <span className="text-xs">{hypStatus.label}</span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-4 pt-0 border-t space-y-3">
                        <div className="text-xs text-muted-foreground font-mono">
                          UUID: {hypothesis.uuid}
                        </div>

                        {hypothesis.step2_1Summary && (
                          <div>
                            <h5 className="text-xs font-medium text-muted-foreground mb-1">Step 2-1 サマリー</h5>
                            <p className="text-sm bg-muted p-2 rounded line-clamp-3">
                              {hypothesis.step2_1Summary}
                            </p>
                          </div>
                        )}

                        {hypothesis.step2_2Output && (
                          <div>
                            <h5 className="text-xs font-medium text-muted-foreground mb-1">Step 2-2 詳細調査</h5>
                            <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32 whitespace-pre-wrap">
                              {hypothesis.step2_2Output.slice(0, 500)}...
                            </pre>
                          </div>
                        )}

                        {hypothesis.step3Output && (
                          <div>
                            <h5 className="text-xs font-medium text-muted-foreground mb-1">Step 3 技術評価</h5>
                            <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32 whitespace-pre-wrap">
                              {hypothesis.step3Output.slice(0, 500)}...
                            </pre>
                          </div>
                        )}

                        {hypothesis.step4Output && (
                          <div>
                            <h5 className="text-xs font-medium text-muted-foreground mb-1">Step 4 競合分析</h5>
                            <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32 whitespace-pre-wrap">
                              {hypothesis.step4Output.slice(0, 500)}...
                            </pre>
                          </div>
                        )}

                        {hypothesis.step5Output && (
                          <div>
                            <h5 className="text-xs font-medium text-muted-foreground mb-1">Step 5 統合評価</h5>
                            <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32 whitespace-pre-wrap">
                              {hypothesis.step5Output.slice(0, 500)}...
                            </pre>
                          </div>
                        )}

                        {hypothesis.errorMessage && (
                          <div className="text-xs text-red-500">
                            エラー: {hypothesis.errorMessage}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">設定</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Target Spec</dt>
              <dd className="font-medium">{resources.targetSpec?.name || '未選択'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Technical Assets</dt>
              <dd className="font-medium">{resources.technicalAssets?.name || '未選択'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">仮説数</dt>
              <dd className="font-medium">{run.hypothesisCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ループ回数</dt>
              <dd className="font-medium">{run.loopCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">モデル</dt>
              <dd className="font-medium">{run.modelChoice === 'pro' ? 'Gemini Pro' : 'Gemini Flash'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">現在のループ</dt>
              <dd className="font-medium">{run.currentLoop} / {run.loopCount}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Step 2-1 Output */}
      {run.step2_1Output && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 2-1 出力 (仮説生成)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap bg-muted p-4 rounded-lg overflow-auto max-h-96">
              {run.step2_1Output}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Error Message */}
      {run.errorMessage && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-base text-destructive">エラー</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap text-destructive">
              {run.errorMessage}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
