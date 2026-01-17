'use client';

import { CheckCircle, Clock, AlertCircle, Loader2, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Hypothesis } from '@/lib/db/schema';

interface HypothesisCardProps {
  hypothesis: Hypothesis;
  isSelected: boolean;
  onClick: () => void;
}

const statusConfig: Record<string, {
  label: string;
  shortLabel: string;
  icon: typeof Clock;
  variant: 'pending' | 'running' | 'completed' | 'error';
  color: string;
}> = {
  pending: {
    label: '待機中',
    shortLabel: '待機',
    icon: Clock,
    variant: 'pending',
    color: 'text-muted-foreground'
  },
  step2_2: {
    label: 'S2-2 処理中',
    shortLabel: '2-2',
    icon: Loader2,
    variant: 'running',
    color: 'text-blue-500'
  },
  step3: {
    label: 'S3 処理中',
    shortLabel: 'S3',
    icon: Loader2,
    variant: 'running',
    color: 'text-blue-500'
  },
  step4: {
    label: 'S4 処理中',
    shortLabel: 'S4',
    icon: Loader2,
    variant: 'running',
    color: 'text-blue-500'
  },
  step5: {
    label: 'S5 処理中',
    shortLabel: 'S5',
    icon: Loader2,
    variant: 'running',
    color: 'text-blue-500'
  },
  completed: {
    label: '完了',
    shortLabel: '完了',
    icon: CheckCircle,
    variant: 'completed',
    color: 'text-green-500'
  },
  error: {
    label: 'エラー',
    shortLabel: 'ERR',
    icon: AlertCircle,
    variant: 'error',
    color: 'text-red-500'
  },
};

// ステップの進捗を表示するためのインジケーター
function StepIndicator({ currentStep }: { currentStep: string | null }) {
  const steps = ['2-2', '3', '4', '5'];
  const stepMap: Record<string, number> = {
    pending: -1,
    step2_2: 0,
    step3: 1,
    step4: 2,
    step5: 3,
    completed: 4,
    error: -2,
  };

  const currentIndex = stepMap[currentStep || 'pending'] ?? -1;

  if (currentStep === 'pending' || currentStep === 'completed' || currentStep === 'error') {
    return null;
  }

  return (
    <div className="flex items-center gap-0.5 mt-1">
      {steps.map((step, index) => (
        <div
          key={step}
          className={cn(
            'h-1 rounded-full transition-all duration-300',
            index < currentIndex ? 'w-2 bg-green-500' :
            index === currentIndex ? 'w-3 bg-blue-500 animate-pulse' :
            'w-2 bg-muted'
          )}
        />
      ))}
    </div>
  );
}

export function HypothesisCard({ hypothesis, isSelected, onClick }: HypothesisCardProps) {
  const status = statusConfig[hypothesis.processingStatus || 'pending'] || statusConfig.pending;
  const StatusIcon = status.icon;
  const isProcessing = hypothesis.processingStatus?.startsWith('step');
  const isError = hypothesis.processingStatus === 'error';

  return (
    <button
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-all duration-200',
        'hover:border-primary/50 hover:bg-muted/50',
        isSelected && 'border-primary bg-primary/5 shadow-sm',
        isError && 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20',
        isProcessing && 'border-blue-200 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-950/20'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-muted-foreground">
              #{hypothesis.hypothesisNumber}
            </span>
            <Badge variant={status.variant} className="gap-1 text-[10px]">
              <StatusIcon
                className={cn(
                  'h-3 w-3 transition-all',
                  status.color,
                  isProcessing && 'animate-spin'
                )}
              />
              {status.label}
            </Badge>
          </div>
          <p className="text-sm font-medium line-clamp-2">
            {hypothesis.displayTitle || `仮説 ${hypothesis.hypothesisNumber}`}
          </p>
          {hypothesis.step2_1Summary && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {hypothesis.step2_1Summary}
            </p>
          )}

          {/* ステップ進捗インジケーター */}
          <StepIndicator currentStep={hypothesis.processingStatus} />

          {/* エラーメッセージ表示 */}
          {isError && hypothesis.errorMessage && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 line-clamp-2 bg-red-100/50 dark:bg-red-950/50 px-2 py-1 rounded">
              {hypothesis.errorMessage}
            </p>
          )}
        </div>

        {/* 選択インジケーター */}
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground/50 transition-all shrink-0 mt-0.5',
            isSelected && 'text-primary translate-x-0.5'
          )}
        />
      </div>
    </button>
  );
}
