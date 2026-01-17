'use client';

import { useState, useEffect } from 'react';
import { Bug, Clock, Paperclip, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DebugPromptEntry {
  step: string;
  timestamp: string;
  prompt: string;
  attachments: string[];
}

interface DebugPromptsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: number | null;
  debugPrompts?: unknown; // From run.debugPrompts
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function DebugPromptsDialog({
  open,
  onOpenChange,
  runId,
  debugPrompts,
}: DebugPromptsDialogProps) {
  const [selectedStep, setSelectedStep] = useState<string>('');
  const [entries, setEntries] = useState<DebugPromptEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Parse debug prompts from run data
  useEffect(() => {
    if (open && debugPrompts) {
      setLoading(true);
      try {
        // debugPrompts could be an array of entries or an object with entries property
        let parsedEntries: DebugPromptEntry[] = [];

        if (Array.isArray(debugPrompts)) {
          parsedEntries = debugPrompts as DebugPromptEntry[];
        } else if (typeof debugPrompts === 'object' && debugPrompts !== null) {
          const data = debugPrompts as Record<string, unknown>;
          if (Array.isArray(data.entries)) {
            parsedEntries = data.entries as DebugPromptEntry[];
          }
        }

        setEntries(parsedEntries);
        if (parsedEntries.length > 0) {
          setSelectedStep(`0-${parsedEntries[0].step}`);
        }
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    } else if (!open) {
      setSelectedStep('');
      setEntries([]);
    }
  }, [open, debugPrompts]);

  const selectedIndex = selectedStep ? parseInt(selectedStep.split('-')[0]) : -1;
  const selectedEntry = entries[selectedIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            プロンプト確認（デバッグ）
          </DialogTitle>
          <DialogDescription>
            各ステップで実際に送信されたプロンプトと添付ファイルを確認できます
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bug className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">
              デバッグプロンプトが利用できません
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              このRunはプロンプト記録機能追加前に実行された可能性があります
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">
                ステップ選択:
              </span>
              <Select value={selectedStep} onValueChange={setSelectedStep}>
                <SelectTrigger className="w-full" data-testid="select-debug-step">
                  <SelectValue placeholder="ステップを選択" />
                </SelectTrigger>
                <SelectContent>
                  {entries.map((entry, index) => (
                    <SelectItem key={index} value={`${index}-${entry.step}`}>
                      {entry.step}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedEntry && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>送信時刻: {formatDate(selectedEntry.timestamp)}</span>
                </div>

                {selectedEntry.attachments &&
                  selectedEntry.attachments.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium flex items-center gap-1">
                        <Paperclip className="h-4 w-4" />
                        添付ファイル:
                      </span>
                      {selectedEntry.attachments.map((attachment, idx) => (
                        <Badge
                          key={idx}
                          variant="secondary"
                          data-testid={`badge-attachment-${idx}`}
                        >
                          {attachment}
                        </Badge>
                      ))}
                    </div>
                  )}

                <div>
                  <span className="text-sm font-medium">プロンプト内容:</span>
                  <ScrollArea className="h-[50vh] mt-2 rounded-md border bg-muted/30 p-4">
                    <pre
                      className="text-xs font-mono whitespace-pre-wrap break-words"
                      data-testid="text-debug-prompt"
                    >
                      {selectedEntry.prompt}
                    </pre>
                  </ScrollArea>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
