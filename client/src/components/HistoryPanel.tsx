import { useState, useEffect } from "react";
import { History, ChevronRight, Download, Loader2, CheckCircle, XCircle, Clock, FileSpreadsheet, AlertTriangle, Timer, FileText, Bug, Paperclip, RotateCcw } from "lucide-react";
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
  hasError?: boolean;
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
  onResumeInterrupted?: (runId: number) => void;
  isResuming?: boolean;
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

export function HistoryPanel({ runs, resources, onDownloadTSV, onDownloadExcel, onDownloadStep2Word, onDownloadIndividualReport, onResumeInterrupted, isResuming }: HistoryPanelProps) {
  const [selectedRun, setSelectedRun] = useState<HypothesisRun | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("step2_1Output");
  const [individualReports, setIndividualReports] = useState<IndividualReport[]>([]);
  const [selectedHypothesisIndex, setSelectedHypothesisIndex] = useState<string>("");
  const [loadingReports, setLoadingReports] = useState(false);
  const [selectedReportContent, setSelectedReportContent] = useState<string>("");
  const [loadingReportContent, setLoadingReportContent] = useState(false);
  const [debugPromptsOpen, setDebugPromptsOpen] = useState(false);
  const [debugPrompts, setDebugPrompts] = useState<DebugPromptEntry[]>([]);
  const [loadingDebugPrompts, setLoadingDebugPrompts] = useState(false);
  const [selectedDebugStep, setSelectedDebugStep] = useState<string>("");
  const [siblingRuns, setSiblingRuns] = useState<HypothesisRun[]>([]);
  // STEP 3 individual reports
  const [step3Reports, setStep3Reports] = useState<IndividualReport[]>([]);
  const [selectedStep3Index, setSelectedStep3Index] = useState<string>("");
  const [step3Content, setStep3Content] = useState<string>("");
  const [loadingStep3Reports, setLoadingStep3Reports] = useState(false);
  const [loadingStep3Content, setLoadingStep3Content] = useState(false);
  // STEP 4 individual reports
  const [step4Reports, setStep4Reports] = useState<IndividualReport[]>([]);
  const [selectedStep4Index, setSelectedStep4Index] = useState<string>("");
  const [step4Content, setStep4Content] = useState<string>("");
  const [loadingStep4Reports, setLoadingStep4Reports] = useState(false);
  const [loadingStep4Content, setLoadingStep4Content] = useState(false);
  // Loop filter for viewing specific loop results
  const [viewingLoop, setViewingLoop] = useState<string>("all");

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

  const fetchStep3Reports = async (runId: number) => {
    setLoadingStep3Reports(true);
    try {
      const response = await fetch(`/api/runs/${runId}/step3-reports`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        if (data.available) {
          setStep3Reports(data.reports);
        } else {
          setStep3Reports([]);
        }
      } else {
        setStep3Reports([]);
      }
    } catch {
      setStep3Reports([]);
    } finally {
      setLoadingStep3Reports(false);
    }
  };

  const fetchStep3Content = async (runId: number, hypothesisIndex: number) => {
    setLoadingStep3Content(true);
    try {
      const response = await fetch(`/api/runs/${runId}/step3-reports/${hypothesisIndex}/content`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setStep3Content(data.content || "");
      } else {
        setStep3Content("");
      }
    } catch {
      setStep3Content("");
    } finally {
      setLoadingStep3Content(false);
    }
  };

  const fetchStep4Reports = async (runId: number) => {
    setLoadingStep4Reports(true);
    try {
      const response = await fetch(`/api/runs/${runId}/step4-reports`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        if (data.available) {
          setStep4Reports(data.reports);
        } else {
          setStep4Reports([]);
        }
      } else {
        setStep4Reports([]);
      }
    } catch {
      setStep4Reports([]);
    } finally {
      setLoadingStep4Reports(false);
    }
  };

  const fetchStep4Content = async (runId: number, hypothesisIndex: number) => {
    setLoadingStep4Content(true);
    try {
      const response = await fetch(`/api/runs/${runId}/step4-reports/${hypothesisIndex}/content`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setStep4Content(data.content || "");
      } else {
        setStep4Content("");
      }
    } catch {
      setStep4Content("");
    } finally {
      setLoadingStep4Content(false);
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
    setSelectedReportContent("");
    setSelectedStep3Index("");
    setStep3Content("");
    setSelectedStep4Index("");
    setStep4Content("");
    setViewingLoop("all"); // Reset loop filter
    // Fetch individual reports even during execution (to view completed loop results)
    fetchIndividualReports(run.id);
    fetchStep3Reports(run.id);
    fetchStep4Reports(run.id);
    // Find sibling runs with same jobName for multi-loop batches
    if (run.jobName && run.totalLoops && run.totalLoops > 1) {
      const siblings = runs.filter(r => r.jobName === run.jobName).sort((a, b) => (a.currentLoop || 0) - (b.currentLoop || 0));
      setSiblingRuns(siblings);
    } else {
      setSiblingRuns([]);
    }
  };
  
  const handleLoopChange = (runId: string) => {
    const targetRun = runs.find(r => r.id === parseInt(runId));
    if (targetRun) {
      setSelectedRun(targetRun);
      setSelectedHypothesisIndex("");
      setSelectedReportContent("");
      setSelectedStep3Index("");
      setStep3Content("");
      setSelectedStep4Index("");
      setStep4Content("");
      setViewingLoop("all"); // Reset loop filter when switching runs
      fetchIndividualReports(targetRun.id);
      fetchStep3Reports(targetRun.id);
      fetchStep4Reports(targetRun.id);
    }
  };

  // Helper to filter reports by loop
  const getFilteredReports = (reports: IndividualReport[], loopFilter: string): IndividualReport[] => {
    if (!selectedRun || loopFilter === "all") return reports;
    const hypothesisCount = selectedRun.hypothesisCount || 5;
    const loopNum = parseInt(loopFilter);
    const startIndex = (loopNum - 1) * hypothesisCount;
    const endIndex = loopNum * hypothesisCount;
    return reports.filter(r => r.index >= startIndex && r.index < endIndex);
  };

  // Get available loops based on completed hypotheses
  const getAvailableLoops = (): number[] => {
    if (!selectedRun) return [];
    const hypothesisCount = selectedRun.hypothesisCount || 5;
    const totalReports = individualReports.length;
    const completedLoops = Math.ceil(totalReports / hypothesisCount);
    return Array.from({ length: completedLoops }, (_, i) => i + 1);
  };

  useEffect(() => {
    if (!detailsOpen) {
      setIndividualReports([]);
      setSelectedHypothesisIndex("");
      setSelectedReportContent("");
      setSiblingRuns([]);
      setStep3Reports([]);
      setSelectedStep3Index("");
      setStep3Content("");
      setStep4Reports([]);
      setSelectedStep4Index("");
      setStep4Content("");
      setViewingLoop("all");
    }
  }, [detailsOpen]);

  useEffect(() => {
    if (selectedStep3Index && selectedRun) {
      fetchStep3Content(selectedRun.id, parseInt(selectedStep3Index));
    } else {
      setStep3Content("");
    }
  }, [selectedStep3Index, selectedRun]);

  useEffect(() => {
    if (selectedStep4Index && selectedRun) {
      fetchStep4Content(selectedRun.id, parseInt(selectedStep4Index));
    } else {
      setStep4Content("");
    }
  }, [selectedStep4Index, selectedRun]);
  
  useEffect(() => {
    if (selectedHypothesisIndex && selectedRun) {
      fetchReportContent(selectedRun.id, parseInt(selectedHypothesisIndex));
    } else {
      setSelectedReportContent("");
    }
  }, [selectedHypothesisIndex, selectedRun]);

  useEffect(() => {
    if (selectedRun && detailsOpen) {
      const updatedRun = runs.find((r) => r.id === selectedRun.id);
      if (updatedRun && JSON.stringify(updatedRun) !== JSON.stringify(selectedRun)) {
        setSelectedRun(updatedRun);
        // Refetch individual reports when run updates (to show newly completed hypotheses)
        if (updatedRun.status === "running" || updatedRun.status === "completed") {
          fetchIndividualReports(updatedRun.id);
          fetchStep3Reports(updatedRun.id);
          fetchStep4Reports(updatedRun.id);
        }
      }
      // Recompute sibling runs when runs list changes
      if (updatedRun?.jobName && updatedRun?.totalLoops && updatedRun.totalLoops > 1) {
        const siblings = runs.filter(r => r.jobName === updatedRun.jobName).sort((a, b) => (a.currentLoop || 0) - (b.currentLoop || 0));
        setSiblingRuns(siblings);
      }
    }
  }, [runs, selectedRun, detailsOpen]);

  const stepLabels = [
    { key: "step2_1Output", label: "S2-1: 発散・選定", step: 2, substep: 1 },
    { key: "step2_2Output", label: "S2-2: Deep Research", step: 2, substep: 2 },
    { key: "step3Output", label: "S3: 評価", step: 3 },
    { key: "step4Output", label: "S4: 監査", step: 4 },
    { key: "step5Output", label: "S5: 統合", step: 5 },
  ] as const;
  
  const fetchReportContent = async (runId: number, hypothesisIndex: number) => {
    setLoadingReportContent(true);
    try {
      const response = await fetch(`/api/runs/${runId}/individual-reports/${hypothesisIndex}/content`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setSelectedReportContent(data.content || "");
      } else {
        setSelectedReportContent("");
      }
    } catch {
      setSelectedReportContent("");
    } finally {
      setLoadingReportContent(false);
    }
  };

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
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
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
                {siblingRuns.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">ループ:</span>
                    <Select value={selectedRun.id.toString()} onValueChange={handleLoopChange}>
                      <SelectTrigger className="w-[140px]" data-testid="select-loop">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {siblingRuns.map((run) => (
                          <SelectItem key={run.id} value={run.id.toString()}>
                            {run.currentLoop}/{run.totalLoops} 回目
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* Loop filter for multi-loop runs with accumulated results */}
                {selectedRun.totalLoops && selectedRun.totalLoops > 1 && getAvailableLoops().length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">表示:</span>
                    <Select value={viewingLoop} onValueChange={(value) => {
                      setViewingLoop(value);
                      setSelectedHypothesisIndex("");
                      setSelectedReportContent("");
                      setSelectedStep3Index("");
                      setStep3Content("");
                      setSelectedStep4Index("");
                      setStep4Content("");
                    }}>
                      <SelectTrigger className="w-[160px]" data-testid="select-viewing-loop">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全ループ</SelectItem>
                        {getAvailableLoops().map((loop) => (
                          <SelectItem key={loop} value={loop.toString()}>
                            {loop}回目のみ
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {(() => {
                const currentStep = selectedRun.currentStep || 2;
                const isRunning = selectedRun.status === "running";
                const isInterrupted = selectedRun.status === "interrupted";
                const isError = selectedRun.status === "error";
                const isCompleted = selectedRun.status === "completed";
                
                const getStepStatus = (step: number): "completed" | "running" | "pending" | "error" => {
                  const outputKey = `step${step}Output` as keyof HypothesisRun;
                  if (selectedRun[outputKey]) return "completed";
                  if (isCompleted) return "completed";
                  if (isRunning && currentStep === step) return "running";
                  if (isError && currentStep === step) return "error";
                  return "pending";
                };
                
                const getCompletedStepCount = (): number => {
                  let count = 0;
                  if (selectedRun.step2Output) count++;
                  if (selectedRun.step3Output) count++;
                  if (selectedRun.step4Output) count++;
                  if (selectedRun.step5Output) count++;
                  return count;
                };
                
                return (
                  <>
                    <div className="flex items-center justify-between gap-2 mb-3 p-3 rounded-md bg-muted/50" data-testid="progress-indicator">
                      {stepLabels.map(({ step }, index) => {
                        const status = getStepStatus(step);
                        return (
                          <div key={step} className="flex items-center gap-2 flex-1">
                            <div className="flex items-center gap-2">
                              {status === "completed" && (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                              {status === "running" && (
                                <Loader2 className="h-4 w-4 text-primary animate-spin" />
                              )}
                              {status === "error" && (
                                <XCircle className="h-4 w-4 text-destructive" />
                              )}
                              {status === "pending" && (
                                <Clock className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className={`text-xs font-medium ${
                                status === "completed" ? "text-green-600 dark:text-green-400" :
                                status === "running" ? "text-primary" :
                                status === "error" ? "text-destructive" :
                                "text-muted-foreground"
                              }`}>
                                S{step}
                              </span>
                            </div>
                            {index < stepLabels.length - 1 && (
                              <div className={`flex-1 h-0.5 ${
                                status === "completed" ? "bg-green-500" : "bg-muted-foreground/30"
                              }`} />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {isInterrupted && (
                      <div className="flex items-center justify-between p-3 mb-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            <span className="text-sm text-amber-600 dark:text-amber-400">
                              {selectedRun.errorMessage || "サーバー再起動により中断されました"}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground ml-6">
                            完了済みステップ: {getCompletedStepCount()}/4
                            {selectedRun.resumeCount && selectedRun.resumeCount > 0 && (
                              <span className="ml-2">(再開回数: {selectedRun.resumeCount})</span>
                            )}
                          </span>
                        </div>
                        {onResumeInterrupted && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => {
                              onResumeInterrupted(selectedRun.id);
                              setDetailsOpen(false);
                            }}
                            disabled={isResuming}
                            data-testid="button-resume-interrupted"
                          >
                            {isResuming ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                再開中...
                              </>
                            ) : (
                              <>
                                <RotateCcw className="h-3 w-3" />
                                途中から再開
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    )}

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-w-0">
                      <TabsList className="grid w-full grid-cols-5 shrink-0">
                        {stepLabels.map(({ key, label, step }) => {
                          const status = getStepStatus(step);
                          const isDisabled = status === "pending";
                          return (
                            <TabsTrigger key={key} value={key} className="gap-1 text-xs px-2" disabled={isDisabled}>
                              {status === "running" && (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              )}
                              {label}
                            </TabsTrigger>
                          );
                        })}
                      </TabsList>
                      
                      {isCompleted && (() => {
                        interface HypothesisTiming {
                          hypothesisNumber: number;
                          hypothesisTitle: string;
                          step2_2Ms: number;
                          step3Ms: number;
                          step4Ms: number;
                          step5Ms: number;
                          steps3to5TotalMs: number;
                        }
                        interface ExecutionTiming {
                          overallMs: number;
                          step2_1Ms: number;
                          step2_2ParallelMs: number;
                          steps3to5ParallelMs: number;
                          hypotheses: HypothesisTiming[];
                        }
                        const executionTiming = selectedRun.executionTiming as ExecutionTiming | null;
                        if (executionTiming && executionTiming.overallMs > 0) {
                          return (
                            <div className="mt-3 px-1 space-y-2" data-testid="execution-timing">
                              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                                <div className="flex items-center gap-1">
                                  <Timer className="h-3 w-3" />
                                  <span className="font-medium">全体:</span>
                                  <span data-testid="timing-overall">{formatDuration(executionTiming.overallMs)}</span>
                                </div>
                                <span data-testid="timing-step2-1">S2-1: {formatDuration(executionTiming.step2_1Ms)}</span>
                                <span data-testid="timing-step2-2">S2-2並列: {formatDuration(executionTiming.step2_2ParallelMs)}</span>
                                <span data-testid="timing-steps3to5">S3-5並列: {formatDuration(executionTiming.steps3to5ParallelMs)}</span>
                              </div>
                              {executionTiming.hypotheses && executionTiming.hypotheses.length > 0 && (
                                <details className="text-xs">
                                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                    仮説別タイミング詳細
                                  </summary>
                                  <div className="mt-2 space-y-1 pl-2 border-l-2 border-muted">
                                    {executionTiming.hypotheses.map((h, idx) => (
                                      <div key={`timing-${idx}-${h.hypothesisNumber}`} className="flex gap-2 text-muted-foreground flex-wrap" data-testid={`timing-hypothesis-${h.hypothesisNumber}`}>
                                        <span className="font-medium min-w-[60px]">H{h.hypothesisNumber}:</span>
                                        <span className="truncate max-w-[150px]" title={h.hypothesisTitle}>{h.hypothesisTitle}</span>
                                        <span className="text-nowrap">S2-2:{formatDuration(h.step2_2Ms)}</span>
                                        <span className="text-nowrap">S3:{formatDuration(h.step3Ms)}</span>
                                        <span className="text-nowrap">S4:{formatDuration(h.step4Ms)}</span>
                                        <span className="text-nowrap">S5:{formatDuration(h.step5Ms)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                          );
                        }
                        // Fallback to old progressInfo format
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
                      
                      {/* STEP 2-1 Tab */}
                      <TabsContent value="step2_1Output" className="mt-4 overflow-hidden">
                        <ScrollArea className="h-[45vh] rounded-md border bg-muted/30 p-4">
                          {getStepStatus(2) === "completed" ? (
                            <div className="w-full overflow-x-auto">
                              <div className="prose prose-sm dark:prose-invert max-w-none [&_table]:text-xs [&_pre]:overflow-x-auto [&_pre]:max-w-full">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {selectedRun.step2_1Output || selectedRun.step2Output || "出力がありません"}
                                </ReactMarkdown>
                              </div>
                            </div>
                          ) : getStepStatus(2) === "running" ? (
                            <div className="flex flex-col items-center justify-center h-full py-16">
                              <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                              <p className="text-sm text-muted-foreground">STEP 2-1 を処理中...</p>
                              <p className="text-xs text-muted-foreground mt-1">完了まで数分かかる場合があります</p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full py-16">
                              <Clock className="h-10 w-10 text-muted-foreground/50 mb-4" />
                              <p className="text-sm text-muted-foreground">完了待ち</p>
                            </div>
                          )}
                        </ScrollArea>
                      </TabsContent>
                      
                      {/* STEP 2-2 Tab with hypothesis selector */}
                      <TabsContent value="step2_2Output" className="mt-4 overflow-hidden">
                        <div className="flex flex-col h-[45vh]">
                          {/* Hypothesis selector */}
                          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              {loadingReports ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  読込中...
                                </div>
                              ) : getFilteredReports(individualReports, viewingLoop).length > 0 ? (
                                <Select value={selectedHypothesisIndex} onValueChange={setSelectedHypothesisIndex}>
                                  <SelectTrigger className="w-[280px]" data-testid="select-hypothesis-preview">
                                    <SelectValue placeholder="仮説を選択してプレビュー" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {getFilteredReports(individualReports, viewingLoop).map((report) => (
                                      <SelectItem 
                                        key={report.index} 
                                        value={report.index.toString()}
                                      >
                                        {report.hasError ? (
                                          <span className="flex items-center gap-1 text-destructive">
                                            <XCircle className="h-3 w-3" />
                                            仮説{report.index + 1}: エラー
                                          </span>
                                        ) : (
                                          <>仮説{report.index + 1}: {report.title.slice(0, 30)}...</>
                                        )}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-sm text-muted-foreground">個別レポートがありません</span>
                              )}
                            </div>
                            {selectedHypothesisIndex && !individualReports.find(r => r.index.toString() === selectedHypothesisIndex)?.hasError && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={() => selectedRun && onDownloadIndividualReport(selectedRun.id, parseInt(selectedHypothesisIndex))}
                                data-testid="button-download-step2-2-word"
                              >
                                <FileText className="h-4 w-4" />
                                Word出力
                              </Button>
                            )}
                          </div>
                          {/* Preview content */}
                          <ScrollArea className="flex-1 rounded-md border bg-muted/30 p-4">
                            {loadingReportContent ? (
                              <div className="flex flex-col items-center justify-center h-full py-16">
                                <Loader2 className="h-8 w-8 text-muted-foreground animate-spin mb-4" />
                                <p className="text-sm text-muted-foreground">レポート読込中...</p>
                              </div>
                            ) : selectedReportContent ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none [&_table]:text-xs [&_pre]:overflow-x-auto [&_pre]:max-w-full">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {selectedReportContent}
                                </ReactMarkdown>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center h-full py-16">
                                <FileText className="h-10 w-10 text-muted-foreground/50 mb-4" />
                                <p className="text-sm text-muted-foreground">
                                  左のセレクトから仮説を選択してください
                                </p>
                              </div>
                            )}
                          </ScrollArea>
                        </div>
                      </TabsContent>
                      
                      {/* STEP 3 Tab with hypothesis selector */}
                      <TabsContent value="step3Output" className="mt-4 overflow-hidden">
                        <div className="flex flex-col h-[45vh]">
                          <div className="flex items-center gap-2 mb-3">
                            {loadingStep3Reports ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                読込中...
                              </div>
                            ) : getFilteredReports(step3Reports, viewingLoop).length > 0 ? (
                              <Select value={selectedStep3Index} onValueChange={setSelectedStep3Index}>
                                <SelectTrigger className="w-[280px]" data-testid="select-step3-hypothesis">
                                  <SelectValue placeholder="仮説を選択してプレビュー" />
                                </SelectTrigger>
                                <SelectContent>
                                  {getFilteredReports(step3Reports, viewingLoop).map((report) => (
                                    <SelectItem key={report.index} value={report.index.toString()}>
                                      {report.hasError ? (
                                        <span className="flex items-center gap-1 text-destructive">
                                          <XCircle className="h-3 w-3" />
                                          仮説{report.index + 1}: エラー
                                        </span>
                                      ) : (
                                        <>仮説{report.index + 1}: {report.title.slice(0, 30)}...</>
                                      )}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-sm text-muted-foreground">個別レポートがありません</span>
                            )}
                          </div>
                          <ScrollArea className="flex-1 rounded-md border bg-muted/30 p-4">
                            {loadingStep3Content ? (
                              <div className="flex flex-col items-center justify-center h-full py-16">
                                <Loader2 className="h-8 w-8 text-muted-foreground animate-spin mb-4" />
                                <p className="text-sm text-muted-foreground">レポート読込中...</p>
                              </div>
                            ) : step3Content ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none [&_table]:text-xs [&_pre]:overflow-x-auto [&_pre]:max-w-full">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {step3Content}
                                </ReactMarkdown>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center h-full py-16">
                                <FileText className="h-10 w-10 text-muted-foreground/50 mb-4" />
                                <p className="text-sm text-muted-foreground">
                                  左のセレクトから仮説を選択してください
                                </p>
                              </div>
                            )}
                          </ScrollArea>
                        </div>
                      </TabsContent>
                      
                      {/* STEP 4 Tab with hypothesis selector */}
                      <TabsContent value="step4Output" className="mt-4 overflow-hidden">
                        <div className="flex flex-col h-[45vh]">
                          <div className="flex items-center gap-2 mb-3">
                            {loadingStep4Reports ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                読込中...
                              </div>
                            ) : getFilteredReports(step4Reports, viewingLoop).length > 0 ? (
                              <Select value={selectedStep4Index} onValueChange={setSelectedStep4Index}>
                                <SelectTrigger className="w-[280px]" data-testid="select-step4-hypothesis">
                                  <SelectValue placeholder="仮説を選択してプレビュー" />
                                </SelectTrigger>
                                <SelectContent>
                                  {getFilteredReports(step4Reports, viewingLoop).map((report) => (
                                    <SelectItem key={report.index} value={report.index.toString()}>
                                      {report.hasError ? (
                                        <span className="flex items-center gap-1 text-destructive">
                                          <XCircle className="h-3 w-3" />
                                          仮説{report.index + 1}: エラー
                                        </span>
                                      ) : (
                                        <>仮説{report.index + 1}: {report.title.slice(0, 30)}...</>
                                      )}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-sm text-muted-foreground">個別レポートがありません</span>
                            )}
                          </div>
                          <ScrollArea className="flex-1 rounded-md border bg-muted/30 p-4">
                            {loadingStep4Content ? (
                              <div className="flex flex-col items-center justify-center h-full py-16">
                                <Loader2 className="h-8 w-8 text-muted-foreground animate-spin mb-4" />
                                <p className="text-sm text-muted-foreground">レポート読込中...</p>
                              </div>
                            ) : step4Content ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none [&_table]:text-xs [&_pre]:overflow-x-auto [&_pre]:max-w-full">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {step4Content}
                                </ReactMarkdown>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center h-full py-16">
                                <FileText className="h-10 w-10 text-muted-foreground/50 mb-4" />
                                <p className="text-sm text-muted-foreground">
                                  左のセレクトから仮説を選択してください
                                </p>
                              </div>
                            )}
                          </ScrollArea>
                        </div>
                      </TabsContent>
                      
                      {/* STEP 5 Tab - integrated output as table */}
                      <TabsContent value="step5Output" className="mt-4">
                        <div className="h-[45vh] rounded-md border bg-muted/30 overflow-auto">
                          {getStepStatus(5) === "completed" ? (
                            (() => {
                              const tsvContent = selectedRun.step5Output || "";
                              const lines = tsvContent.split("\n").filter(line => line.trim());
                              if (lines.length < 2) {
                                return (
                                  <div className="p-4">
                                    <pre className="text-sm font-mono whitespace-pre-wrap break-words">
                                      {tsvContent || "出力がありません"}
                                    </pre>
                                  </div>
                                );
                              }
                              const headers = lines[0].split("\t");
                              const rows = lines.slice(1).map(line => line.split("\t"));
                              return (
                                <table className="w-max min-w-full text-xs border-collapse">
                                  <thead className="sticky top-0 bg-muted z-10">
                                    <tr>
                                      {headers.map((header, i) => (
                                        <th 
                                          key={`h-${i}`} 
                                          className="border border-border px-2 py-1.5 text-left font-medium whitespace-nowrap bg-muted"
                                        >
                                          {header}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((row, rowIdx) => (
                                      <tr key={`r-${rowIdx}`} className="hover:bg-muted/50">
                                        {row.map((cell, cellIdx) => (
                                          <td 
                                            key={`c-${rowIdx}-${cellIdx}`} 
                                            className="border border-border px-2 py-1 whitespace-nowrap max-w-[300px] truncate"
                                            title={cell}
                                          >
                                            {cell}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              );
                            })()
                          ) : getStepStatus(5) === "running" ? (
                            <div className="flex flex-col items-center justify-center h-full py-16">
                              <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                              <p className="text-sm text-muted-foreground">ステップ 5 を処理中...</p>
                              <p className="text-xs text-muted-foreground mt-1">完了まで数分かかる場合があります</p>
                            </div>
                          ) : getStepStatus(5) === "error" ? (
                            <div className="flex flex-col items-center justify-center h-full py-16">
                              <XCircle className="h-10 w-10 text-destructive mb-4" />
                              <p className="text-sm text-destructive">{selectedRun.errorMessage || "処理中にエラーが発生しました"}</p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full py-16">
                              <Clock className="h-10 w-10 text-muted-foreground/50 mb-4" />
                              <p className="text-sm text-muted-foreground">完了待ち</p>
                              <p className="text-xs text-muted-foreground mt-1">前のステップが完了すると開始されます</p>
                            </div>
                          )}
                        </div>
                      </TabsContent>
                    </Tabs>
                  </>
                );
              })()}
            </>
          )}

          <Separator />
          <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
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
                      <SelectItem key={index} value={`${index}-${entry.step}`}>
                        {entry.step}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(() => {
                const selectedIndex = parseInt(selectedDebugStep.split('-')[0]);
                const selectedEntry = debugPrompts[selectedIndex];
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
