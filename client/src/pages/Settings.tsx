import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Save, RotateCcw, Check } from "lucide-react";
import { Link } from "wouter";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { PromptVersion } from "@shared/schema";
import { PromptManual } from "@/components/PromptManual";

interface PromptData {
  stepNumber: number;
  versions: PromptVersion[];
  activeVersion: number | null;
  activeId: number | null;
  defaultPrompt: string;
}

const STEP_NAMES: Record<number, string> = {
  21: "Step 2-1: 発散・選定フェーズ",
  22: "Step 2-2: 収束・深掘りフェーズ",
  2: "Step 2: 仮説提案（レガシー）",
  3: "Step 3: 科学的評価",
  4: "Step 4: 戦略監査",
  5: "Step 5: 統合出力",
};

export default function Settings() {
  const { toast } = useToast();
  const [selectedStep, setSelectedStep] = useState<number>(21);
  const [editContent, setEditContent] = useState<string>("");
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");

  const { data: promptData, isLoading } = useQuery<PromptData>({
    queryKey: [`/api/prompts/${selectedStep}`],
  });

  useEffect(() => {
    if (promptData) {
      const activeVersion = promptData.versions.find(v => v.isActive === 1);
      if (activeVersion) {
        setEditContent(activeVersion.content);
      } else {
        setEditContent(promptData.defaultPrompt);
      }
      setSelectedVersionId("");
    }
  }, [promptData]);

  const createMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/prompts/${selectedStep}`, { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/prompts/${selectedStep}`] });
      toast({
        title: "プロンプトを保存しました",
        description: "新しいバージョンが作成され、適用されました。",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "プロンプトの保存に失敗しました。",
        variant: "destructive",
      });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/prompts/${selectedStep}/activate/${id}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/prompts/${selectedStep}`] });
      toast({
        title: "バージョンを適用しました",
        description: "選択したバージョンが有効になりました。",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "バージョンの適用に失敗しました。",
        variant: "destructive",
      });
    },
  });

  const handleStepChange = (step: string) => {
    setSelectedStep(parseInt(step));
    setEditContent("");
    setSelectedVersionId("");
  };

  const handleSave = () => {
    if (!editContent.trim()) {
      toast({
        title: "エラー",
        description: "プロンプトを入力してください。",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(editContent);
  };

  const handleActivateVersion = () => {
    if (selectedVersionId) {
      activateMutation.mutate(parseInt(selectedVersionId));
    }
  };

  const handleLoadVersion = (versionId: string) => {
    setSelectedVersionId(versionId);
    if (versionId === "default") {
      setEditContent(promptData?.defaultPrompt || "");
    } else {
      const version = promptData?.versions.find(v => v.id.toString() === versionId);
      if (version) {
        setEditContent(version.content);
      }
    }
  };

  const currentPrompt = promptData?.activeId
    ? promptData.versions.find(v => v.id === promptData.activeId)?.content
    : promptData?.defaultPrompt;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back-dashboard">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-light tracking-tight" data-testid="text-settings-title">
                設定
              </h1>
              <p className="text-muted-foreground mt-1">
                G-Methodパイプラインのプロンプトを管理
              </p>
            </div>
          </div>
          <PromptManual />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">ステップ選択</CardTitle>
              <CardDescription>編集するステップを選択</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedStep.toString()} onValueChange={handleStepChange}>
                <SelectTrigger data-testid="select-step">
                  <SelectValue placeholder="ステップを選択" />
                </SelectTrigger>
                <SelectContent>
                  {[21, 22, 3, 4, 5].map(step => (
                    <SelectItem key={step} value={step.toString()}>
                      {STEP_NAMES[step]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {promptData && promptData.versions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">バージョン履歴</p>
                  <Select value={selectedVersionId} onValueChange={handleLoadVersion}>
                    <SelectTrigger data-testid="select-version">
                      <SelectValue placeholder="バージョンを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">デフォルト（組み込み）</SelectItem>
                      {promptData.versions.map(v => (
                        <SelectItem key={v.id} value={v.id.toString()}>
                          v{v.version} - {format(new Date(v.createdAt), "yyyy/MM/dd HH:mm")}
                          {v.isActive === 1 && " (適用中)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedVersionId && selectedVersionId !== "default" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={handleActivateVersion}
                      disabled={activateMutation.isPending || promptData.versions.find(v => v.id.toString() === selectedVersionId)?.isActive === 1}
                      data-testid="button-apply-version"
                    >
                      <RotateCcw className="h-4 w-4" />
                      このバージョンを適用
                    </Button>
                  )}
                </div>
              )}

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  現在の適用状況:
                </p>
                <Badge variant="secondary" className="mt-1">
                  {promptData?.activeVersion ? `v${promptData.activeVersion}` : "デフォルト"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">{STEP_NAMES[selectedStep]}</CardTitle>
                  <CardDescription>プロンプトを編集して保存</CardDescription>
                </div>
                <Button
                  onClick={handleSave}
                  disabled={createMutation.isPending || !editContent.trim()}
                  className="gap-2"
                  data-testid="button-save-prompt"
                >
                  <Save className="h-4 w-4" />
                  {createMutation.isPending ? "保存中..." : "保存して適用"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                  読み込み中...
                </div>
              ) : (
                <>
                  <Textarea
                    value={editContent || currentPrompt || ""}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="プロンプトを入力..."
                    className="font-mono text-sm min-h-[400px]"
                    data-testid="textarea-prompt"
                  />
                  <p className="text-xs text-muted-foreground">
                    保存すると新しいバージョンが作成され、自動的に適用されます。
                    過去のバージョンはいつでもロールバック可能です。
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
