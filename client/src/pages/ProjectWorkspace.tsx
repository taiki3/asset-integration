import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Header } from "@/components/Header";
import { ExecutionPanel } from "@/components/ExecutionPanel";
import { HistoryPanel } from "@/components/HistoryPanel";
import { HypothesesPanel } from "@/components/HypothesesPanel";
import { RunProgressDisplay } from "@/components/RunProgressDisplay";
import { Button } from "@/components/ui/button";
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

  const executeRunMutation = useMutation({
    mutationFn: async ({ targetSpecId, technicalAssetsId, hypothesisCount, loopCount }: { targetSpecId: number; technicalAssetsId: number; hypothesisCount: number; loopCount: number }) => {
      const res = await apiRequest("POST", `/api/projects/${id}/runs`, {
        projectId: id,
        targetSpecId,
        technicalAssetsId,
        hypothesisCount,
        loopCount,
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

  const handleAddResource = (type: "target_spec" | "technical_assets", name: string, content: string) => {
    addResourceMutation.mutate({ type, name, content });
  };

  const handleDeleteResource = (resourceId: number) => {
    deleteResourceMutation.mutate(resourceId);
  };

  const handleExecute = (targetSpecId: number, technicalAssetsId: number, hypothesisCount: number, loopCount: number) => {
    executeRunMutation.mutate({ targetSpecId, technicalAssetsId, hypothesisCount, loopCount });
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
      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-medium" data-testid="text-project-title">
            {project.name}
          </h1>
          {project.description && (
            <p className="text-muted-foreground mt-1" data-testid="text-project-desc">
              {project.description}
            </p>
          )}
        </div>

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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[400px] lg:h-[calc(100vh-20rem)]">
          <div className="lg:col-span-1 min-h-0">
            <ExecutionPanel
              targetSpecs={targetSpecs}
              technicalAssets={technicalAssets}
              onExecute={handleExecute}
              onAddResource={handleAddResource}
              onDeleteResource={handleDeleteResource}
              isExecuting={isExecuting || executeRunMutation.isPending}
              isPending={addResourceMutation.isPending}
            />
          </div>
          <div className="lg:col-span-1 min-h-0">
            <HistoryPanel
              runs={sortedRuns}
              resources={resources}
              onDownloadTSV={handleDownloadTSV}
              onDownloadExcel={handleDownloadExcel}
            />
          </div>
        </div>

        <div className="mt-6">
          <HypothesesPanel
            hypotheses={hypotheses}
            onDelete={handleDeleteHypothesis}
          />
        </div>
      </main>
    </div>
  );
}
