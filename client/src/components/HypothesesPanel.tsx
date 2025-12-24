import { useState } from "react";
import { Lightbulb, ChevronDown, ChevronUp, Trash2, LayoutGrid, Table, Download } from "lucide-react";
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
import {
  Table as TableComponent,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import type { Hypothesis } from "@shared/schema";

interface HypothesesPanelProps {
  hypotheses: Hypothesis[];
  onDelete: (id: number) => void;
}

type ViewMode = "card" | "table";

export function HypothesesPanel({ hypotheses, onDelete }: HypothesesPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [selectedHypothesis, setSelectedHypothesis] = useState<Hypothesis | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleHypothesisClick = (hypothesis: Hypothesis) => {
    setSelectedHypothesis(hypothesis);
    setDetailsOpen(true);
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
    const headers = [
      "仮説番号",
      "仮説タイトル",
      "業界",
      "分野",
      "事業仮説概要",
      "顧客の解決不能な課題",
      "素材が活躍する舞台",
      "素材の役割",
      "科学×経済判定",
      "戦略判定",
      "総合スコア",
      "作成日",
    ];

    const rows = hypotheses.map((h) => [
      h.hypothesisNumber.toString(),
      h.title,
      h.industry || "",
      h.field || "",
      h.summary || "",
      h.customerProblem || "",
      h.stage || "",
      h.role || "",
      h.scientificJudgment || "",
      h.strategicJudgment || "",
      h.totalScore?.toString() || "",
      format(new Date(h.createdAt), "yyyy/MM/dd HH:mm"),
    ]);

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

  const CardView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {hypotheses.map((hypothesis) => (
        <div
          key={hypothesis.id}
          className="group flex flex-col gap-2 rounded-md border bg-card p-3 hover-elevate cursor-pointer"
          onClick={() => handleHypothesisClick(hypothesis)}
          data-testid={`hypothesis-item-${hypothesis.id}`}
        >
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-medium line-clamp-2 flex-1">
              {hypothesis.title}
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
            {hypothesis.industry && (
              <Badge variant="outline" className="text-xs">
                {hypothesis.industry}
              </Badge>
            )}
            {hypothesis.field && (
              <Badge variant="outline" className="text-xs">
                {hypothesis.field}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 mt-auto">
            {hypothesis.scientificJudgment && (
              <Badge
                variant={getJudgmentBadgeVariant(hypothesis.scientificJudgment)}
                className="text-xs"
              >
                {hypothesis.scientificJudgment}
              </Badge>
            )}
            {hypothesis.totalScore && (
              <span className="text-xs text-muted-foreground">
                スコア: {hypothesis.totalScore}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {format(new Date(hypothesis.createdAt), "yyyy/MM/dd")}
          </p>
        </div>
      ))}
    </div>
  );

  const TableView = () => (
    <div className="w-full overflow-x-auto border rounded-md">
      <TableComponent className="min-w-[900px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px] whitespace-nowrap">No.</TableHead>
            <TableHead className="min-w-[200px]">タイトル</TableHead>
            <TableHead className="w-[80px] whitespace-nowrap">業界</TableHead>
            <TableHead className="w-[80px] whitespace-nowrap">分野</TableHead>
            <TableHead className="w-[110px] whitespace-nowrap">科学×経済判定</TableHead>
            <TableHead className="w-[70px] whitespace-nowrap text-center">スコア</TableHead>
            <TableHead className="w-[110px] whitespace-nowrap">キャッチアップ</TableHead>
            <TableHead className="w-[100px] whitespace-nowrap">勝算レベル</TableHead>
            <TableHead className="w-[70px] whitespace-nowrap text-center">スコア</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hypotheses.map((hypothesis) => (
            <TableRow
              key={hypothesis.id}
              className="cursor-pointer hover-elevate"
              onClick={() => handleHypothesisClick(hypothesis)}
              data-testid={`hypothesis-row-${hypothesis.id}`}
            >
              <TableCell className="font-mono text-xs">{hypothesis.hypothesisNumber}</TableCell>
              <TableCell className="font-medium text-sm">
                <span className="line-clamp-2">{hypothesis.title}</span>
              </TableCell>
              <TableCell className="text-xs whitespace-nowrap">{hypothesis.industry || "-"}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{hypothesis.field || "-"}</TableCell>
              <TableCell>
                {hypothesis.scientificJudgment && (
                  <Badge
                    variant={getJudgmentBadgeVariant(hypothesis.scientificJudgment)}
                    className="text-xs whitespace-nowrap"
                  >
                    {hypothesis.scientificJudgment}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="font-mono text-xs text-center">
                {hypothesis.scientificScore ?? "-"}
              </TableCell>
              <TableCell>
                {hypothesis.strategicJudgment && (
                  <Badge
                    variant={getJudgmentBadgeVariant(hypothesis.strategicJudgment)}
                    className="text-xs whitespace-nowrap"
                  >
                    {hypothesis.strategicJudgment}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-xs whitespace-nowrap">
                {hypothesis.strategicWinLevel || "-"}
              </TableCell>
              <TableCell className="font-mono text-xs text-center">
                {hypothesis.catchupScore ?? "-"}
              </TableCell>
              <TableCell>
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
          ))}
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
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
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
                  G-Methodを実行すると、生成された仮説がここに表示されます
                </p>
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
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {viewMode === "card" ? <CardView /> : <TableView />}
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              仮説詳細
            </DialogTitle>
            <DialogDescription>
              {selectedHypothesis?.title}
            </DialogDescription>
          </DialogHeader>

          {selectedHypothesis && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                <div className="flex flex-wrap gap-2">
                  {selectedHypothesis.industry && (
                    <Badge variant="outline">{selectedHypothesis.industry}</Badge>
                  )}
                  {selectedHypothesis.field && (
                    <Badge variant="outline">{selectedHypothesis.field}</Badge>
                  )}
                  {selectedHypothesis.scientificJudgment && (
                    <Badge variant={getJudgmentBadgeVariant(selectedHypothesis.scientificJudgment)}>
                      {selectedHypothesis.scientificJudgment}
                    </Badge>
                  )}
                  {selectedHypothesis.strategicJudgment && (
                    <Badge variant={getJudgmentBadgeVariant(selectedHypothesis.strategicJudgment)}>
                      戦略: {selectedHypothesis.strategicJudgment}
                    </Badge>
                  )}
                </div>

                {selectedHypothesis.summary && (
                  <div>
                    <h4 className="text-sm font-medium mb-1">事業仮説概要</h4>
                    <p className="text-sm text-muted-foreground">{selectedHypothesis.summary}</p>
                  </div>
                )}

                {selectedHypothesis.customerProblem && (
                  <div>
                    <h4 className="text-sm font-medium mb-1">顧客の解決不能な課題</h4>
                    <p className="text-sm text-muted-foreground">{selectedHypothesis.customerProblem}</p>
                  </div>
                )}

                {selectedHypothesis.stage && (
                  <div>
                    <h4 className="text-sm font-medium mb-1">素材が活躍する舞台</h4>
                    <p className="text-sm text-muted-foreground">{selectedHypothesis.stage}</p>
                  </div>
                )}

                {selectedHypothesis.role && (
                  <div>
                    <h4 className="text-sm font-medium mb-1">素材の役割</h4>
                    <p className="text-sm text-muted-foreground">{selectedHypothesis.role}</p>
                  </div>
                )}

                {selectedHypothesis.totalScore && (
                  <div>
                    <h4 className="text-sm font-medium mb-1">総合スコア</h4>
                    <p className="text-sm text-muted-foreground">{selectedHypothesis.totalScore}点</p>
                  </div>
                )}

                <div className="text-xs text-muted-foreground pt-2 border-t">
                  作成日: {format(new Date(selectedHypothesis.createdAt), "yyyy/MM/dd HH:mm")}
                </div>
              </div>
            </ScrollArea>
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
