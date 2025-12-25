import { useState, useEffect } from "react";
import { History, ChevronRight, Download, Loader2, CheckCircle, XCircle, Clock, FileSpreadsheet, AlertTriangle, Timer, FileText, Bug, Paperclip } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { HypothesisRun, Resource } from "@shared/schema";

interface IndividualReport {
  index: number;
  title: string;
  previewLength: number;
}

interface DebugPromptEntry {
  step: string;
  prompt: string;
  attachments: string[];
  timestamp: string;
}

interface HistoryPanelProps {
  runs: HypothesisRun[];
  resources: Resource[];
  onDownloadTSV: (runId: number) => void;
  onDownloadExcel: (runId: number) => void;
  onDownloadStep2Word: (runId: number) => void;
  onDownloadIndividualReport: (runId: number, hypothesisIndex: number) => void;
}

const statusConfig: Record<string, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive"; animate: boolean }> = {
  pending: { label: "待機中", icon: Clock, variant: "secondary", animate: false },
  running: { label: "処理中", icon: Loader2, variant: "default", animate: true },
  paused: { label: "一時停止", icon: Clock, variant: "secondary", animate: false },
  completed: { label: "完了", icon: CheckCircle, variant: "default", animate: false },
  error: { label: "エラー", icon: XCircle, variant: "destructive", animate: false },
  failed: { label: "失敗", icon: XCircle, variant: "destructive", animate: false },
  interrupted: { label: "中断", icon: AlertTriangle, variant: "secondary", animate: false },
};

const defaultStatus = { label: "不明", icon: Clock, variant: "secondary" as const, animate: false };

interface StepTiming {
  startTime: number;
  endTime?: number;
  durationMs?: number;
}

