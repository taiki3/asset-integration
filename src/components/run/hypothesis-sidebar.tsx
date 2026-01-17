'use client';

import { useState, useMemo } from 'react';
import { Lightbulb, ArrowUpDown, CheckCircle, AlertCircle, Loader2, LayoutGrid, Table as TableIcon, Settings } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { HypothesisCard } from './hypothesis-card';
import { ColumnSettingsDialog, useColumnSettings } from './column-settings-dialog';
import type { Hypothesis } from '@/lib/db/schema';

interface HypothesisSidebarProps {
  hypotheses: Hypothesis[];
  selectedId: string | null;
  onSelect: (hypothesis: Hypothesis) => void;
}

type SortMode = 'number' | 'status';
type FilterMode = 'all' | 'completed' | 'error';
type ViewMode = 'card' | 'table';

// ステータスの優先度（ソート用）
const statusPriority: Record<string, number> = {
  step2_2: 1,
  step3: 1,
  step4: 1,
  step5: 1,
  pending: 2,
  completed: 3,
  error: 4,
};

// Status badge component for table view
function StatusBadge({ status }: { status: string | null }) {
  const statusConfig: Record<string, { label: string; variant: 'pending' | 'running' | 'completed' | 'error' }> = {
    pending: { label: '待機', variant: 'pending' },
    step2_2: { label: '2-2', variant: 'running' },
    step3: { label: 'S3', variant: 'running' },
    step4: { label: 'S4', variant: 'running' },
    step5: { label: 'S5', variant: 'running' },
    completed: { label: '完了', variant: 'completed' },
    error: { label: 'ERR', variant: 'error' },
  };
  const config = statusConfig[status || 'pending'] || statusConfig.pending;
  return <Badge variant={config.variant} className="text-[10px]">{config.label}</Badge>;
}

