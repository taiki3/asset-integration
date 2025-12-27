import { useQuery, useMutation } from "@tanstack/react-query";
import { FolderOpen, Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { ProjectCard } from "@/components/ProjectCard";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@shared/schema";

export default function Dashboard() {
  const { toast } = useToast();

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const createProjectMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const res = await apiRequest("POST", "/api/projects", { name, description });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "プロジェクトを作成しました",
        description: "新しいプロジェクトが正常に作成されました。",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "プロジェクトの作成に失敗しました。もう一度お試しください。",
        variant: "destructive",
      });
    },
  });

  const handleCreateProject = (name: string, description: string) => {
    createProjectMutation.mutate({ name, description });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-light tracking-tight" data-testid="text-dashboard-title">
              プロジェクト
            </h1>
            <p className="text-muted-foreground mt-1">
              G-Method仮説生成プロジェクトを管理
            </p>
          </div>
          <CreateProjectDialog
            onCreateProject={handleCreateProject}
            isPending={createProjectMutation.isPending}
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full bg-muted p-6 mb-6">
              <FolderOpen className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-medium mb-2">プロジェクトがありません</h2>
            <p className="text-muted-foreground mb-6 max-w-sm">
              最初のプロジェクトを作成して、G-Methodでビジネス仮説の生成を始めましょう
            </p>
            <CreateProjectDialog
              onCreateProject={handleCreateProject}
              isPending={createProjectMutation.isPending}
            />
          </div>
        )}
      </main>
    </div>
  );
}
