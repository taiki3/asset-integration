import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2, ArrowLeft, Pencil, Trash2, Check, X } from "lucide-react";
import { Link } from "wouter";
import { Header } from "@/components/Header";
import { ExecutionPanel } from "@/components/ExecutionPanel";
import { HistoryPanel } from "@/components/HistoryPanel";
import { HypothesesPanel } from "@/components/HypothesesPanel";
import { RunProgressDisplay } from "@/components/RunProgressDisplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, Resource, HypothesisRun, Hypothesis } from "@shared/schema";

interface ProjectWorkspaceProps {
  projectId: string;
}

export default function ProjectWorkspace({ projectId }: ProjectWorkspaceProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const id = parseInt(projectId);
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: project, isLoading: projectLoading, error: projectError } = useQuery<Project>({
    queryKey: ["/api/projects", id],
  });

  const { data: resources = [], isLoading: resourcesLoading } = useQuery<Resource[]>({
    queryKey: ["/api/projects", id, "resources"],
  });

  const { data: runs = [], isLoading: runsLoading } = useQuery<HypothesisRun[]>({
    queryKey: ["/api/projects", id, "runs"],
    refetchInterval: (query) => {
      const data = query.state.data as HypothesisRun[] | undefined;
      if (data?.some((r) => r.status === "running")) {
        return 2000;
      }
      return false;
    },
  });
  
  const runningRun = runs.find((r) => r.status === "running");
  const pausedRun = runs.find((r) => r.status === "paused");
  const activeRun = runningRun || pausedRun;

  const { data: hypotheses = [], isLoading: hypothesesLoading } = useQuery<Hypothesis[]>({
    queryKey: ["/api/projects", id, "hypotheses"],
    refetchInterval: (query) => {
      if (runs.some((r) => r.status === "running")) {
        return 5000;
      }
      return false;
    },
  });

  const addResourceMutation = useMutation({
    mutationFn: async ({ type, name, content }: { type: string; name: string; content: string }) => {
      const res = await apiRequest("POST", `/api/projects/${id}/resources`, {
        type,
        name,
        content,
        projectId: id,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "resources"] });
      toast({
        title: "リソースを追加しました",
        description: "リソースが正常に追加されました。",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "リソースの追加に失敗しました。もう一度お試しください。",
        variant: "destructive",
      });
    },
  });

  const updateResourceMutation = useMutation({
    mutationFn: async ({ resourceId, name, content }: { resourceId: number; name: string; content: string }) => {
      const res = await apiRequest("PATCH", `/api/projects/${id}/resources/${resourceId}`, { name, content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "resources"] });
      toast({
        title: "リソースを更新しました",
        description: "リソースが正常に更新されました。",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "リソースの更新に失敗しました。もう一度お試しください。",
        variant: "destructive",
      });
    },
  });

  const deleteResourceMutation = useMutation({
    mutationFn: async (resourceId: number) => {
      await apiRequest("DELETE", `/api/projects/${id}/resources/${resourceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "resources"] });
      toast({
        title: "リソースを削除しました",
        description: "リソースが正常に削除されました。",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "リソースの削除に失敗しました。もう一度お試しください。",
        variant: "destructive",
      });
    },
  });

  const importResourcesMutation = useMutation({
    mutationFn: async (resourceIds: number[]) => {
      const res = await apiRequest("POST", `/api/projects/${id}/resources/import`, { resourceIds });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "resources"] });
      toast({
        title: "インポートしました",
        description: `${Array.isArray(data) ? data.length : 0}件のリソースをインポートしました。`,
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "リソースのインポートに失敗しました。もう一度お試しください。",
        variant: "destructive",
      });
    },
  });

  const executeRunMutation = useMutation({
    mutationFn: async ({ targetSpecId, technicalAssetsId, hypothesisCount, loopCount, jobName, existingFilter }: {
      targetSpecId: number;
      technicalAssetsId: number;
      hypothesisCount: number;
      loopCount: number;
      jobName: string;
      existingFilter?: { enabled: boolean; targetSpecIds: number[]; technicalAssetsIds: number[] };
    }) => {
      const res = await apiRequest("POST", `/api/projects/${id}/runs`, {
        projectId: id,
        targetSpecId,
        technicalAssetsId,
        hypothesisCount,
        loopCount,
        jobName,
        existingFilter,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "hypotheses"] });
      toast({
        title: "実行を開始しました",
        description: "G-Methodパイプラインの処理を開始しました。",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "実行の開始に失敗しました。もう一度お試しください。",
        variant: "destructive",
      });
    },
  });

  const reprocessRunMutation = useMutation({
    mutationFn: async (params: {
      uploadedContent: string;
      technicalAssetsId: number;
      hypothesisCount: number;
      modelChoice: "pro" | "flash";
      customPrompt: string;
      jobName: string;
    }) => {
      const res = await apiRequest("POST", `/api/projects/${id}/runs/reprocess`, params);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "hypotheses"] });
      toast({
        title: "再処理を開始しました",
        description: "STEP3以降の処理を開始しました。",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "再処理の開始に失敗しました。もう一度お試しください。",
        variant: "destructive",
      });
    },
  });

  const deleteHypothesisMutation = useMutation({
    mutationFn: async (hypothesisId: number) => {
      await apiRequest("DELETE", `/api/hypotheses/${hypothesisId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "hypotheses"] });
      toast({
        title: "仮説を削除しました",
        description: "仮説がリストから削除されました。",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "仮説の削除に失敗しました。もう一度お試しください。",
        variant: "destructive",
      });
    },
  });

  const pauseRunMutation = useMutation({
    mutationFn: async (runId: number) => {
      await apiRequest("POST", `/api/runs/${runId}/pause`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "runs"] });
      toast({
        title: "一時停止をリクエストしました",
        description: "現在のステップ完了後に一時停止します。",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "一時停止のリクエストに失敗しました。",
        variant: "destructive",
      });
    },
  });

  const resumeRunMutation = useMutation({
    mutationFn: async (runId: number) => {
      await apiRequest("POST", `/api/runs/${runId}/resume`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "runs"] });
      toast({
        title: "再開しました",
        description: "パイプラインの処理を再開しました。",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "再開に失敗しました。",
        variant: "destructive",
      });
    },
  });

  const stopRunMutation = useMutation({
    mutationFn: async (runId: number) => {
      await apiRequest("POST", `/api/runs/${runId}/stop`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "runs"] });
      toast({
        title: "停止しました",
        description: "パイプラインの処理を停止しました。",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "停止に失敗しました。",
        variant: "destructive",
      });
    },
  });

  const handleAddResource = async (type: "target_spec" | "technical_assets", name: string, content: string) => {
    await addResourceMutation.mutateAsync({ type, name, content });
  };

  const handleUpdateResource = async (resourceId: number, name: string, content: string) => {
    await updateResourceMutation.mutateAsync({ resourceId, name, content });
  };

  const handleDeleteResource = (resourceId: number) => {
    deleteResourceMutation.mutate(resourceId);
  };

  const handleImportResources = async (resourceIds: number[]) => {
    await importResourcesMutation.mutateAsync(resourceIds);
  };

  const handleExecute = (
    targetSpecId: number,
    technicalAssetsId: number,
    hypothesisCount: number,
    loopCount: number,
    jobName: string,
    existingFilter?: { enabled: boolean; targetSpecIds: number[]; technicalAssetsIds: number[] }
  ) => {
    executeRunMutation.mutate({ targetSpecId, technicalAssetsId, hypothesisCount, loopCount, jobName, existingFilter });
  };

  const handleReprocessExecute = (params: {
    uploadedContent: string;
    technicalAssetsId: number;
    hypothesisCount: number;
    modelChoice: "pro" | "flash";
    customPrompt: string;
    jobName: string;
  }) => {
    reprocessRunMutation.mutate(params);
  };

  const handleDeleteHypothesis = (hypothesisId: number) => {
    deleteHypothesisMutation.mutate(hypothesisId);
  };

  const handleDownloadTSV = async (runId: number) => {
    try {
      const response = await fetch(`/api/runs/${runId}/download?format=tsv`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hypothesis-run-${runId}.tsv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "エラー",
        description: "TSVファイルのダウンロードに失敗しました。",
        variant: "destructive",
      });
    }
  };

  const handleDownloadExcel = async (runId: number) => {
    try {
      const response = await fetch(`/api/runs/${runId}/download?format=xlsx`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hypothesis-run-${runId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "エラー",
        description: "Excelファイルのダウンロードに失敗しました。",
        variant: "destructive",
      });
    }
  };

  const handleDownloadStep2Word = async (runId: number) => {
    try {
      const response = await fetch(`/api/runs/${runId}/download-step2-word`);
      if (!response.ok) {
        throw new Error("Download failed");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `step2-report-${runId}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "エラー",
        description: "Wordファイルのダウンロードに失敗しました。",
        variant: "destructive",
      });
    }
  };

  const resumeInterruptedMutation = useMutation({
    mutationFn: async (runId: number) => {
      const res = await apiRequest("POST", `/api/runs/${runId}/resume-interrupted`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "runs"] });
      toast({
        title: "再開しました",
        description: data.message || "パイプラインを再開しました。",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "パイプラインの再開に失敗しました。",
        variant: "destructive",
      });
    },
  });

  const handleResumeInterrupted = (runId: number) => {
    resumeInterruptedMutation.mutate(runId);
  };

  const updateProjectMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("PATCH", `/api/projects/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      setIsEditingName(false);
      toast({
        title: "プロジェクト名を変更しました",
        description: "プロジェクト名が正常に更新されました。",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "プロジェクト名の変更に失敗しました。",
        variant: "destructive",
      });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowDeleteDialog(false);
      toast({
        title: "プロジェクトを削除しました",
        description: "プロジェクトが正常に削除されました。",
      });
      navigate("/");
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "プロジェクトの削除に失敗しました。",
        variant: "destructive",
      });
    },
  });

  const handleStartEditName = () => {
    if (project) {
      setEditedName(project.name);
      setIsEditingName(true);
    }
  };

  const handleSaveName = () => {
    if (editedName.trim()) {
      updateProjectMutation.mutate(editedName.trim());
    }
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditedName("");
  };

  const handleDeleteProject = () => {
    deleteProjectMutation.mutate();
  };

  const handleDownloadIndividualReport = async (runId: number, hypothesisIndex: number) => {
    try {
      const response = await fetch(`/api/runs/${runId}/download-individual-report/${hypothesisIndex}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Download failed" }));
        throw new Error(errorData.error || "Download failed");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hypothesis-${hypothesisIndex + 1}-report-run${runId}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "ダウンロード完了",
        description: `仮説${hypothesisIndex + 1}のレポートをダウンロードしました。`,
      });
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "個別レポートのダウンロードに失敗しました。",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (projectError) {
      navigate("/");
    }
  }, [projectError, navigate]);

  if (projectLoading || resourcesLoading || runsLoading || hypothesesLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <h2 className="text-xl font-medium mb-2">プロジェクトが見つかりません</h2>
            <p className="text-muted-foreground mb-6">
              お探しのプロジェクトは存在しないか、削除されています。
            </p>
            <Link href="/">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                ダッシュボードに戻る
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const targetSpecs = resources.filter((r) => r.type === "target_spec");
  const technicalAssets = resources.filter((r) => r.type === "technical_assets");
  const isExecuting = runs.some((r) => r.status === "running");
  const sortedRuns = [...runs].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header project={project} />
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-6 py-6 flex flex-col overflow-auto">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="text-2xl font-medium h-10 w-80"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") handleCancelEditName();
                  }}
                  data-testid="input-project-name"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleSaveName}
                  disabled={updateProjectMutation.isPending || !editedName.trim()}
                  data-testid="button-save-project-name"
                >
                  {updateProjectMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCancelEditName}
                  disabled={updateProjectMutation.isPending}
                  data-testid="button-cancel-edit-name"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-medium" data-testid="text-project-title">
                  {project.name}
                </h1>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleStartEditName}
                  data-testid="button-edit-project-name"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowDeleteDialog(true)}
                  data-testid="button-delete-project"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
          {project.description && (
            <p className="text-muted-foreground mt-1" data-testid="text-project-desc">
              {project.description}
            </p>
          )}
        </div>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>プロジェクトを削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                本当に「{project.name}」を削除してよろしいですか？この操作は取り消せません。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">キャンセル</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteProject}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteProjectMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteProjectMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                削除する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {activeRun && (
          <div className="mb-6">
            <RunProgressDisplay
              currentStep={activeRun.currentStep || 2}
              currentLoop={activeRun.currentLoop || 1}
              totalLoops={activeRun.totalLoops || 1}
              progressInfo={activeRun.progressInfo as any}
              status={activeRun.status}
              runCreatedAt={activeRun.createdAt instanceof Date ? activeRun.createdAt.toISOString() : activeRun.createdAt}
              runId={activeRun.id}
              onPause={(runId) => pauseRunMutation.mutate(runId)}
              onResume={(runId) => resumeRunMutation.mutate(runId)}
              onStop={(runId) => stopRunMutation.mutate(runId)}
              isPauseRequested={pauseRunMutation.isPending}
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:h-[calc(100vh-18rem)]">
          <div className="min-h-[400px] lg:min-h-0 lg:h-full">
            <ExecutionPanel
              targetSpecs={targetSpecs}
              technicalAssets={technicalAssets}
              hypotheses={hypotheses}
              projectId={Number(id) || 0}
              onExecute={handleExecute}
              onReprocessExecute={handleReprocessExecute}
              onAddResource={handleAddResource}
              onUpdateResource={handleUpdateResource}
              onDeleteResource={handleDeleteResource}
              onImportResources={handleImportResources}
              isExecuting={isExecuting || executeRunMutation.isPending || reprocessRunMutation.isPending}
              isPending={addResourceMutation.isPending}
            />
          </div>
          <div className="min-h-[300px] lg:min-h-0 lg:h-full">
            <HistoryPanel
              runs={sortedRuns}
              resources={resources}
              onDownloadTSV={handleDownloadTSV}
              onDownloadExcel={handleDownloadExcel}
              onDownloadStep2Word={handleDownloadStep2Word}
              onDownloadIndividualReport={handleDownloadIndividualReport}
              onResumeInterrupted={handleResumeInterrupted}
              isResuming={resumeInterruptedMutation.isPending}
            />
          </div>
        </div>

        <div className="mt-6 shrink-0">
          <HypothesesPanel
            hypotheses={hypotheses}
            resources={resources}
            projectId={Number(id) || 0}
            onDelete={handleDeleteHypothesis}
            onDownloadWord={handleDownloadIndividualReport}
          />
        </div>
      </main>
    </div>
  );
}
