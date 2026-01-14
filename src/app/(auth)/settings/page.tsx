'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, RotateCcw, Download, Paperclip, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// Types
interface PromptVersion {
  id: number;
  stepNumber: number;
  version: number;
  content: string;
  isActive: boolean;
  createdAt: string;
}

interface PromptData {
  stepNumber: number;
  stepName: string;
  defaultPrompt: string;
  versions: PromptVersion[];
  activeVersion: number | null;
  activeId: number | null;
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

interface ExportedPrompt {
  stepNumber: number;
  stepName: string;
  isCustom: boolean;
  version: number | null;
  content: string;
}

// Constants
const STEP_OPTIONS = [
  { value: '21', label: 'Step 2-1: テーマ創出と選定' },
  { value: '211', label: 'Step 2-1B: 構造化抽出（任意）' },
  { value: '22', label: 'Step 2-2: テーマの詳細検討' },
  { value: '3', label: 'Step 3: テーマ魅力度評価' },
  { value: '4', label: 'Step 4: AGC参入検討' },
  { value: '5', label: 'Step 5: テーマ一覧表作成' },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const [selectedStep, setSelectedStep] = useState<string>('21');
  const [editContent, setEditContent] = useState<string>('');
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');

  // Data states
  const [promptData, setPromptData] = useState<PromptData | null>(null);
  const [fileAttachmentData, setFileAttachmentData] = useState<FileAttachmentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isUpdatingAttachments, setIsUpdatingAttachments] = useState(false);

