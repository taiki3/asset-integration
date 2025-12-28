import { useState, useMemo, useEffect, useCallback } from "react";
import { Lightbulb, ChevronDown, ChevronUp, Trash2, LayoutGrid, Table, Download, Upload, FileText, Settings, Loader2, ArrowUp, ArrowDown, Archive } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Table as TableComponent,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import type { Hypothesis as BaseHypothesis, Resource } from "@shared/schema";
import { CsvImportModal } from "@/components/CsvImportModal";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type FullDataRow = Record<string, string | number | null>;

// Extended hypothesis type with resource names from API
type Hypothesis = BaseHypothesis & {
  targetSpecName?: string | null;
  technicalAssetsName?: string | null;
};

interface HypothesesPanelProps {
  hypotheses: Hypothesis[];
  resources: Resource[];
  projectId: number;
  onDelete: (id: number) => void;
  onDownloadWord?: (runId: number, hypothesisIndex: number) => void;
}

type ViewMode = "card" | "table";

function getFullData(hypothesis: Hypothesis): FullDataRow {
  return (hypothesis.fullData as FullDataRow) || {};
}

function getDisplayValue(data: FullDataRow, keys: string[]): string {
  for (const key of keys) {
    if (data[key] != null && data[key] !== "") {
      return String(data[key]);
    }
  }
  return "";
}


