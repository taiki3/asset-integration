'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Trash2,
  LayoutGrid,
  Table as TableIcon,
  Download,
  Upload,
  FileText,
  Settings,
  Loader2,
  ArrowUp,
  ArrowDown,
  Archive,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { format } from 'date-fns';
import { CsvImportModal } from './csv-import-modal';
import { useColumnSettings, ColumnSettingsDialog } from '../run/column-settings-dialog';
import type { Hypothesis, Resource, Run } from '@/lib/db/schema';

interface HypothesesPanelProps {
  hypotheses: Hypothesis[];
  resources: Resource[];
  runs?: Run[];
  projectId: number;
  onDelete: (hypothesisId: number) => void;
  onDeleteAll?: () => void;
  onDownloadWord: (runId: number, hypothesisIndex: number, displayNumber?: number) => void;
  onDownloadAllReports?: () => void;
  onImport: (
    rows: Record<string, string>[],
    columnMapping: Record<string, string>
  ) => Promise<void>;
  onExportCSV?: () => void;
}

type FullDataRow = Record<string, string | number | null>;
type ViewMode = 'card' | 'table';

function getFullData(hypothesis: Hypothesis): FullDataRow {
  return (hypothesis.fullData as FullDataRow) || {};
}

function getDisplayValue(data: FullDataRow, keys: string[]): string {
  for (const key of keys) {
    if (data[key] != null && data[key] !== '') {
      return String(data[key]);
    }
  }
  return '';
}

function getJudgmentBadgeVariant(
  judgment: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const lower = judgment.toLowerCase();
  if (lower.includes('go') && !lower.includes('no')) return 'default';
  if (lower.includes('no-go') || lower.includes('nogo')) return 'destructive';
  if (lower.includes('△') || lower.includes('保留')) return 'secondary';
  return 'outline';
}

// Format value for display - handles objects, arrays, and primitives
function formatDisplayValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '[複合データ]';
    }
  }
  return String(value);
}

