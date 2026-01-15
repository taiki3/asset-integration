'use client';

import { useState, useEffect } from 'react';
import { History, ChevronRight, Download, Loader2, CheckCircle, XCircle, Clock, FileSpreadsheet, AlertTriangle, FileText, Archive } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { Run, Resource } from '@/lib/db/schema';

interface HistoryPanelProps {
  runs: Run[];
  resources: Resource[];
  onDownloadTSV: (runId: number) => void;
  onDownloadExcel: (runId: number) => void;
  onDownloadStep2Word: (runId: number) => void;
  onDownloadIndividualReport: (runId: number, hypothesisIndex: number) => void;
}

const statusConfig: Record<string, { label: string; icon: typeof Clock; variant: 'pending' | 'running' | 'completed' | 'error' | 'paused' | 'warning'; animate: boolean }> = {
  pending: { label: '待機中', icon: Clock, variant: 'pending', animate: false },
  running: { label: '処理中', icon: Loader2, variant: 'running', animate: true },
  paused: { label: '一時停止', icon: Clock, variant: 'paused', animate: false },
  completed: { label: '完了', icon: CheckCircle, variant: 'completed', animate: false },
  error: { label: 'エラー', icon: XCircle, variant: 'error', animate: false },
  failed: { label: '失敗', icon: XCircle, variant: 'error', animate: false },
  interrupted: { label: '中断', icon: AlertTriangle, variant: 'warning', animate: false },
};

const defaultStatus = { label: '不明', icon: Clock, variant: 'pending' as const, animate: false };

interface IndividualReport {
  hypothesisNumber: number;
  title: string;
  status: string;
  hasContent: boolean;
}

