'use client';

import { useState, useEffect } from 'react';
import { Settings, ArrowUp, ArrowDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

const COLUMN_ORDER_KEY = 'hypotheses-column-order';
const COLUMN_VISIBILITY_KEY = 'hypotheses-column-visibility';

interface ColumnSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableColumns: string[];
  columnOrder: string[];
  visibleColumns: Set<string>;
  onColumnOrderChange: (order: string[]) => void;
  onVisibilityChange: (visible: Set<string>) => void;
  onReset: () => void;
}

export function ColumnSettingsDialog({
  open,
  onOpenChange,
  availableColumns,
  columnOrder,
  visibleColumns,
  onColumnOrderChange,
  onVisibilityChange,
  onReset,
}: ColumnSettingsDialogProps) {
  const toggleColumn = (column: string) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(column)) {
      newVisible.delete(column);
    } else {
      newVisible.add(column);
    }
    onVisibilityChange(newVisible);
  };

  const moveColumnUp = (column: string) => {
    const index = columnOrder.indexOf(column);
    if (index > 0) {
      const newOrder = [...columnOrder];
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
      onColumnOrderChange(newOrder);
    }
  };

  const moveColumnDown = (column: string) => {
    const index = columnOrder.indexOf(column);
    if (index < columnOrder.length - 1) {
      const newOrder = [...columnOrder];
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      onColumnOrderChange(newOrder);
    }
  };

  const selectAll = () => {
    onVisibilityChange(new Set(columnOrder));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            表示カラム設定
          </DialogTitle>
          <DialogDescription>
            表示するカラムを選択し、順序を変更できます
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          <div className="space-y-1 pr-4">
            <p className="text-xs text-muted-foreground mb-2">
              カラム順序（チェックで表示/非表示、矢印で並び替え）
            </p>
            {columnOrder.map((column, index) => (
              <div
                key={column}
                className={`flex items-center gap-2 p-2 rounded-md ${
                  visibleColumns.has(column) ? 'bg-muted/50' : 'opacity-60'
                }`}
              >
                <Checkbox
                  id={`col-${column}`}
                  checked={visibleColumns.has(column)}
                  onCheckedChange={() => toggleColumn(column)}
                  className="shrink-0"
                />
                <Label
                  htmlFor={`col-${column}`}
                  className={`text-sm flex-1 truncate cursor-pointer ${
                    !visibleColumns.has(column) ? 'text-muted-foreground' : ''
                  }`}
                >
                  {column}
                </Label>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => moveColumnUp(column)}
                    className="h-6 w-6"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={index === columnOrder.length - 1}
                    onClick={() => moveColumnDown(column)}
                    className="h-6 w-6"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              すべて表示
            </Button>
            <Button variant="outline" size="sm" onClick={onReset}>
              リセット
            </Button>
          </div>
          <Button onClick={() => onOpenChange(false)}>閉じる</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Hook for column management with localStorage persistence
export function useColumnSettings(availableColumns: string[]) {
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize from localStorage
  useEffect(() => {
    if (availableColumns.length === 0) return;

    let loadedOrder: string[] = [];
    let loadedVisible: Set<string> = new Set();

    try {
      const savedOrder = localStorage.getItem(COLUMN_ORDER_KEY);
      if (savedOrder) {
        const parsed = JSON.parse(savedOrder) as string[];
        // Keep valid saved columns and add new ones
        const validSaved = parsed.filter((col) => availableColumns.includes(col));
        const newCols = availableColumns.filter((col) => !parsed.includes(col));
        loadedOrder = [...validSaved, ...newCols];
      }
    } catch {
      // Parse error - ignore
    }

    try {
      const savedVisible = localStorage.getItem(COLUMN_VISIBILITY_KEY);
      if (savedVisible) {
        const parsed = JSON.parse(savedVisible) as string[];
        // Only keep columns that still exist
        loadedVisible = new Set(parsed.filter((col) => availableColumns.includes(col)));
      }
    } catch {
      // Parse error - ignore
    }

    // Apply defaults if nothing loaded
    if (loadedOrder.length === 0) {
      loadedOrder = availableColumns;
    }
    if (loadedVisible.size === 0) {
      loadedVisible = new Set(availableColumns);
    }

    setColumnOrder(loadedOrder);
    setVisibleColumns(loadedVisible);
    setIsInitialized(true);
  }, [availableColumns]);

  // Save column order to localStorage
  const saveColumnOrder = (order: string[]) => {
    setColumnOrder(order);
    try {
      localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(order));
    } catch {
      // Ignore storage errors
    }
  };

  // Save visibility to localStorage
  const saveColumnVisibility = (visible: Set<string>) => {
    setVisibleColumns(visible);
    try {
      localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(Array.from(visible)));
    } catch {
      // Ignore storage errors
    }
  };

  // Reset to defaults
  const resetColumnSettings = () => {
    saveColumnOrder(availableColumns);
    saveColumnVisibility(new Set(availableColumns));
  };

  // Get display columns (visible columns in order)
  const displayColumns = columnOrder.filter((col) => visibleColumns.has(col));

  return {
    columnOrder,
    visibleColumns,
    displayColumns,
    isInitialized,
    setColumnOrder: saveColumnOrder,
    setVisibleColumns: saveColumnVisibility,
    resetColumnSettings,
  };
}