export function HypothesesPanel({
  hypotheses,
  resources,
  runs = [],
  projectId,
  onDelete,
  onDeleteAll,
  onDownloadWord,
  onDownloadAllReports,
  onImport,
  onExportCSV,
}: HypothesesPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [selectedHypothesis, setSelectedHypothesis] = useState<Hypothesis | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<'summary' | 'report'>('summary');
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [hypothesisToDelete, setHypothesisToDelete] = useState<Hypothesis | null>(null);
  const [downloadingReports, setDownloadingReports] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // Extract available columns from hypotheses' fullData
  const availableColumns = useMemo(() => {
    const columnSet = new Set<string>();
    hypotheses.forEach((h) => {
      const data = getFullData(h);
      Object.keys(data).forEach((key) => columnSet.add(key));
    });
    return Array.from(columnSet);
  }, [hypotheses]);

  // Column settings
  const {
    columnOrder,
    visibleColumns,
    displayColumns,
    setColumnOrder,
    setVisibleColumns,
    resetColumnSettings,
  } = useColumnSettings(availableColumns);

  // Handle hypothesis click to open details
  const handleHypothesisClick = (hypothesis: Hypothesis) => {
    setSelectedHypothesis(hypothesis);
    setDetailsTab('summary');
    setDetailsOpen(true);
  };

  // Handle delete
  const handleDeleteClick = (hypothesis: Hypothesis, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleDeleteAll = async () => {
    if (onDeleteAll) {
      setDeletingAll(true);
      try {
        await onDeleteAll();
        setDeleteAllDialogOpen(false);
      } finally {
        setDeletingAll(false);
      }
    }
  };

  const handleDownloadAllReports = async () => {
    if (onDownloadAllReports) {
      setDownloadingReports(true);
      try {
        await onDownloadAllReports();
      } finally {
        setDownloadingReports(false);
      }
    }
  };

  // Get hypothesis index in its run
  const getHypothesisIndexInRun = (hypothesis: Hypothesis): number => {
    if (hypothesis.indexInRun !== null && hypothesis.indexInRun !== undefined) {
      return hypothesis.indexInRun;
    }
    // Fallback: find by runId
    const runHypotheses = hypotheses
      .filter((h) => h.runId === hypothesis.runId)
      .sort((a, b) => a.hypothesisNumber - b.hypothesisNumber);
    return runHypotheses.findIndex((h) => h.id === hypothesis.id);
  };

  // Build report content from hypothesis
  const getReportContent = (hypothesis: Hypothesis): string | null => {
    const parts: string[] = [];
    if (hypothesis.step2_1Summary) {
      parts.push('## サマリー\n\n' + hypothesis.step2_1Summary);
    }
    if (hypothesis.step2_2Output) {
      parts.push('## 詳細調査 (S2-2)\n\n' + hypothesis.step2_2Output);
    }
    if (hypothesis.step3Output) {
      parts.push('## テーマ魅力度評価 (S3)\n\n' + hypothesis.step3Output);
    }
    if (hypothesis.step4Output) {
      parts.push('## AGC参入検討 (S4)\n\n' + hypothesis.step4Output);
    }
    if (hypothesis.step5Output) {
      parts.push('## 統合評価 (S5)\n\n' + hypothesis.step5Output);
    }
    return parts.length > 0 ? parts.join('\n\n---\n\n') : null;
  };

  // Card View
  const CardView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {hypotheses.map((hypothesis) => {
        const data = getFullData(hypothesis);
        const title =
          hypothesis.displayTitle ||
          (displayColumns[0] && data[displayColumns[0]]) ||
          `仮説 ${hypothesis.hypothesisNumber}`;
        const badges = displayColumns
          .slice(1, 4)
          .map((col) => data[col])
          .filter(Boolean);
        const judgment = getDisplayValue(data, [
          '科学×経済判定',
          '判定',
          '評価',
          'Judgment',
        ]);
        const score = getDisplayValue(data, ['総合スコア', 'スコア', 'Score', '点数']);

        return (
          <div
            key={hypothesis.id}
            className="group flex flex-col gap-2 rounded-md border bg-card p-3 hover:shadow-md cursor-pointer transition-shadow"
            onClick={() => handleHypothesisClick(hypothesis)}
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-medium line-clamp-2 flex-1">{formatDisplayValue(title)}</h4>
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => handleDeleteClick(hypothesis, e)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {badges.slice(0, 2).map((badge, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {formatDisplayValue(badge)}
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-1 mt-auto">
              {judgment && (
                <Badge variant={getJudgmentBadgeVariant(judgment)} className="text-xs">
                  {judgment}
                </Badge>
              )}
              {score && (
                <span className="text-xs text-muted-foreground">スコア: {score}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(hypothesis.createdAt), 'yyyy/MM/dd')}
            </p>
          </div>
        );
      })}
    </div>
  );

  // Table View
  const TableView = () => (
    <div className="border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px] whitespace-nowrap">No.</TableHead>
            {displayColumns.map((col) => (
              <TableHead key={col} className="min-w-[150px] whitespace-nowrap">
                {col}
              </TableHead>
            ))}
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hypotheses.map((hypothesis) => {
            const data = getFullData(hypothesis);
            return (
              <TableRow
                key={hypothesis.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleHypothesisClick(hypothesis)}
              >
                <TableCell className="font-mono text-xs whitespace-nowrap">
                  {hypothesis.hypothesisNumber}
                </TableCell>
                {displayColumns.map((col) => (
                  <TableCell key={col} className="text-xs max-w-[300px]">
                    <span className="line-clamp-2">{formatDisplayValue(data[col] ?? '-')}</span>
                  </TableCell>
                ))}
                <TableCell className="whitespace-nowrap">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => handleDeleteClick(hypothesis, e)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
            <CardTitle className="text-lg font-medium flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5" />
                過去に生成した仮説
                <Badge variant="secondary" className="ml-2">
                  {hypotheses.length}件
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setColumnSettingsOpen(true);
                  }}
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </Button>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            {hypotheses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Lightbulb className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  まだ仮説が生成されていません
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ASIPを実行すると、生成された仮説がここに表示されます
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 mt-4"
                  data-testid="button-open-csv-import"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImportModalOpen(true);
                  }}
                >
                  <Upload className="h-4 w-4" />
                  CSVインポート
                </Button>
              </div>
            ) : (
              <>
                {/* Toolbar */}
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant={viewMode === 'card' ? 'default' : 'ghost'}
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewMode('card');
                      }}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant={viewMode === 'table' ? 'default' : 'ghost'}
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewMode('table');
                      }}
                    >
                      <TableIcon className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="button-open-csv-import"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImportModalOpen(true);
                      }}
                      className="gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      CSVインポート
                    </Button>
                    {onExportCSV && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onExportCSV();
                        }}
                        className="gap-2"
                      >
                        <Download className="h-4 w-4" />
                        CSVエクスポート
                      </Button>
                    )}
                    {onDownloadAllReports && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadAllReports();
                        }}
                        className="gap-2"
                        disabled={downloadingReports || hypotheses.length === 0}
                      >
                        {downloadingReports ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Archive className="h-4 w-4" />
                        )}
                        一括Word
                      </Button>
                    )}
                    {onDeleteAll && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteAllDialogOpen(true);
                        }}
                        disabled={hypotheses.length === 0}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="max-h-[400px] overflow-auto">
                  {viewMode === 'card' ? <CardView /> : <TableView />}
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      {/* Hypothesis Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5" />
                仮説詳細
              </DialogTitle>
              {selectedHypothesis && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setHypothesisToDelete(selectedHypothesis);
                    setDeleteDialogOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            </div>
            <DialogDescription>
              {selectedHypothesis?.displayTitle ||
                `仮説 ${selectedHypothesis?.hypothesisNumber}`}
            </DialogDescription>
          </DialogHeader>

          {selectedHypothesis && (
            <Tabs
              value={detailsTab}
              onValueChange={(v) => setDetailsTab(v as 'summary' | 'report')}
              className="w-full flex-1 flex flex-col min-h-0"
            >
              <TabsList className="grid w-full grid-cols-2 shrink-0">
                <TabsTrigger value="summary">概要</TabsTrigger>
                <TabsTrigger value="report">レポート</TabsTrigger>
              </TabsList>
              <TabsContent value="summary" className="flex-1 overflow-auto mt-2">
                <div className="space-y-4 pr-2">
                  {(() => {
                    const data = getFullData(selectedHypothesis);
                    const entries = Object.entries(data).filter(
                      ([, v]) => v != null && v !== ''
                    );
                    return entries.map(([key, value]) => (
                      <div key={key}>
                        <h4 className="text-sm font-medium mb-1">{key}</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                          {formatDisplayValue(value)}
                        </p>
                      </div>
                    ));
                  })()}
                  <div className="text-xs text-muted-foreground pt-2 border-t space-y-1">
                    <div>
                      作成日:{' '}
                      {format(new Date(selectedHypothesis.createdAt), 'yyyy/MM/dd HH:mm')}
                    </div>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="report" className="flex-1 overflow-auto mt-2">
                {(() => {
                  const reportContent = getReportContent(selectedHypothesis);
                  if (reportContent) {
                    return (
                      <div className="prose prose-sm dark:prose-invert max-w-none pr-2 break-words overflow-x-hidden [&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_pre]:overflow-x-hidden [&_table]:block [&_table]:overflow-x-auto [&_table]:text-xs [&_code]:break-all">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {reportContent}
                        </ReactMarkdown>
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <FileText className="h-8 w-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        この仮説にはレポートがありません
                      </p>
                    </div>
                  );
                })()}
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            {selectedHypothesis?.runId && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  const index = getHypothesisIndexInRun(selectedHypothesis);
                  onDownloadWord(
                    selectedHypothesis.runId!,
                    index,
                    selectedHypothesis.hypothesisNumber
                  );
                }}
              >
                <FileText className="h-4 w-4" />
                Word出力
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Column Settings Dialog */}
      <ColumnSettingsDialog
        open={columnSettingsOpen}
        onOpenChange={setColumnSettingsOpen}
        availableColumns={availableColumns}
        columnOrder={columnOrder}
        visibleColumns={visibleColumns}
        onColumnOrderChange={setColumnOrder}
        onVisibilityChange={setVisibleColumns}
        onReset={resetColumnSettings}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>仮説を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この仮説を削除してよろしいですか？
              この操作は取り消せません。将来の生成時に重複チェックから除外されます。
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

      {/* Delete All Confirmation Dialog */}
      <AlertDialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>すべての仮説を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は取り消せません。プロジェクト内の{hypotheses.length}
              件の仮説がすべて削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAll}
              disabled={deletingAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingAll ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  削除中...
                </>
              ) : (
                'すべて削除'
              )}
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
