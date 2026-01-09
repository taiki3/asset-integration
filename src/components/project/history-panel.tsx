'use client';

import { useState } from 'react';
import { History, ChevronRight, Download, Loader2, CheckCircle, XCircle, Clock, FileSpreadsheet, AlertTriangle } from 'lucide-react';
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

const statusConfig: Record<string, { label: string; icon: typeof Clock; variant: 'default' | 'secondary' | 'destructive'; animate: boolean }> = {
  pending: { label: '待機中', icon: Clock, variant: 'secondary', animate: false },
  running: { label: '処理中', icon: Loader2, variant: 'default', animate: true },
  paused: { label: '一時停止', icon: Clock, variant: 'secondary', animate: false },
  completed: { label: '完了', icon: CheckCircle, variant: 'default', animate: false },
  error: { label: 'エラー', icon: XCircle, variant: 'destructive', animate: false },
  failed: { label: '失敗', icon: XCircle, variant: 'destructive', animate: false },
  interrupted: { label: '中断', icon: AlertTriangle, variant: 'secondary', animate: false },
};

const defaultStatus = { label: '不明', icon: Clock, variant: 'secondary' as const, animate: false };

export function HistoryPanel({ runs, resources, onDownloadTSV, onDownloadExcel, onDownloadStep2Word, onDownloadIndividualReport }: HistoryPanelProps) {
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');

  const handleRunClick = (run: Run) => {
    setSelectedRun(run);
    setDetailsOpen(true);
    setActiveTab('summary');
  };

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
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          実行履歴
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          {runs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
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
                    className="p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors"
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
                          <p className="text-xs text-muted-foreground">
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
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedRun?.jobName || 'ジョブ詳細'}</DialogTitle>
            <DialogDescription>
              {selectedRun && formatDate(selectedRun.createdAt)}
            </DialogDescription>
          </DialogHeader>
          
          {selectedRun && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden">
              <TabsList>
                <TabsTrigger value="summary">概要</TabsTrigger>
                <TabsTrigger value="parameters">パラメータ</TabsTrigger>
                <TabsTrigger value="outputs">出力</TabsTrigger>
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
                    <p className="mt-1 text-sm">{getElapsedTime(selectedRun)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">開始時刻</p>
                    <p className="mt-1 text-sm">{formatDate(selectedRun.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">終了時刻</p>
                    <p className="mt-1 text-sm">
                      {selectedRun.completedAt ? formatDate(selectedRun.completedAt) : '未完了'}
                    </p>
                  </div>
                </div>

                <Separator />

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
                    <p className="mt-1 text-sm">{getResourceName(selectedRun.targetSpecId)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">技術シーズ</p>
                    <p className="mt-1 text-sm">{getResourceName(selectedRun.technicalAssetsId)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">仮説数</p>
                    <p className="mt-1 text-sm">{selectedRun.hypothesisCount || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">ループ数</p>
                    <p className="mt-1 text-sm">{selectedRun.loopCount || 1}</p>
                  </div>
                  {selectedRun.modelChoice && (
                    <div>
                      <p className="text-sm font-medium">モデル</p>
                      <p className="mt-1 text-sm">{selectedRun.modelChoice}</p>
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
                        <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto">
                          {selectedRun.step2_1Output || '出力なし'}
                        </pre>
                      </div>
                      {selectedRun.step2_1Output && (
                        <div>
                          <p className="text-sm font-medium">Step 5 出力</p>
                          <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto">
                            {/* TODO: Add step5Output field to schema */}
                            Step 5 output will be displayed here
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : selectedRun.status === 'running' ? (
                    <div className="text-center py-8 text-muted-foreground">
                      処理中です...
                    </div>
                  ) : selectedRun.status === 'error' ? (
                    <div className="space-y-4">
                      {selectedRun.errorMessage && (
                        <div>
                          <p className="text-sm font-medium text-destructive">エラー</p>
                          <pre className="mt-2 p-3 bg-destructive/10 rounded text-xs overflow-x-auto text-destructive">
                            {selectedRun.errorMessage}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      出力がありません
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