'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Play,
  Pause,
  XCircle,
  RefreshCw,
  Loader2,
  Lightbulb,
  Download,
  FileSpreadsheet,
  Archive,
  Upload,
  Bug,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HypothesisSidebar } from './hypothesis-sidebar';
import { HypothesisDetail } from './hypothesis-detail';
import { RunProgressDisplay } from './run-progress-display';
import { CsvImportModal } from './csv-import-modal';
import { DebugPromptsDialog } from './debug-prompts-dialog';
import type { Project, Run, Resource, Hypothesis } from '@/lib/db/schema';
import type { ProgressInfo } from '@/lib/run-progress/types';

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
  'S2-1: テーマ創出と選定',
  'S2-2: テーマの詳細検討',
  'S3: テーマ魅力度評価',
  'S4: AGC参入検討',
  'S5: テーマ一覧表作成',
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

export function RunDetailView({
  project,
  run: initialRun,
  resources,
  hypotheses: initialHypotheses,
}: RunDetailViewProps) {
  const queryClient = useQueryClient();
  const [selectedHypothesisId, setSelectedHypothesisId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [debugPromptsOpen, setDebugPromptsOpen] = useState(false);

  // CSV export handler
  const handleExportCSV = () => {
    if (hypotheses.length === 0) return;

    const headers = [
      'hypothesisNumber',
      'displayTitle',
      'step2_1Summary',
      'step2_2Output',
      'step3Output',
      'step4Output',
      'step5Output',
      'processingStatus',
    ];

    const csvContent = [
      headers.join('\t'),
      ...hypotheses.map((h) =>
        headers
          .map((header) => {
            const value = h[header as keyof typeof h];
            if (value === null || value === undefined) return '';
            const strValue = String(value);
            // Escape tabs and newlines
            return strValue.replace(/\t/g, '  ').replace(/\n/g, '\\n');
          })
          .join('\t')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/tab-separated-values' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${run.jobName || 'run'}-${run.id}-hypotheses.tsv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // CSV import handler
  const handleImportCSV = async (
    rows: Record<string, string>[],
    columnMapping: Record<string, string>
  ) => {
    // Map rows using column mapping
    const mappedData = rows.map((row) => {
      const mapped: Record<string, string> = {};
      Object.entries(columnMapping).forEach(([appCol, csvCol]) => {
        if (row[csvCol] !== undefined) {
          mapped[appCol] = row[csvCol];
        }
      });
      return mapped;
    });

    // Convert to hypothesis format
    const hypothesesData = mappedData.map((row) => ({
      hypothesisNumber: row.hypothesisNumber
        ? parseInt(row.hypothesisNumber)
        : undefined,
      displayTitle: row.displayTitle || undefined,
      step2_1Summary: row.step2_1Summary || row.summary || undefined,
    }));

    // Call API
    const response = await fetch(`/api/projects/${project.id}/hypotheses/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hypotheses: hypothesesData }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Import failed');
    }

    // Refresh hypotheses
    queryClient.invalidateQueries({ queryKey: ['runs', initialRun.id, 'hypotheses'] });
  };

  // Download handlers
  const handleDownloadTSV = async () => {
    try {
      setIsDownloading('tsv');
      const response = await fetch(`/api/runs/${run.id}/download?format=tsv`);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${run.jobName || 'run'}-${run.id}.tsv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('TSV download failed:', error);
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDownloadExcel = async () => {
    try {
      setIsDownloading('excel');
      const response = await fetch(`/api/runs/${run.id}/download?format=excel`);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${run.jobName || 'run'}-${run.id}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Excel download failed:', error);
    } finally {
      setIsDownloading(null);
    }
  };

  const handleDownloadZip = async () => {
    try {
      setIsDownloading('zip');
      const response = await fetch(`/api/runs/${run.id}/reports/zip`);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${run.jobName || 'run'}-${run.id}-reports.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('ZIP download failed:', error);
    } finally {
      setIsDownloading(null);
    }
  };

  // React Query: Run data with conditional polling
  const { data: run = initialRun } = useQuery({
    queryKey: ['runs', initialRun.id],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/runs/${initialRun.id}`);
      if (!res.ok) throw new Error('Failed to fetch run');
      return res.json() as Promise<Run>;
    },
    initialData: initialRun,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'running' || status === 'pending' ? 3000 : false;
    },
  });

  // React Query: Hypotheses data with conditional polling
  const { data: hypotheses = initialHypotheses } = useQuery({
    queryKey: ['runs', initialRun.id, 'hypotheses'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/runs/${initialRun.id}/hypotheses`);
      if (!res.ok) throw new Error('Failed to fetch hypotheses');
      return res.json() as Promise<Hypothesis[]>;
    },
    initialData: initialHypotheses,
    refetchInterval: () => {
      return run?.status === 'running' || run?.status === 'pending' ? 5000 : false;
    },
  });

  // Mutation: Pause run
  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/runs/${run.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused' }),
      });
      if (!res.ok) throw new Error('Failed to pause run');
      return res.json() as Promise<Run>;
    },
    onSuccess: (updatedRun) => {
      queryClient.setQueryData(['runs', initialRun.id], updatedRun);
    },
  });

  // Mutation: Resume run
  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/runs/${run.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'running' }),
      });
      if (!res.ok) throw new Error('Failed to resume run');
      return res.json() as Promise<Run>;
    },
    onSuccess: (updatedRun) => {
      queryClient.setQueryData(['runs', initialRun.id], updatedRun);
    },
  });

  // Mutation: Cancel run
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/runs/${run.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!res.ok) throw new Error('Failed to cancel run');
      return res.json() as Promise<Run>;
    },
    onSuccess: (updatedRun) => {
      queryClient.setQueryData(['runs', initialRun.id], updatedRun);
    },
  });

  const isUpdating =
    pauseMutation.isPending || resumeMutation.isPending || cancelMutation.isPending;

  const status = statusLabels[run.status] || statusLabels.pending;
  const progress = Math.round((run.currentStep / (STEP_LABELS.length - 1)) * 100);

  // Selected hypothesis
  const selectedHypothesis = hypotheses.find((h) => h.uuid === selectedHypothesisId);

  // Calculate hypothesis progress
  const completedHypotheses = hypotheses.filter(
    (h) => h.processingStatus === 'completed'
  ).length;

  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-background">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${project.id}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold">{run.jobName}</h1>
            <p className="text-sm text-muted-foreground">{project.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${status.className}`}
          >
            {status.label}
          </span>
          {run.status === 'running' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => pauseMutation.mutate()}
              disabled={isUpdating}
            >
              {pauseMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Pause className="h-4 w-4 mr-1" />
              )}
              一時停止
            </Button>
          )}
          {run.status === 'paused' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => resumeMutation.mutate()}
              disabled={isUpdating}
            >
              {resumeMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              再開
            </Button>
          )}
          {(run.status === 'pending' ||
            run.status === 'running' ||
            run.status === 'paused') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancelMutation.mutate()}
              disabled={isUpdating}
              className="text-destructive hover:text-destructive"
            >
              {cancelMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-1" />
              )}
              キャンセル
            </Button>
          )}
          {/* CSV Import/Export */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCsvImportOpen(true)}
          >
            <Upload className="h-4 w-4 mr-1" />
            インポート
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={hypotheses.length === 0}
          >
            <Download className="h-4 w-4 mr-1" />
            エクスポート
          </Button>
          {/* Debug Prompts */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDebugPromptsOpen(true)}
            disabled={!run.debugPrompts}
          >
            <Bug className="h-4 w-4 mr-1" />
            プロンプト確認
          </Button>
          {/* Export Dropdown Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={run.status !== 'completed' || isDownloading !== null}
              >
                {isDownloading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
                出力
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDownloadTSV} disabled={isDownloading !== null}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                TSV形式
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadExcel} disabled={isDownloading !== null}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel形式 (CSV)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDownloadZip} disabled={isDownloading !== null}>
                <Archive className="h-4 w-4 mr-2" />
                レポートZIP
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center justify-between text-sm mb-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {STEP_LABELS[run.currentStep] || `ステップ ${run.currentStep}`}
            </span>
            {hypotheses.length > 0 && (
              <span className="text-muted-foreground">
                ({completedHypotheses}/{hypotheses.length} 仮説完了)
              </span>
            )}
          </div>
          <span className="text-muted-foreground">{progress}%</span>
        </div>

        {/* Step Progress Indicators */}
        <div className="flex gap-1">
          {STEP_LABELS.slice(0, -1).map((label, index) => {
            const isCompleted = run.currentStep > index;
            const isCurrent = run.currentStep === index;
            return (
              <div
                key={index}
                className="flex-1 h-2 rounded-full overflow-hidden bg-muted"
                title={label}
              >
                <div
                  className={`h-full transition-all duration-300 ${
                    isCompleted
                      ? 'bg-primary'
                      : isCurrent
                        ? 'bg-primary/50'
                        : 'bg-transparent'
                  }`}
                  style={{
                    width: isCompleted ? '100%' : isCurrent ? '50%' : '0%',
                  }}
                />
              </div>
            );
          })}
        </div>

        {run.status === 'running' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
            <RefreshCw className="h-3 w-3 animate-spin" />
            処理中...
          </div>
        )}
      </div>

      {/* Run Progress Display */}
      {(run.status === 'running' || run.status === 'paused') && (
        <div className="px-4 py-2">
          <RunProgressDisplay
            currentStep={run.currentStep}
            currentLoop={run.currentLoop}
            totalLoops={run.loopCount}
            progressInfo={run.progressInfo as ProgressInfo | null}
            status={run.status}
            runCreatedAt={run.createdAt ? new Date(run.createdAt).toISOString() : undefined}
            runId={run.id}
            onPause={(id) => pauseMutation.mutate()}
            onResume={(id) => resumeMutation.mutate()}
            onStop={(id) => cancelMutation.mutate()}
            isPauseRequested={pauseMutation.isPending}
          />
        </div>
      )}

      {/* Main Content: 2-Column Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Sidebar: Hypothesis List */}
        <div className="w-full lg:w-[300px] lg:flex-shrink-0 h-[300px] lg:h-auto overflow-auto">
          <HypothesisSidebar
            hypotheses={hypotheses}
            selectedId={selectedHypothesisId}
            onSelect={(hypothesis) => setSelectedHypothesisId(hypothesis.uuid)}
          />
        </div>

        {/* Right: Detail Area */}
        <div className="flex-1 overflow-hidden bg-background">
          {selectedHypothesis ? (
            <HypothesisDetail hypothesis={selectedHypothesis} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Lightbulb className="h-16 w-16 text-muted-foreground/20 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">
                仮説を選択してください
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                左側のリストから仮説を選択すると、詳細調査、技術評価、競合分析、統合評価の結果を確認できます。
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Configuration Panel (Collapsed by default) */}
      <details className="border-t">
        <summary className="p-3 cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          設定情報を表示
        </summary>
        <div className="p-4 border-t bg-muted/20">
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Target Spec</dt>
              <dd className="font-medium truncate">
                {resources.targetSpec?.name || '未選択'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Technical Assets</dt>
              <dd className="font-medium truncate">
                {resources.technicalAssets?.name || '未選択'}
              </dd>
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
              <dd className="font-medium">
                {run.modelChoice === 'pro' ? 'Gemini Pro' : 'Gemini Flash'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">現在のループ</dt>
              <dd className="font-medium">
                {run.currentLoop} / {run.loopCount}
              </dd>
            </div>
          </dl>

          {/* Error Message */}
          {run.errorMessage && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive font-medium">エラー</p>
              <pre className="text-xs text-destructive mt-1 whitespace-pre-wrap">
                {run.errorMessage}
              </pre>
            </div>
          )}
        </div>
      </details>

      {/* CSV Import Modal */}
      <CsvImportModal
        open={csvImportOpen}
        onClose={() => setCsvImportOpen(false)}
        onImport={handleImportCSV}
        existingColumns={[
          'hypothesisNumber',
          'displayTitle',
          'step2_1Summary',
          'summary',
        ]}
      />

      {/* Debug Prompts Dialog */}
      <DebugPromptsDialog
        open={debugPromptsOpen}
        onOpenChange={setDebugPromptsOpen}
        runId={run.id}
        debugPrompts={run.debugPrompts}
      />
    </div>
  );
}
