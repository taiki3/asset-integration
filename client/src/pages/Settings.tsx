import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Save, RotateCcw, Check, Download, FileText, Paperclip } from "lucide-react";
import { Link } from "wouter";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { PromptVersion } from "@shared/schema";
import { PromptManual } from "@/components/PromptManual";

interface ExportedPrompt {
  stepNumber: number;
  stepName: string;
  isCustom: boolean;
  version: number | null;
  content: string;
}

interface AvailableFile {
  id: string;
  name: string;
  description: string;
  category: 'input' | 'step_output';
}

interface FileAttachmentData {
  stepNumber: number;
  availableFiles: AvailableFile[];
  attachedFiles: string[];
}

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

  const { data: fileAttachmentData, isLoading: isLoadingAttachments } = useQuery<FileAttachmentData>({
    queryKey: ['/api/file-attachments', selectedStep],
    queryFn: async () => {
      const res = await fetch(`/api/file-attachments/${selectedStep}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const updateAttachmentsMutation = useMutation({
    mutationFn: async (attachedFiles: string[]) => {
      const res = await apiRequest("PUT", `/api/file-attachments/${selectedStep}`, { attachedFiles });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/file-attachments', selectedStep] });
      toast({
        title: "添付ファイル設定を保存しました",
      });
    },
    onError: () => {
      toast({
        title: "エラー",
        description: "添付ファイル設定の保存に失敗しました。",
        variant: "destructive",
      });
    },
  });

  const handleToggleFileAttachment = (fileId: string) => {
    const currentAttached = fileAttachmentData?.attachedFiles || [];
    const newAttached = currentAttached.includes(fileId)
      ? currentAttached.filter(id => id !== fileId)
      : [...currentAttached, fileId];
    updateAttachmentsMutation.mutate(newAttached);
  };

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

  const [isExporting, setIsExporting] = useState(false);

  const handleExportPrompts = async () => {
    setIsExporting(true);
    try {
      const res = await apiRequest("GET", "/api/prompts/export");
      const prompts: ExportedPrompt[] = await res.json();
      
      const lines: string[] = [];
      lines.push("# G-Method カスタムプロンプト一覧");
      lines.push("");
      lines.push(`エクスポート日時: ${format(new Date(), "yyyy/MM/dd HH:mm:ss")}`);
      lines.push("");
      lines.push("---");
      lines.push("");

      for (const prompt of prompts) {
        lines.push(`## ${prompt.stepName}`);
        lines.push("");
        if (prompt.isCustom) {
          lines.push(`> カスタムプロンプト（v${prompt.version}）を使用中`);
        } else {
          lines.push("> デフォルトプロンプトを使用中");
        }
        lines.push("");
        lines.push("```");
        lines.push(prompt.content);
        lines.push("```");
        lines.push("");
        lines.push("---");
        lines.push("");
      }

      const content = lines.join("\n");
      const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gmethod-prompts-${format(new Date(), "yyyyMMdd-HHmmss")}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "エクスポート完了",
        description: "プロンプト一覧をMarkdownファイルでダウンロードしました。",
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "エラー",
        description: "プロンプトのエクスポートに失敗しました。",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleExportPrompts}
              disabled={isExporting}
              data-testid="button-export-prompts"
            >
              <Download className="h-4 w-4" />
              {isExporting ? "エクスポート中..." : "プロンプト一覧"}
            </Button>
            <PromptManual />
          </div>
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
                  <div className="border rounded-md p-4 bg-muted/30 space-y-3">
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">File Search 添付ファイル設定</span>
                      <span className="text-xs text-muted-foreground">
                        （選択したファイルはAIがFile Searchで参照可能）
                      </span>
                    </div>
                    {isLoadingAttachments ? (
                      <div className="text-sm text-muted-foreground">読み込み中...</div>
                    ) : fileAttachmentData && fileAttachmentData.availableFiles.length > 0 ? (
                      <div className="space-y-2">
                        {['input', 'step_output'].map(category => {
                          const categoryFiles = fileAttachmentData.availableFiles.filter(f => f.category === category);
                          if (categoryFiles.length === 0) return null;
                          return (
                            <div key={category} className="space-y-1">
                              <div className="text-xs text-muted-foreground font-medium">
                                {category === 'input' ? '入力ファイル' : '前ステップの出力'}
                              </div>
                              {categoryFiles.map(file => (
                                <div key={file.id} className="flex items-start gap-3 pl-2">
                                  <Checkbox
                                    id={`file-${file.id}`}
                                    checked={(fileAttachmentData.attachedFiles || []).includes(file.id)}
                                    onCheckedChange={() => handleToggleFileAttachment(file.id)}
                                    disabled={updateAttachmentsMutation.isPending}
                                    data-testid={`checkbox-file-${file.id}`}
                                  />
                                  <label 
                                    htmlFor={`file-${file.id}`}
                                    className="text-sm cursor-pointer flex-1"
                                  >
                                    <span className="font-medium">{file.name}</span>
                                    <span className="text-muted-foreground ml-2 text-xs">
                                      — {file.description}
                                    </span>
                                  </label>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        このステップでは添付ファイルを設定できません。
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground pt-2 border-t">
                      File Searchを使用すると、選択したファイルの内容をAIが検索して参照できます。
                      プロンプト内のプレースホルダー（{'{'}STEP2_OUTPUT{'}'}等）による埋め込みも引き続き使用可能です。
                    </p>
                  </div>
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