export function HypothesisSidebar({ hypotheses, selectedId, onSelect }: HypothesisSidebarProps) {
  const [sortMode, setSortMode] = useState<SortMode>('number');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);

  // Extract available columns from hypotheses' fullData
  const availableColumns = useMemo(() => {
    const columnSet = new Set<string>();
    hypotheses.forEach((h) => {
      if (h.fullData && typeof h.fullData === 'object') {
        Object.keys(h.fullData as Record<string, unknown>).forEach((key) => {
          columnSet.add(key);
        });
      }
    });
    return Array.from(columnSet);
  }, [hypotheses]);

  // Column settings hook
  const {
    columnOrder,
    visibleColumns,
    displayColumns,
    isInitialized,
    setColumnOrder,
    setVisibleColumns,
    resetColumnSettings,
  } = useColumnSettings(availableColumns);

  // Helper to get fullData value
  const getFullDataValue = (hypothesis: Hypothesis, column: string): string => {
    if (!hypothesis.fullData || typeof hypothesis.fullData !== 'object') return '-';
    const data = hypothesis.fullData as Record<string, unknown>;
    const value = data[column];
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string') return value;
    return String(value);
  };

  // ステータス集計
  const statusCounts = useMemo(() => {
    const counts = {
      completed: 0,
      error: 0,
      processing: 0,
      pending: 0,
    };
    hypotheses.forEach(h => {
      const status = h.processingStatus || 'pending';
      if (status === 'completed') counts.completed++;
      else if (status === 'error') counts.error++;
      else if (status === 'pending') counts.pending++;
      else counts.processing++;
    });
    return counts;
  }, [hypotheses]);

  // プログレス計算（完了 + エラー = 処理済み）
  const progress = useMemo(() => {
    if (hypotheses.length === 0) return { completed: 0, error: 0, processing: 0 };
    const total = hypotheses.length;
    return {
      completed: (statusCounts.completed / total) * 100,
      error: (statusCounts.error / total) * 100,
      processing: (statusCounts.processing / total) * 100,
    };
  }, [hypotheses.length, statusCounts]);

  // フィルタリング
  const filteredHypotheses = useMemo(() => {
    return hypotheses.filter(h => {
      if (filterMode === 'all') return true;
      if (filterMode === 'completed') return h.processingStatus === 'completed';
      if (filterMode === 'error') return h.processingStatus === 'error';
      return true;
    });
  }, [hypotheses, filterMode]);

  // ソート
  const sortedHypotheses = useMemo(() => {
    const sorted = [...filteredHypotheses];
    if (sortMode === 'number') {
      sorted.sort((a, b) => a.hypothesisNumber - b.hypothesisNumber);
    } else if (sortMode === 'status') {
      sorted.sort((a, b) => {
        const aPriority = statusPriority[a.processingStatus || 'pending'] || 99;
        const bPriority = statusPriority[b.processingStatus || 'pending'] || 99;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.hypothesisNumber - b.hypothesisNumber;
      });
    }
    return sorted;
  }, [filteredHypotheses, sortMode]);

  const toggleSort = () => {
    setSortMode(prev => (prev === 'number' ? 'status' : 'number'));
  };

  return (
    <div className="flex flex-col h-full border-r bg-muted/30">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">仮説一覧</h2>
          <span className="text-xs text-muted-foreground ml-auto">
            {hypotheses.length}件
          </span>
        </div>

        {/* ステータス別サマリー */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            <span className="text-muted-foreground">{statusCounts.completed}</span>
          </div>
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5 text-red-500" />
            <span className="text-muted-foreground">{statusCounts.error}</span>
          </div>
          <div className="flex items-center gap-1">
            <Loader2 className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-muted-foreground">{statusCounts.processing}</span>
          </div>
        </div>

        {/* 色分けプログレスバー */}
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
          {progress.completed > 0 && (
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${progress.completed}%` }}
            />
          )}
          {progress.error > 0 && (
            <div
              className="h-full bg-red-500 transition-all duration-300"
              style={{ width: `${progress.error}%` }}
            />
          )}
          {progress.processing > 0 && (
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress.processing}%` }}
            />
          )}
        </div>

        {/* ソート・フィルター・ビュー切替 */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSort}
            className="h-7 px-2 text-xs gap-1"
          >
            <ArrowUpDown className="h-3 w-3" />
            {sortMode === 'number' ? '番号順' : 'ステータス順'}
          </Button>
          <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
            <SelectTrigger className="h-7 w-[100px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="completed">完了のみ</SelectItem>
              <SelectItem value="error">エラーのみ</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex ml-auto gap-1">
            {viewMode === 'table' && availableColumns.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setColumnSettingsOpen(true)}
                className="h-7 w-7 p-0"
                title="列設定"
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            )}
            <div className="flex border rounded-md overflow-hidden">
              <Button
                variant={viewMode === 'card' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('card')}
                className="h-7 w-7 p-0 rounded-none"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
                className="h-7 w-7 p-0 rounded-none"
              >
                <TableIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Hypothesis List */}
      <ScrollArea className="flex-1">
        {hypotheses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center p-2">
            <Lightbulb className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              仮説がありません
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Step 2-1が完了すると仮説が表示されます
            </p>
          </div>
        ) : sortedHypotheses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center p-2">
            <p className="text-sm text-muted-foreground">
              該当する仮説がありません
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilterMode('all')}
              className="mt-2 text-xs"
            >
              フィルターをクリア
            </Button>
          </div>
        ) : viewMode === 'card' ? (
          <div className="p-2 space-y-2">
            {sortedHypotheses.map((hypothesis) => (
              <HypothesisCard
                key={hypothesis.uuid}
                hypothesis={hypothesis}
                isSelected={selectedId === hypothesis.uuid}
                onClick={() => onSelect(hypothesis)}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px] text-xs sticky left-0 bg-background z-10">#</TableHead>
                  <TableHead className="text-xs min-w-[120px]">タイトル</TableHead>
                  <TableHead className="w-[50px] text-xs">状態</TableHead>
                  {displayColumns.length > 0 && displayColumns.map((col) => (
                    <TableHead key={col} className="text-xs min-w-[100px] max-w-[200px]">
                      {col}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedHypotheses.map((hypothesis) => (
                  <TableRow
                    key={hypothesis.uuid}
                    className={`cursor-pointer hover:bg-muted/50 ${
                      selectedId === hypothesis.uuid ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => onSelect(hypothesis)}
                  >
                    <TableCell className="font-mono text-xs py-2 sticky left-0 bg-background">
                      {hypothesis.hypothesisNumber}
                    </TableCell>
                    <TableCell className="text-xs py-2 max-w-[150px] truncate" title={hypothesis.displayTitle || undefined}>
                      {hypothesis.displayTitle || `仮説 ${hypothesis.hypothesisNumber}`}
                    </TableCell>
                    <TableCell className="py-2">
                      <StatusBadge status={hypothesis.processingStatus} />
                    </TableCell>
                    {displayColumns.length > 0 && displayColumns.map((col) => (
                      <TableCell
                        key={col}
                        className="text-xs py-2 max-w-[200px] truncate"
                        title={getFullDataValue(hypothesis, col)}
                      >
                        {getFullDataValue(hypothesis, col)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ScrollArea>

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
    </div>
  );
}
