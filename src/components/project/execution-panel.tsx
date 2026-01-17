'use client';

import { useState } from 'react';
import { Play, Loader2, Target, Cpu, Settings2, Plus, Pencil, Trash2, X, Upload, FileText, Files, FolderInput, ChevronRight, ChevronDown, Filter, RefreshCcw } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import type { Resource, Hypothesis } from '@/lib/db/schema';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';

const resourceFormSchema = z.object({
  name: z.string().min(1, '名前は必須です').max(200, '名前が長すぎます'),
  content: z.string().min(1, '内容は必須です'),
});

type ResourceFormValues = z.infer<typeof resourceFormSchema>;

interface ExecutionParams {
  targetSpecId: number;
  technicalAssetsId: number;
  hypothesisCount: number;
  loopCount: number;
  jobName: string;
  existingFilter?: ExistingHypothesisFilter;
}

interface ReprocessParams {
  uploadedContent: string;
  technicalAssetsId: number;
  hypothesisCount: number;
  modelChoice: 'pro' | 'flash';
  customPrompt: string;
  jobName: string;
}

interface ExistingHypothesisFilter {
  enabled: boolean;
  targetSpecIds: number[];
  technicalAssetsIds: number[];
}

interface ExecutionPanelProps {
  targetSpecs: Resource[];
  technicalAssets: Resource[];
  hypotheses: Hypothesis[];
  projectId: number;
  onExecute: (params: ExecutionParams) => void;
  onReprocessExecute?: (params: ReprocessParams) => void;
  onAddResource: (type: 'target_spec' | 'technical_assets', name: string, content: string) => Promise<void>;
  onUpdateResource: (id: number, name: string, content: string) => Promise<void>;
  onDeleteResource: (id: number) => void;
  onImportResources: (resourceIds: number[]) => Promise<void>;
  isExecuting?: boolean;
}