export function HistoryPanel({ runs, resources, onDownloadTSV, onDownloadExcel, onDownloadStep2Word, onDownloadIndividualReport }: HistoryPanelProps) {
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [individualReports, setIndividualReports] = useState<IndividualReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  const handleRunClick = (run: Run) => {
    setSelectedRun(run);
    setDetailsOpen(true);
    setActiveTab('summary');
    setIndividualReports([]);
  };

  // Fetch individual reports when a completed run is selected
  useEffect(() => {
    if (!selectedRun || selectedRun.status !== 'completed') {
      setIndividualReports([]);
      return;
    }

    const fetchReports = async () => {
      setLoadingReports(true);
      try {
        const res = await fetch(`/api/runs/${selectedRun.id}/hypotheses`);
        if (res.ok) {
          const hypotheses = await res.json();
          const reports = hypotheses.map((h: { hypothesisNumber: number; displayTitle?: string; processingStatus?: string; step2_2Output?: string; step3Output?: string; step4Output?: string; step5Output?: string }) => ({
            hypothesisNumber: h.hypothesisNumber,
            title: h.displayTitle || `仮説 ${h.hypothesisNumber}`,
            status: h.processingStatus || 'pending',
            hasContent: !!(h.step2_2Output || h.step3Output || h.step4Output || h.step5Output),
          }));
          setIndividualReports(reports);
        }
      } catch (error) {
        console.error('Failed to fetch reports:', error);
      } finally {
        setLoadingReports(false);
      }
    };

    fetchReports();
  }, [selectedRun]);

  const getResourceName = (resourceId: number | null) => {
    if (!resourceId) return '不明';
    const resource = resources.find(r => r.id === resourceId);
    return resource?.name || '不明';
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return format(d, 'yyyy/MM/dd HH:mm', { locale: ja });
  };

  const getElapsedTime = (run: Run) => {
    if (!run.completedAt) return '処理中';
    const start = new Date(run.createdAt);
    const end = new Date(run.completedAt);
    const elapsedMs = end.getTime() - start.getTime();
    const minutes = Math.floor(elapsedMs / 60000);
    const seconds = Math.floor((elapsedMs % 60000) / 1000);
    return `${minutes}分${seconds}秒`;
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <History className="h-5 w-5 text-agc-gold" />
          実行履歴
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          {runs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground font-light">
              実行履歴がありません
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => {
                const config = statusConfig[run.status] || defaultStatus;
                const StatusIcon = config.icon;

                return (
                  <div
                    key={run.id}
                    className="p-3 rounded-lg border border-border/50 cursor-pointer hover:bg-accent/10 hover:border-agc-gold/30 transition-all"
                    onClick={() => handleRunClick(run)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant={config.variant} className="gap-1">
                          <StatusIcon className={`h-3 w-3 ${config.animate ? 'animate-spin' : ''}`} />
                          {config.label}
                        </Badge>
                        <div>
                          <p className="font-medium">{run.jobName}</p>
                          <p className="text-xs font-light text-muted-foreground">
                            {formatDate(run.createdAt)}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      {/* Run Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col glass-card">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {selectedRun?.jobName || 'ジョブ詳細'}
            </DialogTitle>
            <DialogDescription className="font-light">
              {selectedRun && formatDate(selectedRun.createdAt)}
            </DialogDescription>
          </DialogHeader>

          {selectedRun && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="summary">概要</TabsTrigger>
                <TabsTrigger value="parameters">パラメータ</TabsTrigger>
                <TabsTrigger value="outputs">出力</TabsTrigger>
                <TabsTrigger value="reports" disabled={selectedRun.status !== 'completed'}>
                  個別レポート
                </TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">ステータス</p>
                    <div className="mt-1">
                      {(() => {
                        const config = statusConfig[selectedRun.status] || defaultStatus;
                        const StatusIcon = config.icon;
                        return (
                          <Badge variant={config.variant} className="gap-1">
                            <StatusIcon className={`h-3 w-3 ${config.animate ? 'animate-spin' : ''}`} />
                            {config.label}
                          </Badge>
                        );
                      })()}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium">処理時間</p>
                    <p className="mt-1 text-sm font-light">{getElapsedTime(selectedRun)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">開始時刻</p>
                    <p className="mt-1 text-sm font-light">{formatDate(selectedRun.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">終了時刻</p>
                    <p className="mt-1 text-sm font-light">
                      {selectedRun.completedAt ? formatDate(selectedRun.completedAt) : '未完了'}
                    </p>
                  </div>
                </div>

                <Separator className="bg-border/50" />

                <div>
                  <p className="text-sm font-medium mb-2">ダウンロード</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDownloadTSV(selectedRun.id)}
                      disabled={selectedRun.status !== 'completed'}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      TSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDownloadExcel(selectedRun.id)}
                      disabled={selectedRun.status !== 'completed'}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Excel
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDownloadStep2Word(selectedRun.id)}
                      disabled={selectedRun.status !== 'completed'}
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Step2 Word
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="parameters" className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">市場・顧客ニーズ</p>
                    <p className="mt-1 text-sm font-light">{getResourceName(selectedRun.targetSpecId)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">技術シーズ</p>
                    <p className="mt-1 text-sm font-light">{getResourceName(selectedRun.technicalAssetsId)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">仮説数</p>
                    <p className="mt-1 text-sm font-light">{selectedRun.hypothesisCount || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">ループ数</p>
                    <p className="mt-1 text-sm font-light">{selectedRun.loopCount || 1}</p>
                  </div>
                  {selectedRun.modelChoice && (
                    <div>
                      <p className="text-sm font-medium">モデル</p>
                      <p className="mt-1 text-sm font-light">{selectedRun.modelChoice}</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="outputs" className="space-y-4">
                <ScrollArea className="h-[300px]">
                  {selectedRun.status === 'completed' ? (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium">Step 2-1 出力</p>
                        <pre className="mt-2 p-3 bg-muted/50 rounded-lg text-xs overflow-x-auto font-mono">
                          {selectedRun.step2_1Output || '出力なし'}
                        </pre>
                      </div>
                      {selectedRun.step2_1Output && (
                        <div>
                          <p className="text-sm font-medium">Step 5 出力</p>
                          <pre className="mt-2 p-3 bg-muted/50 rounded-lg text-xs overflow-x-auto font-mono">
                            Step 5 output will be displayed here
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : selectedRun.status === 'running' ? (
                    <div className="text-center py-8 text-muted-foreground font-light">
                      処理中です...
                    </div>
                  ) : selectedRun.status === 'error' ? (
                    <div className="space-y-4">
                      {selectedRun.errorMessage && (
                        <div>
                          <p className="text-sm font-medium text-status-error">エラー</p>
                          <pre className="mt-2 p-3 bg-status-error/10 rounded-lg text-xs overflow-x-auto text-status-error font-mono">
                            {selectedRun.errorMessage}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground font-light">
                      出力がありません
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="reports" className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium">個別レポート一覧</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // Download all as ZIP
                      window.open(`/api/runs/${selectedRun.id}/reports/zip`, '_blank');
                    }}
                    disabled={individualReports.length === 0}
                    data-testid="button-download-all-reports"
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    一括ダウンロード
                  </Button>
                </div>
                <ScrollArea className="h-[300px]">
                  {loadingReports ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : individualReports.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground font-light">
                      個別レポートがありません
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {individualReports.map((report, index) => (
                        <div
                          key={report.hypothesisNumber}
                          className="flex items-center justify-between p-3 rounded-lg border border-border/50"
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium text-sm">
                                仮説 {report.hypothesisNumber}: {report.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                ステータス: {report.status === 'completed' ? '完了' : '処理中'}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onDownloadIndividualReport(selectedRun.id, index)}
                            disabled={!report.hasContent}
                            data-testid={`button-download-report-${report.hypothesisNumber}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
