'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, Pencil, Trash2, Check, X } from 'lucide-react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { ExecutionPanel } from './execution-panel';
import { HistoryPanel } from './history-panel';
import { HypothesesPanel } from './hypotheses-panel';
import { RunProgressDisplay } from './run-progress-display';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Project, Resource, Run, Hypothesis } from '@/lib/db/schema';

interface ProjectWorkspaceProps {
  project: Project;
  initialResources: Resource[];
  initialRuns: Run[];
}

export function ProjectWorkspace({ project, initialResources, initialRuns }: ProjectWorkspaceProps) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fetch resources with real-time updates
  const { data: resources = initialResources } = useQuery<Resource[]>({
    queryKey: ['projects', project.id, 'resources'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/resources`);
      if (!res.ok) throw new Error('Failed to fetch resources');
      return res.json();
    },
    initialData: initialResources,
  });

  // Fetch runs with real-time updates
  const { data: runs = initialRuns } = useQuery<Run[]>({
    queryKey: ['projects', project.id, 'runs'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/runs`);
      if (!res.ok) throw new Error('Failed to fetch runs');
      return res.json();
    },
    initialData: initialRuns,
    refetchInterval: (query) => {
      const data = query.state.data as Run[] | undefined;
      if (data?.some((r) => r.status === 'running')) {
        return 2000;
      }
      return false;
    },
  });

  // Fetch hypotheses
  const { data: hypotheses = [] } = useQuery<Hypothesis[]>({
    queryKey: ['projects', project.id, 'hypotheses'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/hypotheses`);
      if (!res.ok) throw new Error('Failed to fetch hypotheses');
      return res.json();
    },
    refetchInterval: runs.some((r) => r.status === 'running') ? 5000 : false,
  });

  const updateProjectMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('Failed to update project');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', project.id] });
      setIsEditingName(false);
      toast({
        title: 'プロジェクト名を変更しました',
        description: 'プロジェクト名が正常に更新されました。',
      });
    },
    onError: () => {
      toast({
        title: 'エラー',
        description: 'プロジェクト名の変更に失敗しました。',
        variant: 'destructive',
      });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete project');
    },
    onSuccess: () => {
      toast({
        title: 'プロジェクトを削除しました',
        description: 'プロジェクトが正常に削除されました。',
      });
      router.push('/');
    },
    onError: () => {
      toast({
        title: 'エラー',
        description: 'プロジェクトの削除に失敗しました。',
        variant: 'destructive',
      });
    },
  });

  const handleStartEditName = () => {
    setEditedName(project.name);
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    if (editedName.trim()) {
      updateProjectMutation.mutate(editedName.trim());
    }
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditedName('');
  };

  const handleDeleteProject = () => {
    deleteProjectMutation.mutate();
  };

  // Resource mutations
  const addResourceMutation = useMutation({
    mutationFn: async ({ type, name, content }: { type: string; name: string; content: string }) => {
      const res = await fetch(`/api/projects/${project.id}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name, content }),
      });
      if (!res.ok) throw new Error('Failed to add resource');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'resources'] });
      toast({
        title: 'リソースを追加しました',
        description: 'リソースが正常に追加されました。',
      });
    },
    onError: () => {
      toast({
        title: 'エラー',
        description: 'リソースの追加に失敗しました。',
        variant: 'destructive',
      });
    },
  });

  const updateResourceMutation = useMutation({
    mutationFn: async ({ id, name, content }: { id: number; name: string; content: string }) => {
      const res = await fetch(`/api/projects/${project.id}/resources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content }),
      });
      if (!res.ok) throw new Error('Failed to update resource');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'resources'] });
      toast({
        title: 'リソースを更新しました',
        description: 'リソースが正常に更新されました。',
      });
    },
    onError: () => {
      toast({
        title: 'エラー',
        description: 'リソースの更新に失敗しました。',
        variant: 'destructive',
      });
    },
  });

  const deleteResourceMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/projects/${project.id}/resources/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete resource');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'resources'] });
      toast({
        title: 'リソースを削除しました',
        description: 'リソースが正常に削除されました。',
      });
    },
    onError: () => {
      toast({
        title: 'エラー',
        description: 'リソースの削除に失敗しました。',
        variant: 'destructive',
      });
    },
  });

  // Run mutations
  const executeRunMutation = useMutation({
    mutationFn: async (params: any) => {
      const res = await fetch(`/api/projects/${project.id}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Failed to execute run');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'runs'] });
      queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'hypotheses'] });
      toast({
        title: '実行を開始しました',
        description: 'ASIPパイプラインの処理を開始しました。',
      });
    },
    onError: () => {
      toast({
        title: 'エラー',
        description: '実行の開始に失敗しました。',
        variant: 'destructive',
      });
    },
  });
  
  const reprocessRunMutation = useMutation({
    mutationFn: async (params: any) => {
      const res = await fetch(`/api/projects/${project.id}/runs/reprocess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Failed to execute reprocess');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'runs'] });
      queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'hypotheses'] });
      toast({
        title: '再処理を開始しました',
        description: 'データの再処理を開始しました。',
      });
    },
    onError: () => {
      toast({
        title: 'エラー',
        description: '再処理の開始に失敗しました。',
        variant: 'destructive',
      });
    },
  });

  const pauseRunMutation = useMutation({
    mutationFn: async (runId: number) => {
      const res = await fetch(`/api/runs/${runId}/pause`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to pause run');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'runs'] });
      toast({
        title: '一時停止しました',
        description: 'パイプラインの処理を一時停止しました。',
      });
    },
  });

  const resumeRunMutation = useMutation({
    mutationFn: async (runId: number) => {
      const res = await fetch(`/api/runs/${runId}/resume`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to resume run');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'runs'] });
      toast({
        title: '再開しました',
        description: 'パイプラインの処理を再開しました。',
      });
    },
  });

  const stopRunMutation = useMutation({
    mutationFn: async (runId: number) => {
      const res = await fetch(`/api/runs/${runId}/stop`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to stop run');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'runs'] });
      toast({
        title: '停止しました',
        description: 'パイプラインの処理を停止しました。',
      });
    },
  });

  // Hypothesis mutations
  const deleteHypothesisMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/hypotheses/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete hypothesis');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', project.id, 'hypotheses'] });
      toast({
        title: '仮説を削除しました',
        description: '仮説が正常に削除されました。',
      });
    },
    onError: () => {
      toast({
        title: 'エラー',
        description: '仮説の削除に失敗しました。',
        variant: 'destructive',
      });
    },
  });

  // Handler functions
  const handleAddResource = async (type: 'target_spec' | 'technical_assets', name: string, content: string) => {
    await addResourceMutation.mutateAsync({ type, name, content });
  };

  const handleUpdateResource = async (id: number, name: string, content: string) => {
    await updateResourceMutation.mutateAsync({ id, name, content });
  };

  const handleDeleteResource = (id: number) => {
    deleteResourceMutation.mutate(id);
  };

  const handleImportResources = async (resourceIds: number[]) => {
    // TODO: Implement import resources
    console.log('Import resources:', resourceIds);
  };

  const handleExecute = (params: any) => {
    executeRunMutation.mutate(params);
  };
  
  const handleReprocessExecute = (params: any) => {
    reprocessRunMutation.mutate(params);
  };

  const handleDeleteHypothesis = (id: number) => {
    deleteHypothesisMutation.mutate(id);
  };

  const handleDownloadTSV = async (runId: number) => {
    try {
      const res = await fetch(`/api/runs/${runId}/download?format=tsv`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `run-${runId}.tsv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: 'エラー',
        description: 'TSVファイルのダウンロードに失敗しました。',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadExcel = async (runId: number) => {
    try {
      const res = await fetch(`/api/runs/${runId}/download?format=xlsx`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `run-${runId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: 'エラー',
        description: 'Excelファイルのダウンロードに失敗しました。',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadStep2Word = async (runId: number) => {
    try {
      const res = await fetch(`/api/runs/${runId}/download-step2-word`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `step2-run-${runId}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: 'エラー',
        description: 'Wordファイルのダウンロードに失敗しました。',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadIndividualReport = async (runId: number, hypothesisIndex: number) => {
    try {
      const res = await fetch(`/api/runs/${runId}/download-individual/${hypothesisIndex}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hypothesis-${hypothesisIndex + 1}-run-${runId}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: 'エラー',
        description: '個別レポートのダウンロードに失敗しました。',
        variant: 'destructive',
      });
    }
  };

  const runningRun = runs.find((r) => r.status === 'running');
  const pausedRun = runs.find((r) => r.status === 'paused');
  const activeRun = runningRun || pausedRun;

  const targetSpecs = resources.filter((r) => r.type === 'target_spec');
  const technicalAssets = resources.filter((r) => r.type === 'technical_assets');
  const isExecuting = runs.some((r) => r.status === 'running');
  const sortedRuns = [...runs].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
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
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') handleCancelEditName();
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleSaveName}
                  disabled={updateProjectMutation.isPending || !editedName.trim()}
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
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-medium">{project.name}</h1>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleStartEditName}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
          {project.description && (
            <p className="text-muted-foreground mt-1">{project.description}</p>
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
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteProject}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteProjectMutation.isPending}
              >
                {deleteProjectMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                削除する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {activeRun && (
          <div className="mb-6">
            <RunProgressDisplay
              run={activeRun}
              onPause={(runId) => pauseRunMutation.mutate(runId)}
              onResume={(runId) => resumeRunMutation.mutate(runId)}
              onStop={(runId) => stopRunMutation.mutate(runId)}
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:h-[calc(100vh-18rem)]">
          <div className="min-h-[400px] lg:min-h-0 lg:h-full">
            <ExecutionPanel
              targetSpecs={targetSpecs}
              technicalAssets={technicalAssets}
              hypotheses={hypotheses}
              projectId={project.id}
              onExecute={handleExecute}
              onReprocessExecute={handleReprocessExecute}
              onAddResource={handleAddResource}
              onUpdateResource={handleUpdateResource}
              onDeleteResource={handleDeleteResource}
              onImportResources={handleImportResources}
              isExecuting={isExecuting || reprocessRunMutation.isPending}
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
            />
          </div>
        </div>

        <div className="mt-6 shrink-0">
          <HypothesesPanel
            hypotheses={hypotheses}
            resources={resources}
            projectId={project.id}
            onDelete={handleDeleteHypothesis}
            onDownloadWord={handleDownloadIndividualReport}
          />
        </div>
      </main>
    </div>
  );
}