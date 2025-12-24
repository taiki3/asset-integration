import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Header } from "@/components/Header";
import { ResourcePanel } from "@/components/ResourcePanel";
import { ExecutionPanel } from "@/components/ExecutionPanel";
import { HistoryPanel } from "@/components/HistoryPanel";
import { Button } from "@/components/ui/button";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, Resource, HypothesisRun } from "@shared/schema";

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
        return 3000;
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
        title: "Resource added",
        description: "The resource has been added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add resource. Please try again.",
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
        title: "Resource deleted",
        description: "The resource has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete resource. Please try again.",
        variant: "destructive",
      });
    },
  });

  const executeRunMutation = useMutation({
    mutationFn: async ({ targetSpecId, technicalAssetsId }: { targetSpecId: number; technicalAssetsId: number }) => {
      const res = await apiRequest("POST", `/api/projects/${id}/runs`, {
        projectId: id,
        targetSpecId,
        technicalAssetsId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "runs"] });
      toast({
        title: "Execution started",
        description: "The G-Method pipeline has started processing.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start execution. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddResource = (type: "target_spec" | "technical_assets", name: string, content: string) => {
    addResourceMutation.mutate({ type, name, content });
  };

  const handleDeleteResource = (resourceId: number) => {
    if (window.confirm("Are you sure you want to delete this resource?")) {
      deleteResourceMutation.mutate(resourceId);
    }
  };

  const handleExecute = (targetSpecId: number, technicalAssetsId: number) => {
    executeRunMutation.mutate({ targetSpecId, technicalAssetsId });
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
        title: "Error",
        description: "Failed to download TSV file.",
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
        title: "Error",
        description: "Failed to download Excel file.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (projectError) {
      navigate("/");
    }
  }, [projectError, navigate]);

  if (projectLoading || resourcesLoading || runsLoading) {
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
            <h2 className="text-xl font-medium mb-2">Project not found</h2>
            <p className="text-muted-foreground mb-6">
              The project you're looking for doesn't exist or has been deleted.
            </p>
            <Link href="/">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-12rem)]">
          <div className="lg:col-span-1 min-h-0">
            <ResourcePanel
              targetSpecs={targetSpecs}
              technicalAssets={technicalAssets}
              onAddResource={handleAddResource}
              onDeleteResource={handleDeleteResource}
              isPending={addResourceMutation.isPending}
            />
          </div>
          <div className="lg:col-span-1 min-h-0">
            <ExecutionPanel
              targetSpecs={targetSpecs}
              technicalAssets={technicalAssets}
              onExecute={handleExecute}
              isExecuting={isExecuting || executeRunMutation.isPending}
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
      </main>
    </div>
  );
}
