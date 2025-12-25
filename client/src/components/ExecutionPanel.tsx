import { useState, useCallback } from "react";
import { Play, Loader2, Target, Cpu, Settings2, Plus, Eye, Trash2, Upload, FileText, X, Files } from "lucide-react";
import mammoth from "mammoth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { format } from "date-fns";
import type { Resource } from "@shared/schema";

const resourceFormSchema = z.object({
  name: z.string().min(1, "名前は必須です").max(200, "名前が長すぎます"),
  content: z.string().min(1, "内容は必須です"),
});

type ResourceFormValues = z.infer<typeof resourceFormSchema>;

interface ExecutionPanelProps {
  targetSpecs: Resource[];
  technicalAssets: Resource[];
  onExecute: (targetSpecId: number, technicalAssetsId: number, hypothesisCount: number, loopCount: number) => void;
  onAddResource: (type: "target_spec" | "technical_assets", name: string, content: string) => Promise<void>;
  onDeleteResource: (id: number) => void;
  isExecuting?: boolean;
  isPending?: boolean;
}

export function ExecutionPanel({
  targetSpecs,
  technicalAssets,
  onExecute,
  onAddResource,
  onDeleteResource,
  isExecuting,
  isPending,
}: ExecutionPanelProps) {
  const [selectedTargetSpec, setSelectedTargetSpec] = useState<string>("");
  const [selectedTechnicalAssets, setSelectedTechnicalAssets] = useState<string>("");
  const [hypothesisCount, setHypothesisCount] = useState<number>(5);
  const [loopCount, setLoopCount] = useState<number>(1);
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addType, setAddType] = useState<"target_spec" | "technical_assets">("target_spec");
  const [previewResource, setPreviewResource] = useState<Resource | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [addMode, setAddMode] = useState<"single" | "bulk">("single");
  const [bulkFiles, setBulkFiles] = useState<Array<{ id: string; file: File; name: string; content: string }>>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [singleSubmitting, setSingleSubmitting] = useState(false);

  const form = useForm<ResourceFormValues>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: {
      name: "",
      content: "",
    },
  });

  const canExecute =
    selectedTargetSpec &&
    selectedTechnicalAssets &&
    !isExecuting;

  const handleExecute = () => {
    if (!canExecute) return;
    onExecute(parseInt(selectedTargetSpec), parseInt(selectedTechnicalAssets), hypothesisCount, loopCount);
  };
  
  const totalHypotheses = hypothesisCount * loopCount;

  const handleAddClick = (type: "target_spec" | "technical_assets") => {
    setAddType(type);
    form.reset({ name: "", content: "" });
    setAddMode("single");
    setBulkFiles([]);
    setAddDialogOpen(true);
  };

  const handleBulkFilesSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const readPromises = files.map(async (file, idx) => {
      const isWord = file.name.endsWith(".docx") || file.name.endsWith(".doc");
      const id = `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 9)}`;
      const name = file.name.replace(/\.[^/.]+$/, "");
      
      if (isWord) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return { id, file, name, content: result.value };
      } else {
        return new Promise<{ id: string; file: File; name: string; content: string }>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            resolve({
              id,
              file,
              name,
              content: event.target?.result as string,
            });
          };
          reader.readAsText(file);
        });
      }
    });

    Promise.all(readPromises).then((results) => {
      setBulkFiles((prev) => [...prev, ...results]);
    });
    e.target.value = "";
  }, []);

  const handleBulkFileNameChange = (index: number, newName: string) => {
    setBulkFiles((prev) =>
      prev.map((item, i) => (i === index ? { ...item, name: newName } : item))
    );
  };

  const handleBulkFileRemove = (index: number) => {
    setBulkFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleBulkSubmit = async () => {
    if (bulkFiles.length === 0) return;

    const emptyNames = bulkFiles.some((f) => !f.name.trim());
    if (emptyNames) {
      alert("すべてのファイルに登録名を入力してください");
      return;
    }

    const names = bulkFiles.map((f) => f.name.trim());
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) {
      alert("登録名が重複しています。それぞれ異なる名前を入力してください");
      return;
    }

    setBulkUploading(true);
    const failedIds: Set<string> = new Set();
    const failedNames: string[] = [];

    for (const item of bulkFiles) {
      try {
        await onAddResource(addType, item.name.trim(), item.content);
      } catch (error) {
        failedIds.add(item.id);
        failedNames.push(item.name);
      }
    }

    setBulkUploading(false);

    if (failedIds.size > 0) {
      const remaining = bulkFiles.filter((f) => failedIds.has(f.id));
      setBulkFiles(remaining);
      alert(`以下のファイルの追加に失敗しました:\n${failedNames.join("\n")}\n\n再度お試しください。`);
    } else {
      setAddDialogOpen(false);
      setBulkFiles([]);
    }
  };

  const handleAddSubmit = async (values: ResourceFormValues) => {
    setSingleSubmitting(true);
    try {
      await onAddResource(addType, values.name, values.content);
      setAddDialogOpen(false);
      form.reset();
    } catch (error) {
    } finally {
      setSingleSubmitting(false);
    }
  };

  const handlePreview = (resource: Resource) => {
    setPreviewResource(resource);
    setPreviewDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (window.confirm("このリソースを削除しますか？")) {
      onDeleteResource(id);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const isWord = file.name.endsWith(".docx") || file.name.endsWith(".doc");
    
    if (isWord) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      form.setValue("content", result.value);
      if (!form.getValues("name")) {
        form.setValue("name", file.name.replace(/\.[^/.]+$/, ""));
      }
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        form.setValue("content", content);
        if (!form.getValues("name")) {
          form.setValue("name", file.name.replace(/\.[^/.]+$/, ""));
        }
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3 shrink-0">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <Play className="h-5 w-5" />
            G-Methodを実行
          </CardTitle>
          <CardDescription>
            リソースを選択して仮説生成パイプラインを実行
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <div className="space-y-6 flex-1">
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                ターゲット仕様
              </Label>
              <Select
                value={selectedTargetSpec}
                onValueChange={setSelectedTargetSpec}
                disabled={isExecuting}
              >
                <SelectTrigger data-testid="select-target-spec">
                  <SelectValue placeholder="ターゲット仕様を選択..." />
                </SelectTrigger>
                <SelectContent>
                  {targetSpecs.length === 0 ? (
                    <div className="py-4 px-2 text-sm text-muted-foreground text-center">
                      ターゲット仕様がありません。先に追加してください。
                    </div>
                  ) : (
                    targetSpecs.map((spec) => (
                      <SelectItem key={spec.id} value={spec.id.toString()}>
                        {spec.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                技術アセット
              </Label>
              <Select
                value={selectedTechnicalAssets}
                onValueChange={setSelectedTechnicalAssets}
                disabled={isExecuting}
              >
                <SelectTrigger data-testid="select-technical-assets">
                  <SelectValue placeholder="技術アセットを選択..." />
                </SelectTrigger>
                <SelectContent>
                  {technicalAssets.length === 0 ? (
                    <div className="py-4 px-2 text-sm text-muted-foreground text-center">
                      技術アセットがありません。先に追加してください。
                    </div>
                  ) : (
                    technicalAssets.map((asset) => (
                      <SelectItem key={asset.id} value={asset.id.toString()}>
                        {asset.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                onClick={() => setResourceModalOpen(true)}
                data-testid="link-edit-resources"
              >
                <Settings2 className="h-3 w-3" />
                リソースの編集
              </button>
            </div>

            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                生成設定
              </Label>
              <div className="space-y-3 p-3 rounded-md bg-muted/30">
                <div className="flex items-center gap-3">
                  <span className="text-sm w-24">1回あたり:</span>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={hypothesisCount}
                    onChange={(e) => setHypothesisCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 5)))}
                    disabled={isExecuting}
                    className="w-20"
                    data-testid="input-hypothesis-count"
                  />
                  <span className="text-sm text-muted-foreground">件</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm w-24">繰り返し:</span>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={loopCount}
                    onChange={(e) => setLoopCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                    disabled={isExecuting}
                    className="w-20"
                    data-testid="input-loop-count"
                  />
                  <span className="text-sm text-muted-foreground">回</span>
                </div>
                <div className="pt-2 border-t border-border/50">
                  <span className="text-sm font-medium">合計: {totalHypotheses}件の仮説を生成</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 mt-auto">
            <Button
              size="lg"
              className="w-full gap-2"
              disabled={!canExecute}
              onClick={handleExecute}
              data-testid="button-run-gmethod"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  処理中...
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  G-Methodを実行
                </>
              )}
            </Button>
            {!selectedTargetSpec && !selectedTechnicalAssets && (
              <p className="text-xs text-muted-foreground text-center mt-3">
                両方のリソースを選択すると実行できます
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={resourceModalOpen} onOpenChange={setResourceModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              リソースの編集
            </DialogTitle>
            <DialogDescription>
              ターゲット仕様と技術アセットを管理
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="target_spec" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="target_spec" className="gap-2">
                <Target className="h-4 w-4" />
                ターゲット仕様 ({targetSpecs.length})
              </TabsTrigger>
              <TabsTrigger value="technical_assets" className="gap-2">
                <Cpu className="h-4 w-4" />
                技術アセット ({technicalAssets.length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="target_spec" className="mt-4">
              <div className="flex justify-end mb-3">
                <Button
                  size="sm"
                  onClick={() => handleAddClick("target_spec")}
                  className="gap-1"
                  data-testid="button-add-target-spec-modal"
                >
                  <Plus className="h-4 w-4" />
                  追加
                </Button>
              </div>
              <ScrollArea className="h-[300px]">
                {targetSpecs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Target className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      ターゲット仕様がありません
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {targetSpecs.map((resource) => (
                      <ResourceItem
                        key={resource.id}
                        resource={resource}
                        onPreview={handlePreview}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="technical_assets" className="mt-4">
              <div className="flex justify-end mb-3">
                <Button
                  size="sm"
                  onClick={() => handleAddClick("technical_assets")}
                  className="gap-1"
                  data-testid="button-add-technical-assets-modal"
                >
                  <Plus className="h-4 w-4" />
                  追加
                </Button>
              </div>
              <ScrollArea className="h-[300px]">
                {technicalAssets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Cpu className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      技術アセットがありません
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {technicalAssets.map((resource) => (
                      <ResourceItem
                        key={resource.id}
                        resource={resource}
                        onPreview={handlePreview}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResourceModalOpen(false)}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {addType === "target_spec" ? "ターゲット仕様を追加" : "技術アセットを追加"}
            </DialogTitle>
            <DialogDescription>
              {addType === "target_spec"
                ? "ターゲット市場と顧客仕様のテキストを追加してください。"
                : "技術アセットリスト（JSONまたはテキスト形式）を追加してください。"}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={addMode} onValueChange={(v) => setAddMode(v as "single" | "bulk")} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="single" className="gap-2" data-testid="tab-single-upload">
                <FileText className="h-4 w-4" />
                単一追加
              </TabsTrigger>
              <TabsTrigger value="bulk" className="gap-2" data-testid="tab-bulk-upload">
                <Files className="h-4 w-4" />
                まとめて追加
              </TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="mt-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleAddSubmit)}>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>名前</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="リソース名を入力..."
                              data-testid="input-resource-name"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="content"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>内容</FormLabel>
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                className="hidden"
                                accept=".txt,.json,.md,.doc,.docx"
                                onChange={handleFileUpload}
                              />
                              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                                <span>
                                  <Upload className="h-3.5 w-3.5" />
                                  ファイルをアップロード
                                </span>
                              </Button>
                            </label>
                          </div>
                          <FormControl>
                            <Textarea
                              placeholder="ここに内容を貼り付けまたは入力..."
                              rows={10}
                              className="font-mono text-sm"
                              data-testid="input-resource-content"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <DialogFooter className="mt-4">
                    <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} disabled={singleSubmitting}>
                      キャンセル
                    </Button>
                    <Button
                      type="submit"
                      disabled={singleSubmitting}
                      data-testid="button-submit-resource"
                    >
                      {singleSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          追加中...
                        </>
                      ) : "リソースを追加"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="bulk" className="mt-4">
              <div className="space-y-4">
                <div className="border-2 border-dashed rounded-md p-6 text-center">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      accept=".txt,.json,.md,.doc,.docx"
                      multiple
                      onChange={handleBulkFilesSelect}
                      data-testid="input-bulk-files"
                    />
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        クリックしてファイルを選択
                      </p>
                      <p className="text-xs text-muted-foreground">
                        複数ファイルを選択可能（.txt, .json, .md）
                      </p>
                    </div>
                  </label>
                </div>

                {bulkFiles.length > 0 && (
                  <ScrollArea className="h-[250px] rounded-md border p-3">
                    <div className="space-y-2">
                      {bulkFiles.map((item, index) => (
                        <div
                          key={`${item.file.name}-${index}`}
                          className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
                          data-testid={`bulk-file-item-${index}`}
                        >
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className="text-xs text-muted-foreground truncate">
                              {item.file.name}
                            </p>
                            <Input
                              value={item.name}
                              onChange={(e) => handleBulkFileNameChange(index, e.target.value)}
                              placeholder="登録名を入力..."
                              className="h-8 text-sm"
                              data-testid={`input-bulk-file-name-${index}`}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleBulkFileRemove(index)}
                            data-testid={`button-remove-bulk-file-${index}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} disabled={bulkUploading}>
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleBulkSubmit}
                    disabled={bulkFiles.length === 0 || bulkUploading}
                    data-testid="button-submit-bulk-resources"
                  >
                    {bulkUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        追加中...
                      </>
                    ) : (
                      `${bulkFiles.length}件を追加`
                    )}
                  </Button>
                </DialogFooter>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {previewResource?.name}
            </DialogTitle>
            <DialogDescription>
              {previewResource?.type === "target_spec" ? "ターゲット仕様" : "技術アセット"} ・{" "}
              {previewResource?.createdAt && format(new Date(previewResource.createdAt), "yyyy/MM/dd HH:mm")}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh] rounded-md border bg-muted/30 p-4">
            <pre className="text-sm font-mono whitespace-pre-wrap break-words">
              {previewResource?.content}
            </pre>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResourceItem({
  resource,
  onPreview,
  onDelete,
}: {
  resource: Resource;
  onPreview: (r: Resource) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      className="group flex items-center justify-between gap-2 rounded-md border bg-card p-2.5 hover-elevate"
      data-testid={`resource-item-${resource.id}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate" data-testid={`text-resource-name-${resource.id}`}>
          {resource.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(resource.createdAt), "yyyy/MM/dd")}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPreview(resource)}
          data-testid={`button-preview-resource-${resource.id}`}
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(resource.id)}
          data-testid={`button-delete-resource-${resource.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