  // Fetch prompt data
  const fetchPromptData = useCallback(async (step: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/prompts/${step}`);
      if (!res.ok) throw new Error('Failed to fetch prompt data');
      const data: PromptData = await res.json();
      setPromptData(data);

      // Set initial content
      const activeVersion = data.versions.find(v => v.isActive);
      if (activeVersion) {
        setEditContent(activeVersion.content);
      } else {
        setEditContent(data.defaultPrompt);
      }
      setSelectedVersionId('');
    } catch (error) {
      console.error('Error fetching prompt:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch file attachment data
  const fetchFileAttachmentData = useCallback(async (step: string) => {
    setIsLoadingAttachments(true);
    try {
      const res = await fetch(`/api/file-attachments/${step}`);
      if (!res.ok) throw new Error('Failed to fetch file attachments');
      const data: FileAttachmentData = await res.json();
      setFileAttachmentData(data);
    } catch (error) {
      console.error('Error fetching file attachments:', error);
    } finally {
      setIsLoadingAttachments(false);
    }
  }, []);

  // Load data when step changes
  useEffect(() => {
    fetchPromptData(selectedStep);
    fetchFileAttachmentData(selectedStep);
  }, [selectedStep, fetchPromptData, fetchFileAttachmentData]);

  // Handle step change
  const handleStepChange = (step: string) => {
    setSelectedStep(step);
    setEditContent('');
    setSelectedVersionId('');
  };

  // Handle save prompt
  const handleSave = async () => {
    if (!editContent.trim()) {
      toast({
        title: 'エラー',
        description: 'プロンプトを入力してください',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/prompts/${selectedStep}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });

      if (!res.ok) throw new Error('Failed to save prompt');

      toast({
        title: 'プロンプトを保存しました',
        description: '新しいバージョンが作成され、適用されました',
      });

      // Refresh data
      fetchPromptData(selectedStep);
    } catch (error) {
      console.error('Error saving prompt:', error);
      toast({
        title: 'エラー',
        description: 'プロンプトの保存に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle activate version
  const handleActivateVersion = async () => {
    if (!selectedVersionId || selectedVersionId === 'default') return;

    setIsActivating(true);
    try {
      const res = await fetch(`/api/prompts/${selectedStep}/activate/${selectedVersionId}`, {
        method: 'POST',
      });

      if (!res.ok) throw new Error('Failed to activate version');

      toast({
        title: 'バージョンを適用しました',
        description: '選択したバージョンが有効になりました',
      });

      // Refresh data
      fetchPromptData(selectedStep);
    } catch (error) {
      console.error('Error activating version:', error);
      toast({
        title: 'エラー',
        description: 'バージョンの適用に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsActivating(false);
    }
  };

  // Handle load version
  const handleLoadVersion = (versionId: string) => {
    setSelectedVersionId(versionId);
    if (versionId === 'default') {
      setEditContent(promptData?.defaultPrompt || '');
    } else {
      const version = promptData?.versions.find(v => v.id.toString() === versionId);
      if (version) {
        setEditContent(version.content);
      }
    }
  };

  // Handle toggle file attachment
  const handleToggleFileAttachment = async (fileId: string) => {
    if (!fileAttachmentData) return;

    setIsUpdatingAttachments(true);
    const currentAttached = fileAttachmentData.attachedFiles || [];
    const newAttached = currentAttached.includes(fileId)
      ? currentAttached.filter(id => id !== fileId)
      : [...currentAttached, fileId];

    try {
      const res = await fetch(`/api/file-attachments/${selectedStep}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachedFiles: newAttached }),
      });

      if (!res.ok) throw new Error('Failed to update attachments');

      const data: FileAttachmentData = await res.json();
      setFileAttachmentData(data);

      toast({
        title: '添付ファイル設定を保存しました',
      });
    } catch (error) {
      console.error('Error updating attachments:', error);
      toast({
        title: 'エラー',
        description: '添付ファイル設定の保存に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingAttachments(false);
    }
  };

  // Handle export prompts
  const handleExportPrompts = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/prompts/export');
      if (!res.ok) throw new Error('Failed to export prompts');

      const prompts: ExportedPrompt[] = await res.json();

      const lines: string[] = [];
      lines.push('# ASIP カスタムプロンプト一覧');
      lines.push('');
      lines.push(`エクスポート日時: ${format(new Date(), 'yyyy/MM/dd HH:mm:ss')}`);
      lines.push('');
      lines.push('---');
      lines.push('');

      for (const prompt of prompts) {
        lines.push(`## ${prompt.stepName}`);
        lines.push('');
        if (prompt.isCustom) {
          lines.push(`> カスタムプロンプト（v${prompt.version}）を使用中`);
        } else {
          lines.push('> デフォルトプロンプトを使用中');
        }
        lines.push('');
        lines.push('```');
        lines.push(prompt.content);
        lines.push('```');
        lines.push('');
        lines.push('---');
        lines.push('');
      }

      const content = lines.join('\n');
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `asip-prompts-${format(new Date(), 'yyyyMMdd-HHmmss')}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'エクスポート完了',
        description: 'プロンプト一覧をMarkdownファイルでダウンロードしました',
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'エラー',
        description: 'プロンプトのエクスポートに失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const currentStepOption = STEP_OPTIONS.find(opt => opt.value === selectedStep);

  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8 fade-in">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" data-testid="button-back-dashboard">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1
                className="text-3xl font-display font-black tracking-tight"
                data-testid="text-settings-title"
              >
                設定
              </h1>
              <p className="text-muted-foreground mt-1 font-light">
                ASIPパイプラインのプロンプトを管理
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
              {isExporting ? 'エクスポート中...' : 'プロンプト一覧'}
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Step Selection */}
          <Card className="lg:col-span-1 fade-in stagger-1">
            <CardHeader>
              <CardTitle className="text-lg font-display">ステップ選択</CardTitle>
              <CardDescription className="font-light">編集するステップを選択</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedStep} onValueChange={handleStepChange}>
                <SelectTrigger data-testid="select-step">
                  <SelectValue placeholder="ステップを選択" />
                </SelectTrigger>
                <SelectContent>
                  {STEP_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
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
                          v{v.version} - {format(new Date(v.createdAt), 'yyyy/MM/dd HH:mm')}
                          {v.isActive && ' (適用中)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedVersionId && selectedVersionId !== 'default' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={handleActivateVersion}
                      disabled={
                        isActivating ||
                        promptData.versions.find(v => v.id.toString() === selectedVersionId)?.isActive
                      }
                      data-testid="button-apply-version"
                    >
                      <RotateCcw className="h-4 w-4" />
                      このバージョンを適用
                    </Button>
                  )}
                </div>
              )}

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground font-light">現在の適用状況:</p>
                <Badge variant="secondary" className="mt-1">
                  {promptData?.activeVersion ? `v${promptData.activeVersion}` : 'デフォルト'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Right Panel - Editor */}
          <Card className="lg:col-span-2 fade-in stagger-2">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-display">
                    {currentStepOption?.label || `Step ${selectedStep}`}
                  </CardTitle>
                  <CardDescription className="font-light">プロンプトを編集して保存</CardDescription>
                </div>
                <Button
                  onClick={handleSave}
                  disabled={isSaving || !editContent.trim()}
                  className="gap-2"
                  data-testid="button-save-prompt"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? '保存中...' : '保存して適用'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground font-light">
                  読み込み中...
                </div>
              ) : (
                <>
                  {/* File Attachment Settings */}
                  <div className="border rounded-md p-4 bg-muted/30 space-y-3">
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">File Search 添付ファイル設定</span>
                      <span className="text-xs text-muted-foreground">
                        （選択したファイルはAIがFile Searchで参照可能）
                      </span>
                    </div>
                    {isLoadingAttachments ? (
                      <div className="text-sm text-muted-foreground font-light">読み込み中...</div>
                    ) : fileAttachmentData && fileAttachmentData.availableFiles.length > 0 ? (
                      <div className="space-y-2">
                        {(['input', 'step_output'] as const).map(category => {
                          const categoryFiles = fileAttachmentData.availableFiles.filter(
                            f => f.category === category
                          );
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
                                    disabled={isUpdatingAttachments}
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
                      <div className="text-sm text-muted-foreground font-light">
                        このステップでは添付ファイルを設定できません
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground pt-2 border-t font-light">
                      File Searchを使用すると、選択したファイルの内容をAIが検索して参照できます。
                      プロンプト内のプレースホルダー（{'{STEP2_OUTPUT}'}等）による埋め込みも引き続き使用可能です。
                    </p>
                  </div>

                  {/* Prompt Editor */}
                  <Textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    placeholder="プロンプトを入力..."
                    className="font-mono text-sm min-h-[400px]"
                    data-testid="textarea-prompt"
                  />
                  <p className="text-xs text-muted-foreground font-light">
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
