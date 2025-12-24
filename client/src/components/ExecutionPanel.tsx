import { useState } from "react";
import { Play, Loader2, Target, Cpu, Settings2, Plus, Eye, Trash2, Upload, FileText } from "lucide-react";
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
  onExecute: (targetSpecId: number, technicalAssetsId: number) => void;
  onAddResource: (type: "target_spec" | "technical_assets", name: string, content: string) => void;
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
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addType, setAddType] = useState<"target_spec" | "technical_assets">("target_spec");
  const [previewResource, setPreviewResource] = useState<Resource | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);

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
    onExecute(parseInt(selectedTargetSpec), parseInt(selectedTechnicalAssets));
  };

  const handleAddClick = (type: "target_spec" | "technical_assets") => {
    setAddType(type);
    form.reset({ name: "", content: "" });
    setAddDialogOpen(true);
  };

  const handleAddSubmit = (values: ResourceFormValues) => {
    onAddResource(addType, values.name, values.content);
    setAddDialogOpen(false);
    form.reset();
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      form.setValue("content", content);
      if (!form.getValues("name")) {
        form.setValue("name", file.name.replace(/\.[^/.]+$/, ""));
      }
    };
    reader.readAsText(file);
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
        <DialogContent className="sm:max-w-lg">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleAddSubmit)}>
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
              <div className="space-y-4 py-4">
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
                            accept=".txt,.json,.md"
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
                          rows={12}
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
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                  キャンセル
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  data-testid="button-submit-resource"
                >
                  {isPending ? "追加中..." : "リソースを追加"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
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
