'use client';

import { FileText, Lightbulb, FlaskConical, Target, Layers, Loader2, AlertTriangle, FileDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Hypothesis } from '@/lib/db/schema';

interface HypothesisDetailProps {
  hypothesis: Hypothesis;
}

const statusConfig: Record<string, { label: string; variant: 'pending' | 'running' | 'completed' | 'error' }> = {
  pending: { label: '待機中', variant: 'pending' },
  step2_2: { label: 'S2-2 実行中', variant: 'running' },
  step3: { label: 'S3 実行中', variant: 'running' },
  step4: { label: 'S4 実行中', variant: 'running' },
  step5: { label: 'S5 実行中', variant: 'running' },
  completed: { label: '完了', variant: 'completed' },
  error: { label: 'エラー', variant: 'error' },
};

// Score table types
interface TechnicalScores {
  I?: number;
  M?: number;
  C?: number;
  L?: number;
  composite?: number;
}

interface AttractivenessScores {
  marketSize?: number;
  growthRate?: number;
  competitiveness?: number;
  differentiability?: number;
  synergy?: number;
  feasibility?: number;
  strategicFit?: number;
  composite?: number;
}

// Markdown content component with prose styling
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none
      [&_table]:text-xs [&_table]:block [&_table]:overflow-x-auto [&_table]:border-collapse
      [&_table_th]:border [&_table_th]:border-border [&_table_th]:px-3 [&_table_th]:py-2 [&_table_th]:bg-muted/50 [&_table_th]:text-left [&_table_th]:font-medium
      [&_table_td]:border [&_table_td]:border-border [&_table_td]:px-3 [&_table_td]:py-2
      [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_pre]:bg-muted/50 [&_pre]:p-4 [&_pre]:rounded-md
      [&_code]:bg-muted/50 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs
      [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6
      [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
      [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2
      [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1
      [&_p]:mb-2 [&_p]:leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

// Loading spinner component
function LoadingSpinner({ stepName }: { stepName: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[400px] text-center">
      <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
      <p className="text-sm text-muted-foreground">{stepName}を処理中...</p>
      <p className="text-xs text-muted-foreground mt-1">完了まで少々お待ちください</p>
    </div>
  );
}

// Placeholder component for empty content
function StepPlaceholder({ stepName, isRunning }: { stepName: string; isRunning: boolean }) {
  if (isRunning) {
    return <LoadingSpinner stepName={stepName} />;
  }
  return (
    <div className="flex flex-col items-center justify-center h-[400px] text-center">
      <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
      <p className="text-sm text-muted-foreground">{stepName}の出力がありません</p>
      <p className="text-xs text-muted-foreground mt-1">前のステップが完了すると処理が開始されます</p>
    </div>
  );
}

// Technical evaluation score table (8 axes)
function TechnicalScoreTable({ scores }: { scores: TechnicalScores }) {
  const scoreItems = [
    { key: 'I', label: '革新性 (Innovativeness)', value: scores.I },
    { key: 'M', label: '市場性 (Marketability)', value: scores.M },
    { key: 'C', label: '実現可能性 (Feasibility)', value: scores.C },
    { key: 'L', label: '優位性 (Leverage)', value: scores.L },
  ];

  return (
    <div className="mb-6 p-4 rounded-lg border bg-muted/30">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-primary" />
        技術評価スコア (IMCL)
      </h3>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-3 py-2 text-left font-medium">評価軸</th>
            <th className="px-3 py-2 text-center font-medium w-24">スコア</th>
          </tr>
        </thead>
        <tbody>
          {scoreItems.map(({ key, label, value }) => (
            <tr key={key} className="border-b">
              <td className="px-3 py-2">{label}</td>
              <td className="px-3 py-2 text-center font-mono">
                {value !== undefined ? value.toFixed(1) : '-'}
              </td>
            </tr>
          ))}
          {scores.composite !== undefined && (
            <tr className="bg-muted/30 font-medium">
              <td className="px-3 py-2">総合スコア</td>
              <td className="px-3 py-2 text-center font-mono text-primary">
                {scores.composite.toFixed(2)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Attractiveness score table (7 axes)
function AttractivenessScoreTable({ scores }: { scores: AttractivenessScores }) {
  const scoreItems = [
    { key: 'marketSize', label: '市場規模', value: scores.marketSize },
    { key: 'growthRate', label: '成長性', value: scores.growthRate },
    { key: 'competitiveness', label: '競争優位性', value: scores.competitiveness },
    { key: 'differentiability', label: '差別化可能性', value: scores.differentiability },
    { key: 'synergy', label: 'シナジー', value: scores.synergy },
    { key: 'feasibility', label: '実現可能性', value: scores.feasibility },
    { key: 'strategicFit', label: '戦略適合性', value: scores.strategicFit },
  ];

  return (
    <div className="mb-6 p-4 rounded-lg border bg-muted/30">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        参入魅力度スコア (7軸)
      </h3>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-3 py-2 text-left font-medium">評価軸</th>
            <th className="px-3 py-2 text-center font-medium w-24">スコア</th>
          </tr>
        </thead>
        <tbody>
          {scoreItems.map(({ key, label, value }) => (
            <tr key={key} className="border-b">
              <td className="px-3 py-2">{label}</td>
              <td className="px-3 py-2 text-center font-mono">
                {value !== undefined ? value.toFixed(1) : '-'}
              </td>
            </tr>
          ))}
          {scores.composite !== undefined && (
            <tr className="bg-muted/30 font-medium">
              <td className="px-3 py-2">総合スコア</td>
              <td className="px-3 py-2 text-center font-mono text-primary">
                {scores.composite.toFixed(2)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Parse scores from fullData or output text
function parseScoresFromData(fullData: unknown): { technical?: TechnicalScores; attractiveness?: AttractivenessScores } {
  if (!fullData || typeof fullData !== 'object') return {};

  const data = fullData as Record<string, unknown>;
  const result: { technical?: TechnicalScores; attractiveness?: AttractivenessScores } = {};

  // Try to extract technical scores
  if (data.technicalScores || data.scores || data.imcl) {
    const scores = (data.technicalScores || data.scores || data.imcl) as Record<string, number>;
    result.technical = {
      I: scores.I ?? scores.innovativeness ?? scores.i,
      M: scores.M ?? scores.marketability ?? scores.m,
      C: scores.C ?? scores.feasibility ?? scores.c,
      L: scores.L ?? scores.leverage ?? scores.l,
      composite: scores.composite ?? scores.total ?? scores.overall,
    };
  }

  // Try to extract attractiveness scores
  if (data.attractivenessScores || data.entryScores || data.marketScores) {
    const scores = (data.attractivenessScores || data.entryScores || data.marketScores) as Record<string, number>;
    result.attractiveness = {
      marketSize: scores.marketSize ?? scores.market_size,
      growthRate: scores.growthRate ?? scores.growth_rate ?? scores.growth,
      competitiveness: scores.competitiveness ?? scores.competitive,
      differentiability: scores.differentiability ?? scores.differentiation,
      synergy: scores.synergy,
      feasibility: scores.feasibility,
      strategicFit: scores.strategicFit ?? scores.strategic_fit ?? scores.strategy,
      composite: scores.composite ?? scores.total ?? scores.overall,
    };
  }

  return result;
}

export function HypothesisDetail({ hypothesis }: HypothesisDetailProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const status = statusConfig[hypothesis.processingStatus || 'pending'] || statusConfig.pending;
  const currentStep = hypothesis.processingStatus || 'pending';

  // Check if hypothesis has any content to download
  const hasContent = Boolean(
    hypothesis.step2_1Summary ||
      hypothesis.step2_2Output ||
      hypothesis.step3Output ||
      hypothesis.step4Output ||
      hypothesis.step5Output
  );

  const handleDownloadWord = async () => {
    if (!hasContent || isDownloading) return;

    setIsDownloading(true);
    try {
      const response = await fetch(`/api/hypotheses/${hypothesis.uuid}/word`);
      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Extract filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `仮説${hypothesis.hypothesisNumber}.docx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download Word document:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  // Parse scores from fullData
  const scores = parseScoresFromData(hypothesis.fullData);

  // Determine which step is currently being processed
  const isStep2_2Running = currentStep === 'step2_2';
  const isStep3Running = currentStep === 'step3';
  const isStep4Running = currentStep === 'step4';
  const isStep5Running = currentStep === 'step5';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Lightbulb className="h-5 w-5 text-primary shrink-0" />
              <span className="text-xs font-mono text-muted-foreground">
                仮説 #{hypothesis.hypothesisNumber}
              </span>
              <Badge variant={status.variant}>
                {status.variant === 'running' && (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                )}
                {status.label}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadWord}
                disabled={!hasContent || isDownloading}
                title={hasContent ? 'Wordファイルをダウンロード' : 'コンテンツがありません'}
                className="h-7 px-2"
              >
                {isDownloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                <span className="ml-1 text-xs">Word</span>
              </Button>
            </div>
            <h2 className="text-lg font-semibold">
              {hypothesis.displayTitle || `仮説 ${hypothesis.hypothesisNumber}`}
            </h2>
            {hypothesis.step2_1Summary && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-3 leading-relaxed">
                {hypothesis.step2_1Summary}
              </p>
            )}
          </div>
        </div>

        {/* Error banner */}
        {hypothesis.errorMessage && (
          <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">エラーが発生しました</p>
              <p className="text-sm text-destructive/80 mt-1">{hypothesis.errorMessage}</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="step2_2" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 pt-2 border-b">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="step2_2" className="gap-1 text-xs">
              {isStep2_2Running && <Loader2 className="h-3 w-3 animate-spin" />}
              <FileText className="h-3 w-3" />
              詳細調査
            </TabsTrigger>
            <TabsTrigger value="step3" className="gap-1 text-xs">
              {isStep3Running && <Loader2 className="h-3 w-3 animate-spin" />}
              <FlaskConical className="h-3 w-3" />
              技術評価
            </TabsTrigger>
            <TabsTrigger value="step4" className="gap-1 text-xs">
              {isStep4Running && <Loader2 className="h-3 w-3 animate-spin" />}
              <Target className="h-3 w-3" />
              参入魅力度
            </TabsTrigger>
            <TabsTrigger value="step5" className="gap-1 text-xs">
              {isStep5Running && <Loader2 className="h-3 w-3 animate-spin" />}
              <Layers className="h-3 w-3" />
              統合評価
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          {/* Step 2-2: Deep Research */}
          <TabsContent value="step2_2" className="h-full m-0">
            <ScrollArea className="h-full">
              <div className="p-4">
                {hypothesis.step2_2Output ? (
                  <MarkdownContent content={hypothesis.step2_2Output} />
                ) : (
                  <StepPlaceholder
                    stepName="S2-2 (テーマの詳細検討)"
                    isRunning={isStep2_2Running}
                  />
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Step 3: Technical Evaluation */}
          <TabsContent value="step3" className="h-full m-0">
            <ScrollArea className="h-full">
              <div className="p-4">
                {hypothesis.step3Output ? (
                  <>
                    {scores.technical && (
                      <TechnicalScoreTable scores={scores.technical} />
                    )}
                    <MarkdownContent content={hypothesis.step3Output} />
                  </>
                ) : (
                  <StepPlaceholder
                    stepName="S3 (テーマ魅力度評価)"
                    isRunning={isStep3Running}
                  />
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Step 4: Entry Attractiveness */}
          <TabsContent value="step4" className="h-full m-0">
            <ScrollArea className="h-full">
              <div className="p-4">
                {hypothesis.step4Output ? (
                  <>
                    {scores.attractiveness && (
                      <AttractivenessScoreTable scores={scores.attractiveness} />
                    )}
                    <MarkdownContent content={hypothesis.step4Output} />
                  </>
                ) : (
                  <StepPlaceholder
                    stepName="S4 (AGC参入検討)"
                    isRunning={isStep4Running}
                  />
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Step 5: Integration */}
          <TabsContent value="step5" className="h-full m-0">
            <ScrollArea className="h-full">
              <div className="p-4">
                {hypothesis.step5Output ? (
                  <MarkdownContent content={hypothesis.step5Output} />
                ) : (
                  <StepPlaceholder
                    stepName="S5 (テーマ一覧表作成)"
                    isRunning={isStep5Running}
                  />
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