interface StepDurations {
  step2?: StepTiming;
  step3?: StepTiming;
  step4?: StepTiming;
  step5?: StepTiming;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}分${remainingSeconds}秒`;
  }
  return `${seconds}秒`;
}

export function HistoryPanel({ runs, resources, onDownloadTSV, onDownloadExcel, onDownloadStep2Word, onDownloadIndividualReport }: HistoryPanelProps) {
  const [selectedRun, setSelectedRun] = useState<HypothesisRun | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("step2Output");
  const [individualReports, setIndividualReports] = useState<IndividualReport[]>([]);
  const [selectedHypothesisIndex, setSelectedHypothesisIndex] = useState<string>("");
  const [loadingReports, setLoadingReports] = useState(false);
  const [debugPromptsOpen, setDebugPromptsOpen] = useState(false);
  const [debugPrompts, setDebugPrompts] = useState<DebugPromptEntry[]>([]);
  const [loadingDebugPrompts, setLoadingDebugPrompts] = useState(false);
  const [selectedDebugStep, setSelectedDebugStep] = useState<string>("");

  const getResourceName = (id: number) => {
    return resources.find((r) => r.id === id)?.name || "不明";
  };

  const fetchIndividualReports = async (runId: number) => {
    setLoadingReports(true);
    try {
      const response = await fetch(`/api/runs/${runId}/individual-reports`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        if (data.available) {
          setIndividualReports(data.reports);
        } else {
          setIndividualReports([]);
        }
      } else {
        setIndividualReports([]);
      }
    } catch {
      setIndividualReports([]);
    } finally {
      setLoadingReports(false);
    }
  };

  const fetchDebugPrompts = async (runId: number) => {
    setLoadingDebugPrompts(true);
    try {
      const response = await fetch(`/api/runs/${runId}/debug-prompts`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        if (data.available) {
          setDebugPrompts(data.entries);
          if (data.entries.length > 0) {
            setSelectedDebugStep(data.entries[0].step);
          }
        } else {
          setDebugPrompts([]);
        }
      } else {
        setDebugPrompts([]);
      }
    } catch {
      setDebugPrompts([]);
    } finally {
      setLoadingDebugPrompts(false);
    }
  };

  const handleOpenDebugPrompts = () => {
    if (selectedRun) {
      setDebugPromptsOpen(true);
      fetchDebugPrompts(selectedRun.id);
    }
  };

  const handleRunClick = (run: HypothesisRun) => {
    setSelectedRun(run);
    setDetailsOpen(true);
    setSelectedHypothesisIndex("");
    if (run.status === "completed") {
      fetchIndividualReports(run.id);
    }
  };

  useEffect(() => {
    if (!detailsOpen) {
      setIndividualReports([]);
      setSelectedHypothesisIndex("");
    }
  }, [detailsOpen]);

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
                  const status = statusConfig[run.status] || defaultStatus;
                  const StatusIcon = status.icon;
                  return (
                    <div
                      key={run.id}
                      className="group flex items-center justify-between gap-3 rounded-md border bg-card p-3 hover-elevate cursor-pointer"
                      onClick={() => handleRunClick(run)}
                      data-testid={`run-item-${run.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {run.jobName && (
                            <span className="text-sm font-medium truncate" data-testid={`text-job-name-${run.id}`}>
                              {run.jobName}
                              {run.totalLoops && run.totalLoops > 1 && run.currentLoop ? ` (${run.currentLoop}/${run.totalLoops})` : ""}
                            </span>
                          )}
                          <Badge variant={status.variant} className="gap-1 text-xs shrink-0">
                            <StatusIcon className={`h-3 w-3 ${status.animate ? "animate-spin" : ""}`} />
                            {status.label}
                          </Badge>
                          {run.currentStep && run.currentStep > 0 && run.status === "running" && (
                            <span className="text-xs text-muted-foreground shrink-0">
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
            <div className="flex items-center justify-between gap-4">
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                実行詳細
              </DialogTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleOpenDebugPrompts}
                data-testid="button-debug-prompts"
              >
                <Bug className="h-4 w-4" />
                プロンプト確認
              </Button>
            </div>
            <DialogDescription>
              {selectedRun && (
                <>
                  {selectedRun.jobName && (
                    <span className="font-medium">
                      {selectedRun.jobName}
                      {selectedRun.totalLoops && selectedRun.totalLoops > 1 && selectedRun.currentLoop ? ` (${selectedRun.currentLoop}/${selectedRun.totalLoops})` : ""} ・{" "}
                    </span>
                  )}
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
                  const status = statusConfig[selectedRun.status] || defaultStatus;
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
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-w-0">
                  <TabsList className="grid w-full grid-cols-4 shrink-0">
                    {stepLabels.map(({ key, step }) => (
                      <TabsTrigger key={key} value={key} disabled={!selectedRun[key]}>
                        ステップ {step}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  
                  {(() => {
                    const progressInfo = selectedRun.progressInfo as { stepDurations?: StepDurations } | null;
                    const stepDurations = progressInfo?.stepDurations;
                    if (stepDurations && Object.keys(stepDurations).length > 0) {
                      const totalDuration = Object.values(stepDurations).reduce(
                        (sum, timing) => sum + (timing?.durationMs || 0), 0
                      );
                      return (
                        <div className="flex items-center gap-4 mt-3 px-1 text-xs text-muted-foreground" data-testid="step-timings">
                          <div className="flex items-center gap-1">
                            <Timer className="h-3 w-3" />
                            <span>処理時間:</span>
                          </div>
                          {stepDurations.step2?.durationMs && (
                            <span data-testid="timing-step2">S2: {formatDuration(stepDurations.step2.durationMs)}</span>
                          )}
                          {stepDurations.step3?.durationMs && (
                            <span data-testid="timing-step3">S3: {formatDuration(stepDurations.step3.durationMs)}</span>
                          )}
                          {stepDurations.step4?.durationMs && (
                            <span data-testid="timing-step4">S4: {formatDuration(stepDurations.step4.durationMs)}</span>
                          )}
                          {stepDurations.step5?.durationMs && (
                            <span data-testid="timing-step5">S5: {formatDuration(stepDurations.step5.durationMs)}</span>
                          )}
                          {totalDuration > 0 && (
                            <span className="font-medium" data-testid="timing-total">合計: {formatDuration(totalDuration)}</span>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                  
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
          <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
            {selectedRun?.status === "completed" && activeTab === "step2Output" && selectedRun.step2Output && (
              <>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => onDownloadStep2Word(selectedRun.id)}
                  data-testid="button-download-step2-word"
                >
                  <FileText className="h-4 w-4" />
                  STEP2をWord出力
                </Button>
                {loadingReports ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    個別レポート読込中...
                  </div>
                ) : individualReports.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Select value={selectedHypothesisIndex} onValueChange={setSelectedHypothesisIndex}>
                      <SelectTrigger className="w-[200px]" data-testid="select-individual-report">
                        <SelectValue placeholder="仮説を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {individualReports.map((report) => (
                          <SelectItem key={report.index} value={report.index.toString()}>
                            仮説{report.index + 1}: {report.title.slice(0, 30)}...
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      className="gap-2"
                      disabled={!selectedHypothesisIndex}
                      onClick={() => selectedRun && onDownloadIndividualReport(selectedRun.id, parseInt(selectedHypothesisIndex))}
                      data-testid="button-download-individual-report"
                    >
                      <FileText className="h-4 w-4" />
                      個別Word出力
                    </Button>
                  </div>
                )}
              </>
            )}
            {selectedRun?.status === "completed" && activeTab === "step5Output" && (
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

      <Dialog open={debugPromptsOpen} onOpenChange={(open) => {
        setDebugPromptsOpen(open);
        if (!open) {
          setSelectedDebugStep("");
          setDebugPrompts([]);
        }
      }}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5" />
              プロンプト確認（デバッグ）
            </DialogTitle>
            <DialogDescription>
              各ステップで実際に送信されたプロンプトと添付ファイルを確認できます
            </DialogDescription>
          </DialogHeader>

          {loadingDebugPrompts ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : debugPrompts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bug className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">
                デバッグプロンプトが利用できません
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                このRunはプロンプト記録機能追加前に実行された可能性があります
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">ステップ選択:</span>
                <Select value={selectedDebugStep} onValueChange={setSelectedDebugStep}>
                  <SelectTrigger className="w-full" data-testid="select-debug-step">
                    <SelectValue placeholder="ステップを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {debugPrompts.map((entry, index) => (
                      <SelectItem key={index} value={entry.step}>
                        {entry.step}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(() => {
                const selectedEntry = debugPrompts.find(e => e.step === selectedDebugStep);
                if (!selectedEntry) return null;

                return (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>送信時刻: {format(new Date(selectedEntry.timestamp), "yyyy/MM/dd HH:mm:ss")}</span>
                    </div>

                    {selectedEntry.attachments.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium flex items-center gap-1">
                          <Paperclip className="h-4 w-4" />
                          添付ファイル:
                        </span>
                        {selectedEntry.attachments.map((attachment, idx) => (
                          <Badge key={idx} variant="secondary" data-testid={`badge-attachment-${idx}`}>
                            {attachment}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div>
                      <span className="text-sm font-medium">プロンプト内容:</span>
                      <ScrollArea className="h-[50vh] mt-2 rounded-md border bg-muted/30 p-4">
                        <pre className="text-xs font-mono whitespace-pre-wrap break-words" data-testid="text-debug-prompt">
                          {selectedEntry.prompt}
                        </pre>
                      </ScrollArea>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDebugPromptsOpen(false)}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
