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
import type { HypothesisRun, Resource } from "@shared/schema";

interface HistoryPanelProps {
  runs: HypothesisRun[];
  resources: Resource[];
  onDownloadTSV: (runId: number) => void;
  onDownloadExcel: (runId: number) => void;
}

const statusConfig = {
  pending: { label: "Pending", icon: Clock, variant: "secondary" as const },
  running: { label: "Processing", icon: Loader2, variant: "default" as const, animate: true },
  completed: { label: "Completed", icon: CheckCircle, variant: "default" as const },
  error: { label: "Error", icon: XCircle, variant: "destructive" as const },
};

export function HistoryPanel({ runs, resources, onDownloadTSV, onDownloadExcel }: HistoryPanelProps) {
  const [selectedRun, setSelectedRun] = useState<HypothesisRun | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const getResourceName = (id: number) => {
    return resources.find((r) => r.id === id)?.name || "Unknown";
  };

  const handleRunClick = (run: HypothesisRun) => {
    setSelectedRun(run);
    setDetailsOpen(true);
  };

  const stepLabels = [
    { key: "step2Output", label: "Step 2: Proposal", step: 2 },
    { key: "step3Output", label: "Step 3: Scientific Evaluation", step: 3 },
    { key: "step4Output", label: "Step 4: Strategic Audit", step: 4 },
    { key: "step5Output", label: "Step 5: Integration", step: 5 },
  ] as const;

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <History className="h-5 w-5" />
            Execution History
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          <ScrollArea className="h-full pr-3">
            {runs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <History className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-sm text-muted-foreground">
                  No executions yet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Run the G-Method to generate hypotheses
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
                          <Badge size="sm" variant={status.variant} className="gap-1">
                            <StatusIcon className={`h-3 w-3 ${status.animate ? "animate-spin" : ""}`} />
                            {status.label}
                          </Badge>
                          {run.currentStep && run.currentStep > 0 && run.status === "running" && (
                            <span className="text-xs text-muted-foreground">
                              Step {run.currentStep}/5
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {getResourceName(run.targetSpecId)} × {getResourceName(run.technicalAssetsId)}
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
              Execution Details
            </DialogTitle>
            <DialogDescription>
              {selectedRun && (
                <>
                  {getResourceName(selectedRun.targetSpecId)} × {getResourceName(selectedRun.technicalAssetsId)} •{" "}
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
                <Tabs defaultValue="step5Output" className="flex-1">
                  <TabsList className="grid w-full grid-cols-4">
                    {stepLabels.map(({ key, label, step }) => (
                      <TabsTrigger key={key} value={key} disabled={!selectedRun[key]}>
                        Step {step}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {stepLabels.map(({ key, label }) => (
                    <TabsContent key={key} value={key} className="mt-4">
                      <ScrollArea className="h-[45vh] rounded-md border bg-muted/30 p-4">
                        <pre className="text-sm font-mono whitespace-pre-wrap break-words">
                          {selectedRun[key] || "No output available"}
                        </pre>
                      </ScrollArea>
                    </TabsContent>
                  ))}
                </Tabs>
              )}

              {selectedRun.status === "running" && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                  <p className="text-sm text-muted-foreground">
                    Processing Step {selectedRun.currentStep || 2} of 5...
                  </p>
                </div>
              )}

              {selectedRun.status === "error" && (
                <div className="flex flex-col items-center justify-center py-12">
                  <XCircle className="h-12 w-12 text-destructive mb-4" />
                  <p className="text-sm text-destructive">
                    {selectedRun.errorMessage || "An error occurred during processing"}
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
                  Download TSV
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => onDownloadExcel(selectedRun.id)}
                  data-testid="button-download-excel"
                >
                  <Download className="h-4 w-4" />
                  Download Excel
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