export function HypothesesPanel({ hypotheses, resources, projectId, onDelete, onDownloadWord }: HypothesesPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [selectedHypothesis, setSelectedHypothesis] = useState<Hypothesis | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [detailsTab, setDetailsTab] = useState<"summary" | "report">("summary");
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const { toast } = useToast();

  // Get default column order from the newest hypothesis's fullData keys (preserves latest STEP5 TSV order)
  const defaultColumnOrder = useMemo(() => {
    const columnSet = new Set<string>();
    // Find the newest hypothesis (largest hypothesisNumber) to get latest STEP5 column order
    if (hypotheses.length > 0) {
      const newestHypothesis = hypotheses.reduce((newest, current) => 
        current.hypothesisNumber > newest.hypothesisNumber ? current : newest
      , hypotheses[0]);
      const newestData = getFullData(newestHypothesis);
      Object.keys(newestData).forEach((key) => columnSet.add(key));
    }
    // Then add any additional columns from other hypotheses
    hypotheses.forEach((h) => {
      const data = getFullData(h);
      Object.keys(data).forEach((key) => columnSet.add(key));
    });
    return Array.from(columnSet);
  }, [hypotheses]);

  const COLUMN_ORDER_KEY = "hypotheses-column-order";
  const COLUMN_VISIBILITY_KEY = "hypotheses-column-visibility";

  // Load saved column settings from localStorage
  useEffect(() => {
    let loadedOrder: string[] = [];
    let loadedVisible: Set<string> = new Set();
    
    try {
      const savedOrder = localStorage.getItem(COLUMN_ORDER_KEY);
      if (savedOrder) {
        const parsed = JSON.parse(savedOrder) as string[];
        // Keep saved order, add any new columns at the end
        const validSaved = parsed.filter(col => defaultColumnOrder.includes(col));
        const newCols = defaultColumnOrder.filter(col => !parsed.includes(col));
        loadedOrder = [...validSaved, ...newCols];
      }
    } catch {
      // Ignore parse errors
    }
    
    try {
      const savedVisible = localStorage.getItem(COLUMN_VISIBILITY_KEY);
      if (savedVisible) {
        const parsed = JSON.parse(savedVisible) as string[];
        loadedVisible = new Set(parsed.filter(col => defaultColumnOrder.includes(col)));
      }
    } catch {
      // Ignore parse errors
    }
    
    // If no saved order, use default
    if (loadedOrder.length === 0) {
      loadedOrder = defaultColumnOrder;
    }
    
    // If no saved visibility, show all columns
    if (loadedVisible.size === 0) {
      loadedVisible = new Set(defaultColumnOrder);
    }
    
    setColumnOrder(loadedOrder);
    setVisibleColumns(loadedVisible);
  }, [defaultColumnOrder]);

  // Save column order to localStorage
  const saveColumnOrder = (order: string[]) => {
    setColumnOrder(order);
    localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(order));
  };

  // Save column visibility to localStorage
  const saveColumnVisibility = (visible: Set<string>) => {
    setVisibleColumns(visible);
    localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(Array.from(visible)));
  };

  // Toggle column visibility
  const toggleColumn = (column: string) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(column)) {
      newVisible.delete(column);
    } else {
      newVisible.add(column);
    }
    saveColumnVisibility(newVisible);
  };

  // Move column up in order
  const moveColumnUp = (column: string) => {
    const index = columnOrder.indexOf(column);
    if (index > 0) {
      const newOrder = [...columnOrder];
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
      saveColumnOrder(newOrder);
    }
  };

  // Move column down in order
  const moveColumnDown = (column: string) => {
    const index = columnOrder.indexOf(column);
    if (index < columnOrder.length - 1) {
      const newOrder = [...columnOrder];
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      saveColumnOrder(newOrder);
    }
  };

  // Reset to default order from latest TSV
  const resetColumnSettings = () => {
    saveColumnOrder(defaultColumnOrder);
    saveColumnVisibility(new Set(defaultColumnOrder));
  };

  // Display columns: visible columns in the saved order
  const displayColumns = columnOrder.filter(col => visibleColumns.has(col));
  
  // All columns in order (for CSV export)
  const allColumnsInOrder = columnOrder;

  const getResourceName = (resourceId: number | null): string => {
    if (!resourceId) return "-";
    const resource = resources.find((r) => r.id === resourceId);
    return resource?.name || "(削除済み)";
  };

  const handleHypothesisClick = (hypothesis: Hypothesis) => {
    setSelectedHypothesis(hypothesis);
    setDetailsOpen(true);
    setDetailsTab("summary");
    setReportContent(null);
  };

  const fetchReportContent = async (hypothesis: Hypothesis) => {
    if (!hypothesis.runId) return;
    const index = getHypothesisIndexInRun(hypothesis);
    setReportLoading(true);
    try {
      const res = await fetch(`/api/runs/${hypothesis.runId}/individual-reports/${index}/content`);
      if (res.ok) {
        const data = await res.json();
        setReportContent(data.content || "レポートが見つかりませんでした");
      } else {
        setReportContent("レポートの取得に失敗しました");
      }
    } catch {
      setReportContent("レポートの取得に失敗しました");
    } finally {
      setReportLoading(false);
    }
  };

  const handleTabChange = (value: string) => {
    const tab = value as "summary" | "report";
    setDetailsTab(tab);
    if (tab === "report" && selectedHypothesis && !reportContent && !reportLoading) {
      fetchReportContent(selectedHypothesis);
    }
  };

  // Calculate the index of a hypothesis within its run's individual outputs array
  // This is needed because hypothesisNumber is a global project-level number,
  // but step2_2IndividualOutputs is indexed per-run (0-based)
  const getHypothesisIndexInRun = (hypothesis: Hypothesis): number => {
    if (!hypothesis.runId) return 0;
    
    // Get all hypotheses from the same run, sorted by hypothesisNumber
    const sameRunHypotheses = hypotheses
      .filter(h => h.runId === hypothesis.runId)
      .sort((a, b) => a.hypothesisNumber - b.hypothesisNumber);
    
    // Find the index of the current hypothesis in this list
    const index = sameRunHypotheses.findIndex(h => h.id === hypothesis.id);
    return index >= 0 ? index : 0;
  };

  const handleDelete = (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (window.confirm("この仮説をリストから削除しますか？\n（将来の生成時に重複チェックから除外されます）")) {
      onDelete(id);
    }
  };

  const getJudgmentBadgeVariant = (judgment: string | null) => {
    if (!judgment) return "secondary" as const;
    if (judgment.includes("Go") && !judgment.includes("No")) return "default" as const;
    if (judgment.includes("No-Go") || judgment.includes("No Go")) return "destructive" as const;
    return "secondary" as const;
  };

  const handleExportCSV = () => {
    // Use saved column order for CSV export
    const headers = ["仮説番号", ...allColumnsInOrder, "作成日"];

    const rows = hypotheses.map((h) => {
      const data = getFullData(h);
      return [
        h.hypothesisNumber.toString(),
        ...allColumnsInOrder.map((col) => String(data[col] ?? "")),
        format(new Date(h.createdAt), "yyyy/MM/dd HH:mm"),
      ];
    });

    const escapeCSV = (value: string) => {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csvContent = [
      headers.map(escapeCSV).join(","),
      ...rows.map((row) => row.map(escapeCSV).join(",")),
    ].join("\n");

    const bom = "\uFEFF";
    const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hypotheses-${format(new Date(), "yyyyMMdd-HHmmss")}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const [downloadingReports, setDownloadingReports] = useState(false);

  const handleDownloadAllReports = async () => {
    setDownloadingReports(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/hypotheses/download-all-reports`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "ダウンロードに失敗しました");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hypotheses-reports-${format(new Date(), "yyyyMMdd-HHmmss")}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "ダウンロード完了",
        description: "レポートのZIPファイルをダウンロードしました",
      });
    } catch (error) {
      toast({
        title: "ダウンロードエラー",
        description: error instanceof Error ? error.message : "レポートのダウンロードに失敗しました",
        variant: "destructive",
      });
    } finally {
      setDownloadingReports(false);
    }
  };

  const handleImportCSV = useCallback(async (
    rows: Record<string, string>[],
    columnMapping: Record<string, string>
  ) => {
    const response = await apiRequest(
      "POST",
      `/api/projects/${projectId}/hypotheses/import`,
      { rows, columnMapping }
    );
    
    const result = await response.json();
    
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "hypotheses"] });
    
    toast({
      title: "インポート完了",
      description: `${result.imported}件の仮説をインポートしました`,
    });
  }, [projectId, toast]);

  const CardView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {hypotheses.map((hypothesis) => {
        const data = getFullData(hypothesis);
        const title = hypothesis.displayTitle || displayColumns[0] && data[displayColumns[0]] || `仮説 ${hypothesis.hypothesisNumber}`;
        const badges = displayColumns.slice(1, 4).map((col) => data[col]).filter(Boolean);
        const judgment = getDisplayValue(data, ["科学×経済判定", "判定", "評価", "Judgment"]);
        const score = getDisplayValue(data, ["総合スコア", "スコア", "Score", "点数"]);
        
        return (
          <div
            key={hypothesis.id}
            className="group flex flex-col gap-2 rounded-md border bg-card p-3 hover-elevate cursor-pointer"
            onClick={() => handleHypothesisClick(hypothesis)}
            data-testid={`hypothesis-item-${hypothesis.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-medium line-clamp-2 flex-1">
                {String(title)}
              </h4>
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => handleDelete(hypothesis.id, e)}
                data-testid={`button-delete-hypothesis-${hypothesis.id}`}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {badges.slice(0, 2).map((badge, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {String(badge)}
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-1 mt-auto">
              {judgment && (
                <Badge
                  variant={getJudgmentBadgeVariant(judgment)}
                  className="text-xs"
                >
                  {judgment}
                </Badge>
              )}
              {score && (
                <span className="text-xs text-muted-foreground">
                  スコア: {score}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(hypothesis.createdAt), "yyyy/MM/dd")}
            </p>
          </div>
        );
      })}
    </div>
  );

  const TableView = () => (
    <div className="border rounded-md">
      <TableComponent className="w-max min-w-full">
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
                className="cursor-pointer hover-elevate"
                onClick={() => handleHypothesisClick(hypothesis)}
                data-testid={`hypothesis-row-${hypothesis.id}`}
              >
                <TableCell className="font-mono text-xs whitespace-nowrap">{hypothesis.hypothesisNumber}</TableCell>
                {displayColumns.map((col) => (
                  <TableCell key={col} className="text-xs max-w-[300px]">
                    <span className="line-clamp-2">{String(data[col] ?? "-")}</span>
                  </TableCell>
                ))}
                <TableCell className="whitespace-nowrap">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => handleDelete(hypothesis.id, e)}
                    data-testid={`button-delete-hypothesis-table-${hypothesis.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </TableComponent>
    </div>
  );

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover-elevate">
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
                  data-testid="button-column-settings"
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setImportModalOpen(true);
                  }}
                  data-testid="button-import-csv-empty"
                >
                  <Upload className="h-4 w-4" />
                  CSVインポート
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant={viewMode === "card" ? "default" : "ghost"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewMode("card");
                      }}
                      data-testid="button-view-card"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant={viewMode === "table" ? "default" : "ghost"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewMode("table");
                      }}
                      data-testid="button-view-table"
                    >
                      <Table className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImportModalOpen(true);
                      }}
                      className="gap-2"
                      data-testid="button-import-csv"
                    >
                      <Upload className="h-4 w-4" />
                      CSVインポート
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportCSV();
                      }}
                      className="gap-2"
                      data-testid="button-export-csv"
                    >
                      <Download className="h-4 w-4" />
                      CSVエクスポート
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadAllReports();
                      }}
                      className="gap-2"
                      disabled={downloadingReports || hypotheses.length === 0}
                      data-testid="button-download-all-reports"
                    >
                      {downloadingReports ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                      一括Word
                    </Button>
                  </div>
                </div>
                <div className="max-h-[400px] overflow-auto">
                  {viewMode === "card" ? <CardView /> : <TableView />}
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

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
                    if (window.confirm("この仮説を削除しますか？\n（将来の生成時に重複チェックから除外されます）")) {
                      onDelete(selectedHypothesis.id);
                      setDetailsOpen(false);
                      setSelectedHypothesis(null);
                    }
                  }}
                  data-testid="button-delete-hypothesis-detail"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            </div>
            <DialogDescription>
              {selectedHypothesis?.displayTitle || `仮説 ${selectedHypothesis?.hypothesisNumber}`}
            </DialogDescription>
          </DialogHeader>

          {selectedHypothesis && (
            <Tabs value={detailsTab} onValueChange={handleTabChange} className="w-full flex-1 flex flex-col min-h-0">
              <TabsList className="grid w-full grid-cols-2 shrink-0">
                <TabsTrigger value="summary" data-testid="tab-hypothesis-summary">概要</TabsTrigger>
                <TabsTrigger value="report" data-testid="tab-hypothesis-report">レポート</TabsTrigger>
              </TabsList>
              <TabsContent value="summary" className="flex-1 overflow-auto mt-2">
                <div className="space-y-4 pr-2">
                  {(() => {
                    const data = getFullData(selectedHypothesis);
                    const entries = Object.entries(data).filter(([, v]) => v != null && v !== "");
                    return entries.map(([key, value]) => (
                      <div key={key}>
                        <h4 className="text-sm font-medium mb-1">{key}</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{String(value)}</p>
                      </div>
                    ));
                  })()}
                  <div className="text-xs text-muted-foreground pt-2 border-t space-y-1">
                    <div>作成日: {format(new Date(selectedHypothesis.createdAt), "yyyy/MM/dd HH:mm")}</div>
                    {selectedHypothesis.targetSpecName && (
                      <div>市場・顧客ニーズ: {selectedHypothesis.targetSpecName}</div>
                    )}
                    {selectedHypothesis.technicalAssetsName && (
                      <div>技術シーズ: {selectedHypothesis.technicalAssetsName}</div>
                    )}
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="report" className="flex-1 overflow-auto mt-2">
                {reportLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">読み込み中...</span>
                  </div>
                ) : reportContent ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none pr-2 break-words overflow-x-hidden [&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_pre]:overflow-x-hidden [&_table]:block [&_table]:overflow-x-auto [&_table]:text-xs [&_code]:break-all">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {reportContent}
                    </ReactMarkdown>
                  </div>
                ) : !selectedHypothesis.runId ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      この仮説にはレポートが関連付けられていません
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      レポートを読み込むにはこのタブを選択してください
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            {selectedHypothesis?.runId && onDownloadWord && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => onDownloadWord(selectedHypothesis.runId!, getHypothesisIndexInRun(selectedHypothesis))}
                data-testid="button-download-hypothesis-word"
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

      <Dialog open={columnSettingsOpen} onOpenChange={setColumnSettingsOpen}>
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
              <p className="text-xs text-muted-foreground mb-2">カラム順序（チェックで表示/非表示、矢印で並び替え）</p>
              {columnOrder.map((column, index) => (
                <div
                  key={column}
                  className={`flex items-center gap-2 p-2 rounded-md ${visibleColumns.has(column) ? 'bg-muted/50' : 'opacity-60'}`}
                  data-testid={`column-setting-${column}`}
                >
                  <Checkbox
                    checked={visibleColumns.has(column)}
                    onCheckedChange={() => toggleColumn(column)}
                    className="shrink-0"
                  />
                  <Label className={`text-sm flex-1 truncate ${!visibleColumns.has(column) ? 'text-muted-foreground' : ''}`}>{column}</Label>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={index === 0}
                      onClick={() => moveColumnUp(column)}
                      className="h-6 w-6"
                      data-testid={`button-move-up-${column}`}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={index === columnOrder.length - 1}
                      onClick={() => moveColumnDown(column)}
                      className="h-6 w-6"
                      data-testid={`button-move-down-${column}`}
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => saveColumnVisibility(new Set(columnOrder))}
                data-testid="button-select-all-columns"
              >
                すべて表示
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={resetColumnSettings}
                data-testid="button-reset-columns"
              >
                リセット
              </Button>
            </div>
            <Button onClick={() => setColumnSettingsOpen(false)}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CsvImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImportCSV}
        existingColumns={defaultColumnOrder}
      />
    </Card>
  );
}
