import { useState } from "react";
import { History, ChevronRight, Download, Loader2, CheckCircle, XCircle, Clock, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { HypothesisRun, Resource } from "@shared/schema";

interface HistoryPanelProps {
  runs: HypothesisRun[];
  resources: Resource[];
  onDownloadTSV: (runId: number) => void;
  onDownloadExcel: (runId: number) => void;
}

const statusConfig = {
  pending: { label: "待機中", icon: Clock, variant: "secondary" as const, animate: false },
  running: { label: "処理中", icon: Loader2, variant: "default" as const, animate: true },
  completed: { label: "完了", icon: CheckCircle, variant: "default" as const, animate: false },
  error: { label: "エラー", icon: XCircle, variant: "destructive" as const, animate: false },
  failed: { label: "失敗", icon: XCircle, variant: "destructive" as const, animate: false },
};

export function HistoryPanel({ runs, resources, onDownloadTSV, onDownloadExcel }: HistoryPanelProps) {
  const [selectedRun, setSelectedRun] = useState<HypothesisRun | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const getResourceName = (id: number) => {
    return resources.find((r) => r.id === id)?.name || "不明";
  };

  const handleRunClick = (run: HypothesisRun) => {
    setSelectedRun(run);
    setDetailsOpen(true);
  };

  const stepLabels = [
    { key: "step2Output", label: "ステップ2: 提案", step: 2 },
    { key: "step3Output", label: "ステップ3: 科学的評価", step: 3 },
    { key: "step4Output", label: "ステップ4: 戦略的監査", step: 4 },
    { key: "step5Output", label: "ステップ5: 統合", step: 5 },
  ] as const;

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <History className="h-5 w-5" />
            実行履歴
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          <ScrollArea className="h-full pr-3">
            {runs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <History className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-sm text-muted-foreground">
                  実行履歴がありません
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  G-Methodを実行して仮説を生成してください
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => {
                  const status = statusConfig[run.status as keyof typeof statusConfig];
                  const StatusIcon = status.icon;
                  return (
                    <div
                      key={run.id}
                      className="group flex items-center justify-between gap-3 rounded-md border bg-card p-3 hover-elevate cursor-pointer"
                      onClick={() => handleRunClick(run)}
                      data-testid={`run-item-${run.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={status.variant} className="gap-1 text-xs">
                            <StatusIcon className={`h-3 w-3 ${status.animate ? "animate-spin" : ""}`} />
                            {status.label}
                          </Badge>
                          {run.currentStep && run.currentStep > 0 && run.status === "running" && (
                            <span className="text-xs text-muted-foreground">
                              ステップ {run.currentStep}/5
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {getResourceName(run.targetSpecId)} x {getResourceName(run.technicalAssetsId)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(run.createdAt), "yyyy/MM/dd HH:mm")}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              実行詳細
            </DialogTitle>
            <DialogDescription>
              {selectedRun && (
                <>
                  {getResourceName(selectedRun.targetSpecId)} x {getResourceName(selectedRun.technicalAssetsId)} ・{" "}
                  {format(new Date(selectedRun.createdAt), "yyyy/MM/dd HH:mm")}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedRun && (
            <>
              <div className="flex items-center gap-2 mb-2">
                {(() => {
                  const status = statusConfig[selectedRun.status as keyof typeof statusConfig];
                  const StatusIcon = status.icon;
                  return (
                    <Badge variant={status.variant} className="gap-1">
                      <StatusIcon className={`h-3 w-3 ${status.animate ? "animate-spin" : ""}`} />
                      {status.label}
                    </Badge>
                  );
                })()}
                {selectedRun.errorMessage && (
                  <span className="text-sm text-destructive">{selectedRun.errorMessage}</span>
                )}
              </div>

              {selectedRun.status === "completed" && (
                <Tabs defaultValue="step2Output" className="flex-1 min-w-0">
                  <TabsList className="grid w-full grid-cols-4 shrink-0">
                    {stepLabels.map(({ key, step }) => (
                      <TabsTrigger key={key} value={key} disabled={!selectedRun[key]}>
                        ステップ {step}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {stepLabels.map(({ key }) => (
                    <TabsContent key={key} value={key} className="mt-4 overflow-hidden">
                      <ScrollArea className="h-[45vh] rounded-md border bg-muted/30 p-4">
                        <div className="w-full overflow-x-auto">
                          {key === "step5Output" ? (
                            <pre className="text-sm font-mono whitespace-pre-wrap break-words">
                              {selectedRun[key] || "出力がありません"}
                            </pre>
                          ) : (
                            <div className="prose prose-sm dark:prose-invert max-w-none [&_table]:text-xs [&_pre]:overflow-x-auto [&_pre]:max-w-full">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {selectedRun[key] || "出力がありません"}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  ))}
                </Tabs>
              )}

              {selectedRun.status === "running" && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                  <p className="text-sm text-muted-foreground">
                    ステップ {selectedRun.currentStep || 2} / 5 を処理中...
                  </p>
                </div>
              )}

              {selectedRun.status === "error" && (
                <div className="flex flex-col items-center justify-center py-12">
                  <XCircle className="h-12 w-12 text-destructive mb-4" />
                  <p className="text-sm text-destructive">
                    {selectedRun.errorMessage || "処理中にエラーが発生しました"}
                  </p>
                </div>
              )}
            </>
          )}

          <Separator />
          <DialogFooter className="gap-2 sm:gap-2">
            {selectedRun?.status === "completed" && (
              <>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => onDownloadTSV(selectedRun.id)}
                  data-testid="button-download-tsv"
                >
                  <Download className="h-4 w-4" />
                  TSVをダウンロード
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => onDownloadExcel(selectedRun.id)}
                  data-testid="button-download-excel"
                >
                  <Download className="h-4 w-4" />
                  Excelをダウンロード
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
