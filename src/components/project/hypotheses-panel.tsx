'use client';

import { useState } from 'react';
import { Lightbulb, ChevronDown, ChevronRight, FileText, Trash2, Download, AlertCircle, CheckCircle2, Clock, Loader2, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CsvImportModal } from './csv-import-modal';
import type { Hypothesis, Resource } from '@/lib/db/schema';

interface HypothesesPanelProps {
  hypotheses: Hypothesis[];
  resources: Resource[];
  projectId: number;
  onDelete: (hypothesisId: number) => void;
  onDownloadWord: (runId: number, hypothesisIndex: number) => void;
  onImport: (rows: Record<string, string>[], columnMapping: Record<string, string>) => Promise<void>;
}

const statusConfig: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  pending: { label: '待機中', icon: Clock, color: 'text-muted-foreground' },
  step2_2: { label: 'S2-2 処理中', icon: Loader2, color: 'text-blue-600' },
  step3: { label: 'S3 処理中', icon: Loader2, color: 'text-blue-600' },
  step4: { label: 'S4 処理中', icon: Loader2, color: 'text-blue-600' },
  step5: { label: 'S5 処理中', icon: Loader2, color: 'text-blue-600' },
  completed: { label: '完了', icon: CheckCircle2, color: 'text-green-600' },
  error: { label: 'エラー', icon: AlertCircle, color: 'text-red-600' },
};

export function HypothesesPanel({ hypotheses, resources, projectId, onDelete, onDownloadWord, onImport }: HypothesesPanelProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [hypothesisToDelete, setHypothesisToDelete] = useState<Hypothesis | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Group hypotheses by runId
  const hypothesesByRun = hypotheses.reduce((acc, hypothesis) => {
    const runId = hypothesis.runId || 0;
    if (!acc[runId]) {
      acc[runId] = [];
    }
    acc[runId].push(hypothesis);
    return acc;
  }, {} as Record<number, Hypothesis[]>);

  const getResourceName = (resourceId: number | null) => {
    if (!resourceId) return '不明';
    const resource = resources.find(r => r.id === resourceId);
    return resource?.name || '不明';
  };

  const toggleGroup = (runId: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  const handleDeleteClick = (hypothesis: Hypothesis) => {
    setHypothesisToDelete(hypothesis);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (hypothesisToDelete) {
      onDelete(hypothesisToDelete.id);
      setDeleteDialogOpen(false);
      setHypothesisToDelete(null);
    }
  };

  const getStatusInfo = (hypothesis: Hypothesis) => {
    return statusConfig[hypothesis.processingStatus || 'pending'] || statusConfig.pending;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            生成された仮説
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportModalOpen(true)}
            data-testid="button-open-csv-import"
          >
            <Upload className="h-4 w-4 mr-2" />
            インポート
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {hypotheses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              まだ仮説が生成されていません
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(hypothesesByRun).map(([runIdStr, runHypotheses]) => {
                const runId = parseInt(runIdStr);
                const isExpanded = expandedGroups.has(runId);
                const firstHypothesis = runHypotheses[0];
                const runName = firstHypothesis.uuid ? `実行 #${runId}` : 'その他';
                
                return (
                  <div key={runId} className="border rounded-lg">
                    <Collapsible open={isExpanded} onOpenChange={() => toggleGroup(runId)}>
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <span className="font-medium">{runName}</span>
                          <Badge variant="secondary">{runHypotheses.length}件</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {/* TODO: Add targetSpecId and technicalAssetsId to hypothesis schema */}
                        仮説グループ
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="p-3 pt-0 space-y-2">
                          {runHypotheses.map((hypothesis, idx) => {
                            const statusInfo = getStatusInfo(hypothesis);
                            const StatusIcon = statusInfo.icon;
                            
                            return (
                              <div key={hypothesis.id} className="p-3 border rounded-lg">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="font-medium">仮説 {idx + 1}</span>
                                      {hypothesis.uuid && (
                                        <span className="text-xs text-muted-foreground font-mono">
                                          {hypothesis.uuid.slice(0, 8)}
                                        </span>
                                      )}
                                      <div className={`flex items-center gap-1 text-xs ${statusInfo.color}`}>
                                        <StatusIcon className={`h-3 w-3 ${statusInfo.icon === Loader2 ? 'animate-spin' : ''}`} />
                                        {statusInfo.label}
                                      </div>
                                    </div>
                                    {/* hypothesis.title ? (
                                      <p className="text-sm font-medium mb-1">{hypothesis.title}</p>
                                    ) : null */}
                                    {hypothesis.step2_1Summary ? (
                                      <p className="text-sm text-muted-foreground line-clamp-2">
                                        {hypothesis.step2_1Summary}
                                      </p>
                                    ) : (
                                      <p className="text-sm text-muted-foreground">
                                        処理待機中...
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex gap-1 ml-2">
                                    {hypothesis.processingStatus === 'completed' && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => onDownloadWord(runId, idx)}
                                        title="Wordダウンロード"
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    )}
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleDeleteClick(hypothesis)}
                                      title="削除"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>仮説を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この仮説を削除してよろしいですか？この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setHypothesisToDelete(null)}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSV Import Modal */}
      <CsvImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={onImport}
      />
    </Card>
  );
}