function generateDefaultJobName(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${yy}${mm}${dd}${hh}${min}`;
}

export function ExecutionPanel({
  targetSpecs,
  technicalAssets,
  hypotheses,
  projectId,
  onExecute,
  onReprocessExecute,
  onAddResource,
  onUpdateResource,
  onDeleteResource,
  onImportResources,
  isExecuting = false,
}: ExecutionPanelProps) {
  const { toast } = useToast();
  
  // Execution state
  const [selectedTargetSpec, setSelectedTargetSpec] = useState<string>('');
  const [selectedTechnicalAssets, setSelectedTechnicalAssets] = useState<string>('');
  const [hypothesisCount, setHypothesisCount] = useState<number>(5);
  const [loopCount, setLoopCount] = useState<number>(1);
  const [jobName, setJobName] = useState<string>(generateDefaultJobName());
  
  // Reprocess mode state
  const [reprocessMode, setReprocessMode] = useState(false);
  const [reprocessContent, setReprocessContent] = useState('');
  const [reprocessFileName, setReprocessFileName] = useState('');
  const [reprocessModelChoice, setReprocessModelChoice] = useState<'pro' | 'flash'>('pro');
  const [reprocessCustomPrompt, setReprocessCustomPrompt] = useState('');
  
  // Existing hypothesis filter
  const [useExistingFilter, setUseExistingFilter] = useState(false);
  const [filterTargetSpecs, setFilterTargetSpecs] = useState<number[]>([]);
  const [filterTechnicalAssets, setFilterTechnicalAssets] = useState<number[]>([]);
  
  // UI state
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addType, setAddType] = useState<'target_spec' | 'technical_assets'>('target_spec');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [addMode, setAddMode] = useState<'single' | 'bulk' | 'import'>('single');
  const [bulkFiles, setBulkFiles] = useState<Array<{ id: string; file: File; name: string; content: string }>>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  
  // Form state
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ResourceFormValues>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: {
      name: '',
      content: '',
    },
  });

  // Computed values
  const canExecute = selectedTargetSpec && selectedTechnicalAssets && !isExecuting;

  // Handlers
  const handleExecute = () => {
    if (!canExecute) return;
    
    const params: ExecutionParams = {
      targetSpecId: parseInt(selectedTargetSpec),
      technicalAssetsId: parseInt(selectedTechnicalAssets),
      hypothesisCount,
      loopCount,
      jobName,
    };
    
    if (useExistingFilter && (filterTargetSpecs.length > 0 || filterTechnicalAssets.length > 0)) {
      params.existingFilter = {
        enabled: true,
        targetSpecIds: filterTargetSpecs,
        technicalAssetsIds: filterTechnicalAssets,
      };
    }
    
    onExecute(params);
    
    // Reset job name after execution
    setJobName(generateDefaultJobName());
  };
  
  const handleReprocessExecute = () => {
    if (!reprocessContent || !selectedTechnicalAssets || !onReprocessExecute) return;
    
    onReprocessExecute({
      uploadedContent: reprocessContent,
      technicalAssetsId: parseInt(selectedTechnicalAssets),
      hypothesisCount,
      modelChoice: reprocessModelChoice,
      customPrompt: reprocessCustomPrompt,
      jobName,
    });
    
    setJobName(generateDefaultJobName());
    setReprocessContent('');
    setReprocessFileName('');
    setReprocessCustomPrompt('');
  };
  
  const handleReprocessFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      setReprocessContent(text);
      setReprocessFileName(file.name);
    } catch (error) {
      toast({
        title: 'エラー',
        description: 'ファイルの読み込みに失敗しました。',
        variant: 'destructive',
      });
    }
  };

  const handleAddClick = (type: 'target_spec' | 'technical_assets') => {
    setAddType(type);
    form.reset({ name: '', content: '' });
    setAddMode('single');
    setBulkFiles([]);
    setAddDialogOpen(true);
  };
  
  const handleBulkFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newFiles = await Promise.all(
      files.map(async (file) => {
        const content = await file.text();
        return {
          id: Math.random().toString(36).substr(2, 9),
          file,
          name: file.name.replace(/\.[^/.]+$/, ''),
          content,
        };
      })
    );
    setBulkFiles(prev => [...prev, ...newFiles]);
  };
  
  const handleBulkUpload = async () => {
    setBulkUploading(true);
    try {
      for (const fileData of bulkFiles) {
        await onAddResource(addType, fileData.name, fileData.content);
      }
      setAddDialogOpen(false);
      setBulkFiles([]);
      toast({
        title: 'アップロード完了',
        description: `${bulkFiles.length}件のリソースを追加しました。`,
      });
    } catch (error) {
      toast({
        title: 'エラー',
        description: 'アップロード中にエラーが発生しました。',
        variant: 'destructive',
      });
    } finally {
      setBulkUploading(false);
    }
  };
  
  const removeBulkFile = (id: string) => {
    setBulkFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleAddSubmit = async (values: ResourceFormValues) => {
    setIsSubmitting(true);
    try {
      await onAddResource(addType, values.name, values.content);
      setAddDialogOpen(false);
      form.reset();
      toast({
        title: 'リソースを追加しました',
        description: `${values.name}を追加しました。`,
      });
    } catch (error) {
      toast({
        title: 'エラー',
        description: 'リソースの追加に失敗しました。',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (resource: Resource) => {
    setEditingResource(resource);
    setEditName(resource.name);
    setEditContent(resource.content);
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editingResource || !editName.trim() || !editContent.trim()) return;
    
    setIsSubmitting(true);
    try {
      await onUpdateResource(editingResource.id, editName.trim(), editContent.trim());
      setEditDialogOpen(false);
      toast({
        title: 'リソースを更新しました',
        description: `${editName}を更新しました。`,
      });
    } catch (error) {
      toast({
        title: 'エラー',
        description: 'リソースの更新に失敗しました。',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteResource = (resource: Resource) => {
    if (confirm(`「${resource.name}」を削除してよろしいですか？`)) {
      onDeleteResource(resource.id);
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          ASIPを実行
        </CardTitle>
        <CardDescription>
          リソースを選択して仮説生成パイプラインを実行
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Mode Tabs */}
        <Tabs defaultValue="normal" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="normal" onClick={() => setReprocessMode(false)}>通常実行</TabsTrigger>
            <TabsTrigger value="reprocess" onClick={() => setReprocessMode(true)}>再処理</TabsTrigger>
          </TabsList>
          
          <TabsContent value="normal" className="space-y-4">
        <div className="space-y-4">
          {/* Target Spec Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                市場・顧客ニーズ
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddClick('target_spec')}
                disabled={isExecuting}
              >
                <Plus className="h-4 w-4 mr-1" />
                追加
              </Button>
            </div>
            <Select
              value={selectedTargetSpec}
              onValueChange={setSelectedTargetSpec}
              disabled={isExecuting}
            >
              <SelectTrigger>
                <SelectValue placeholder="市場・顧客ニーズを選択..." />
              </SelectTrigger>
              <SelectContent>
                {targetSpecs.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-2">
                    市場・顧客ニーズがありません
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

          {/* Technical Assets Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                技術シーズ
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddClick('technical_assets')}
                disabled={isExecuting}
              >
                <Plus className="h-4 w-4 mr-1" />
                追加
              </Button>
            </div>
            <Select
              value={selectedTechnicalAssets}
              onValueChange={setSelectedTechnicalAssets}
              disabled={isExecuting}
            >
              <SelectTrigger>
                <SelectValue placeholder="技術シーズを選択..." />
              </SelectTrigger>
              <SelectContent>
                {technicalAssets.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-2">
                    技術シーズがありません
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
          </div>

          {/* Hypothesis Count and Loop Count */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="hypothesis-count">仮説数: {hypothesisCount}</Label>
              <Input
                id="hypothesis-count"
                type="number"
                min={1}
                max={20}
                value={hypothesisCount}
                onChange={(e) => setHypothesisCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                disabled={isExecuting}
              />
            </div>
            <div>
              <Label htmlFor="loop-count">ループ数: {loopCount}</Label>
              <Input
                id="loop-count"
                type="number"
                min={1}
                max={10}
                value={loopCount}
                onChange={(e) => setLoopCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                disabled={isExecuting}
              />
            </div>
          </div>

          {/* Job Name */}
          <div>
            <Label htmlFor="job-name">ジョブ名</Label>
            <Input
              id="job-name"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              placeholder="ジョブ名を入力"
              disabled={isExecuting}
            />
          </div>
          
          {/* Existing Hypothesis Filter */}
          {hypotheses.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium">
                <ChevronRight className="h-4 w-4" />
                <Filter className="h-4 w-4" />
                既存仮説のフィルタリング
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="use-existing-filter"
                    checked={useExistingFilter}
                    onCheckedChange={setUseExistingFilter}
                  />
                  <Label htmlFor="use-existing-filter">
                    既存仮説をフィルタリングして新しい仮説を生成
                  </Label>
                </div>
                
                {useExistingFilter && (
                  <div className="space-y-4 pl-6">
                    <div>
                      <Label className="text-sm">フィルタリング対象の市場・顧客ニーズ</Label>
                      <div className="space-y-2 mt-2">
                        {targetSpecs.map((spec) => (
                          <div key={spec.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`filter-target-${spec.id}`}
                              checked={filterTargetSpecs.includes(spec.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setFilterTargetSpecs(prev => [...prev, spec.id]);
                                } else {
                                  setFilterTargetSpecs(prev => prev.filter(id => id !== spec.id));
                                }
                              }}
                            />
                            <Label htmlFor={`filter-target-${spec.id}`} className="text-sm">
                              {spec.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <Label className="text-sm">フィルタリング対象の技術シーズ</Label>
                      <div className="space-y-2 mt-2">
                        {technicalAssets.map((asset) => (
                          <div key={asset.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`filter-asset-${asset.id}`}
                              checked={filterTechnicalAssets.includes(asset.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setFilterTechnicalAssets(prev => [...prev, asset.id]);
                                } else {
                                  setFilterTechnicalAssets(prev => prev.filter(id => id !== asset.id));
                                }
                              }}
                            />
                            <Label htmlFor={`filter-asset-${asset.id}`} className="text-sm">
                              {asset.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Execute Button */}
          <Button
            onClick={handleExecute}
            disabled={!canExecute}
            className="w-full"
          >
            {isExecuting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                実行中...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                ASIPを実行
              </>
            )}
          </Button>

          {(targetSpecs.length === 0 || technicalAssets.length === 0) && (
            <p className="text-sm text-muted-foreground text-center">
              {targetSpecs.length === 0 && '市場・顧客ニーズ'}
              {targetSpecs.length === 0 && technicalAssets.length === 0 && 'と'}
              {technicalAssets.length === 0 && '技術シーズ'}
              を追加してください
            </p>
          )}
        </div>
          </TabsContent>
          
          {/* Reprocess Mode Tab */}
          <TabsContent value="reprocess" className="space-y-4">
            <div>
              <Label>再処理用データ</Label>
              <div className="mt-2 space-y-2">
                {reprocessFileName ? (
                  <div className="flex items-center gap-2 p-2 border rounded">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm">{reprocessFileName}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setReprocessContent('');
                        setReprocessFileName('');
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label>
                    <input
                      type="file"
                      accept=".txt,.md,.docx,.doc"
                      className="hidden"
                      onChange={handleReprocessFileUpload}
                      disabled={isExecuting}
                    />
                    <Button variant="outline" asChild className="w-full">
                      <span className="cursor-pointer">
                        <Upload className="h-4 w-4 mr-2" />
                        ファイルを選択
                      </span>
                    </Button>
                  </label>
                )}
              </div>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  技術シーズ
                </Label>
              </div>
              <Select
                value={selectedTechnicalAssets}
                onValueChange={setSelectedTechnicalAssets}
                disabled={isExecuting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="技術シーズを選択..." />
                </SelectTrigger>
                <SelectContent>
                  {technicalAssets.length === 0 ? (
                    <div className="text-sm text-muted-foreground p-2">
                      技術シーズがありません
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
            </div>
            
            <div>
              <Label>モデル選択</Label>
              <Select
                value={reprocessModelChoice}
                onValueChange={(value) => setReprocessModelChoice(value as 'pro' | 'flash')}
                disabled={isExecuting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pro">Gemini Pro</SelectItem>
                  <SelectItem value="flash">Gemini Flash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="reprocess-hypothesis-count">仮説数: {hypothesisCount}</Label>
              <Input
                id="reprocess-hypothesis-count"
                type="number"
                min={1}
                max={20}
                value={hypothesisCount}
                onChange={(e) => setHypothesisCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                disabled={isExecuting}
              />
            </div>
            
            <div>
              <Label htmlFor="custom-prompt">カスタムプロンプト（オプション）</Label>
              <Textarea
                id="custom-prompt"
                value={reprocessCustomPrompt}
                onChange={(e) => setReprocessCustomPrompt(e.target.value)}
                placeholder="追加の指示がある場合は入力..."
                rows={3}
                disabled={isExecuting}
              />
            </div>
            
            <div>
              <Label htmlFor="reprocess-job-name">ジョブ名</Label>
              <Input
                id="reprocess-job-name"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                placeholder="ジョブ名を入力"
                disabled={isExecuting}
              />
            </div>
            
            <Button
              onClick={handleReprocessExecute}
              disabled={!reprocessContent || !selectedTechnicalAssets || isExecuting || !onReprocessExecute}
              className="w-full"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  実行中...
                </>
              ) : (
                <>
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  再処理を実行
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>

        {/* Resource Management Section */}
        <div className="flex-1 overflow-hidden">
          <Button
            variant="outline"
            onClick={() => setResourceModalOpen(!resourceModalOpen)}
            className="mb-2"
          >
            <Settings2 className="h-4 w-4 mr-2" />
            リソースの編集
          </Button>
          
          {resourceModalOpen && (
            <ScrollArea className="h-[200px] border rounded-md p-2">
              <div className="space-y-4">
                {/* Target Specs List */}
                <div>
                  <h4 className="font-medium mb-2">市場・顧客ニーズ</h4>
                  {targetSpecs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">なし</p>
                  ) : (
                    targetSpecs.map((spec) => (
                      <div key={spec.id} className="flex items-center justify-between py-1">
                        <span className="text-sm truncate flex-1">{spec.name}</span>
                        <div className="flex gap-1 ml-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEditClick(spec)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteResource(spec)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                {/* Technical Assets List */}
                <div>
                  <h4 className="font-medium mb-2">技術シーズ</h4>
                  {technicalAssets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">なし</p>
                  ) : (
                    technicalAssets.map((asset) => (
                      <div key={asset.id} className="flex items-center justify-between py-1">
                        <span className="text-sm truncate flex-1">{asset.name}</span>
                        <div className="flex gap-1 ml-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEditClick(asset)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteResource(asset)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Add Resource Dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {addType === 'target_spec' ? '市場・顧客ニーズ' : '技術シーズ'}を追加
              </DialogTitle>
              <DialogDescription>
                新しい{addType === 'target_spec' ? '市場・顧客ニーズ' : '技術シーズ'}を追加します。
              </DialogDescription>
            </DialogHeader>
            
            <Tabs value={addMode} onValueChange={(v) => setAddMode(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="single">単一追加</TabsTrigger>
                <TabsTrigger value="bulk">一括追加</TabsTrigger>
                <TabsTrigger value="import">インポート</TabsTrigger>
              </TabsList>
              
              {/* Single Add Tab */}
              <TabsContent value="single">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleAddSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>名前</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="リソース名を入力" />
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
                      <FormLabel>内容</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          rows={10} 
                          placeholder="リソースの内容を入力"
                          className="resize-none"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddDialogOpen(false)}
                    disabled={isSubmitting}
                  >
                    キャンセル
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        追加中...
                      </>
                    ) : (
                      '追加'
                    )}
                  </Button>
                </DialogFooter>
                  </form>
                </Form>
              </TabsContent>
              
              {/* Bulk Add Tab */}
              <TabsContent value="bulk">
                <div className="space-y-4">
                  <div>
                    <Label>ファイルを選択</Label>
                    <input
                      type="file"
                      multiple
                      accept=".txt,.md"
                      onChange={handleBulkFileSelect}
                      className="hidden"
                      id="bulk-file-input"
                      disabled={bulkUploading}
                    />
                    <label htmlFor="bulk-file-input">
                      <Button variant="outline" asChild className="w-full mt-2">
                        <span className="cursor-pointer">
                          <Files className="h-4 w-4 mr-2" />
                          ファイルを選択
                        </span>
                      </Button>
                    </label>
                  </div>
                  
                  {bulkFiles.length > 0 && (
                    <div>
                      <Label>選択されたファイル ({bulkFiles.length}件)</Label>
                      <ScrollArea className="h-[200px] border rounded-md p-2 mt-2">
                        <div className="space-y-2">
                          {bulkFiles.map((fileData) => (
                            <div key={fileData.id} className="flex items-center justify-between p-2 hover:bg-muted rounded">
                              <div className="flex-1">
                                <Input
                                  value={fileData.name}
                                  onChange={(e) => {
                                    setBulkFiles(prev =>
                                      prev.map(f => f.id === fileData.id ? { ...f, name: e.target.value } : f)
                                    );
                                  }}
                                  placeholder="リソース名"
                                  className="text-sm"
                                />
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => removeBulkFile(fileData.id)}
                                className="ml-2"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                  
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAddDialogOpen(false)}
                      disabled={bulkUploading}
                    >
                      キャンセル
                    </Button>
                    <Button
                      onClick={handleBulkUpload}
                      disabled={bulkFiles.length === 0 || bulkUploading}
                    >
                      {bulkUploading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          アップロード中...
                        </>
                      ) : (
                        `追加 (${bulkFiles.length}件)`
                      )}
                    </Button>
                  </DialogFooter>
                </div>
              </TabsContent>
              
              {/* Import Tab */}
              <TabsContent value="import">
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    他のプロジェクトからリソースをインポートする機能は現在開発中です。
                  </p>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAddDialogOpen(false)}
                    >
                      閉じる
                    </Button>
                  </DialogFooter>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>

        {/* Edit Resource Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>リソースを編集</DialogTitle>
              <DialogDescription>
                {editingResource?.name}を編集します。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">名前</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="リソース名"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-content">内容</Label>
                <Textarea
                  id="edit-content"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={10}
                  placeholder="リソースの内容"
                  className="resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                disabled={isSubmitting}
              >
                キャンセル
              </Button>
              <Button
                onClick={handleEditSubmit}
                disabled={isSubmitting || !editName.trim() || !editContent.trim()}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    更新中...
                  </>
                ) : (
                  '更新'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
