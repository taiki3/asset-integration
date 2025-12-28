import { useState } from "react";
import { HelpCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface PlaceholderInfo {
  name: string;
  description: string;
  example?: string;
  source?: string;
}

interface FileInfo {
  name: string;
  description: string;
}

interface StepInfo {
  name: string;
  description: string;
  model: string;
  dataFlow: string;
  files?: FileInfo[];
  placeholders: PlaceholderInfo[];
  notes?: string[];
}

const STEP_INFO: Record<string, StepInfo> = {
  "step21": {
    name: "Step 2-1: 発散・選定フェーズ",
    description: "Deep Researchエージェントが30件以上のアイデアを発散的に生成し、I/M/L/U基準でTop Nを選定します。",
    model: "deep-research-pro-preview (Agentic Deep Research)",
    dataFlow: "ターゲット仕様書・技術資産・既出仮説をFile Searchストアにアップロードし、プロンプトにはプレースホルダーを埋め込みます。",
    files: [
      { name: "target_specification", description: "ターゲット仕様書の全文（テキスト変換済み）" },
      { name: "technical_assets", description: "技術資産リストの全文（テキスト変換済み）" },
      { name: "previous_hypotheses", description: "既出仮説リスト（存在する場合のみ）" },
    ],
    placeholders: [
      {
        name: "{HYPOTHESIS_COUNT}",
        description: "選定する仮説の数（1回あたりの生成件数）。実行画面の「1回あたり」設定値が使用されます。",
        example: "5",
        source: "実行設定から自動設定",
      },
      {
        name: "{PREVIOUS_HYPOTHESES}",
        description: "過去に生成された仮説のタイトルリスト（重複回避用）。同じプロジェクト内でソフト削除されていない既出仮説が自動挿入されます。既出仮説フィルター設定で対象を絞り込み可能。",
        example: "1. 高耐熱絶縁フィルム\n2. 次世代バッテリー用セパレータ\n...",
        source: "データベースから自動取得",
      },
    ],
    notes: [
      "Deep Researchはファイル検索（File Search）機能を使用するため、入力データはFile Searchストアにアップロードされます",
      "プロンプト内で「添付ファイル target_specification を参照」のように記述すると、アップロードされたファイルが参照されます",
      "既出仮説がない場合、{PREVIOUS_HYPOTHESES}は「なし」に置換されます",
      "設定画面でFile Searchに添付するファイルを個別に選択できます（target_specification、technical_assets）",
      "File Search添付とプレースホルダー埋め込みは併用可能です",
    ],
  },
  "step22": {
    name: "Step 2-2: 収束・深掘りフェーズ",
    description: "Step 2-1で選定された各仮説について、個別にDeep Researchを実行して詳細レポートを生成します。N件の仮説に対してN回のDeep Researchが順次実行されます。",
    model: "deep-research-pro-preview (Agentic Deep Research)",
    dataFlow: "各仮説ごとに専用のFile Searchストアを作成し、ターゲット仕様書・技術資産・仮説コンテキストをアップロードします。",
    files: [
      { name: "target_specification", description: "ターゲット仕様書の全文" },
      { name: "technical_assets", description: "技術資産リストの全文" },
      { name: "hypothesis_context", description: "Step 2-1から抽出された対象仮説の詳細情報（番号、タイトル、カテゴリ、スコア、生テキスト）" },
    ],
    placeholders: [
      {
        name: "{HYPOTHESIS_COUNT}",
        description: "処理対象の仮説数（Step 2-2では常に1に設定）",
        example: "1",
        source: "システムが自動設定",
      },
      {
        name: "{HYPOTHESIS_NUMBER}",
        description: "現在深掘り中の仮説番号（1からN）",
        example: "3",
        source: "Step 2-1の結果から抽出",
      },
      {
        name: "{HYPOTHESIS_TITLE}",
        description: "深掘り対象の仮説タイトル",
        example: "高耐熱絶縁フィルム",
        source: "Step 2-1の結果から抽出",
      },
    ],
    notes: [
      "各仮説のレポートは個別にダウンロード可能（Word形式）",
      "レート制限を考慮して1分間隔で順次実行されます",
      "hypothesis_contextファイルには、Step 2-1で抽出された仮説情報（タイトル、カテゴリ、I/M/L/Uスコア、詳細テキスト）が含まれます",
      "設定画面でFile Searchに添付するファイルを個別に選択できます（target_specification、technical_assets、hypothesis_context）",
      "File Search添付とプレースホルダー埋め込みは併用可能です",
    ],
  },
  "step23": {
    name: "Step 2-3: 統合フェーズ",
    description: "N個の個別レポートを要約・統合して最終レポートを生成します。各レポートは800-1200文字に要約された後、統合されます。",
    model: "gemini-3-pro-preview",
    dataFlow: "Step 2-1の出力と、各Step 2-2レポートの要約がプロンプトに直接埋め込まれます（File Search不使用）。",
    placeholders: [
      {
        name: "{HYPOTHESIS_COUNT}",
        description: "仮説の総数",
        example: "5",
        source: "実行設定から自動設定",
      },
      {
        name: "{STEP2_1_OUTPUT}",
        description: "Step 2-1の監査ストリップ出力（先頭3000文字に切り詰め）",
        example: "【Phase 1：監査ストリップ】...",
        source: "Step 2-1の結果",
      },
      {
        name: "{SUMMARIZED_REPORTS}",
        description: "各Step 2-2レポートの要約（各800-1200文字）を結合したテキスト",
        example: "### 仮説1\n- タイトル: ...\n### 仮説2\n- タイトル: ...",
        source: "Step 2-2の結果を要約",
      },
      {
        name: "{REFERENCES}",
        description: "各レポートから抽出された参考文献URLの重複除去済みリスト",
        example: "- https://example.com/...\n- https://example.org/...",
        source: "Step 2-2のレポートから抽出",
      },
    ],
    notes: [
      "個別レポートはトークン制限を考慮して要約されます",
      "参考文献は重複除去され、番号が振り直されます",
      "現在、設定画面でStep 2-3のプロンプトを直接編集する機能は提供されていません",
    ],
  },
  "step3": {
    name: "Step 3: 科学的評価",
    description: "Dr. Kill-Switchとして、各仮説の科学的整合性と経済合理性を評価し、Go/No-Go判定を行います。",
    model: "gemini-3-pro-preview",
    dataFlow: "技術資産とStep 2の出力がプロンプトに直接埋め込まれます。",
    placeholders: [
      {
        name: "{HYPOTHESIS_COUNT}",
        description: "評価対象の仮説数",
        example: "5",
        source: "実行設定から自動設定",
      },
      {
        name: "{TECHNICAL_ASSETS}",
        description: "技術資産リストの全文",
        example: "【Cap-01】高純度アルミナ粉末\n説明: ...\n【Cap-02】...",
        source: "リソース（技術資産）から取得",
      },
      {
        name: "{STEP2_OUTPUT}",
        description: "Step 2（2-1 + 2-2 + 2-3統合）の最終出力全文",
        example: "【レポートタイトル】...\n【第1章：エグゼクティブサマリー】...",
        source: "Step 2-3の結果",
      },
    ],
    notes: [
      "8つの評価軸で1-5点のスコアリングを実施",
      "評価軸: 科学的妥当性(20%)、製造実現性(15%)、性能優位(20%)、単位経済(20%)、市場魅力度(10%)、規制・EHS(5%)、IP防衛(5%)、戦略適合(5%)",
      "判定結果: Go / Conditional Go / Pivot / No-Go",
    ],
  },
  "step4": {
    name: "Step 4: 戦略監査",
    description: "War Gaming Modeとして、競合に対するキャッチアップ難易度とMake/Buy判定を実施します。",
    model: "gemini-3-pro-preview",
    dataFlow: "技術資産、Step 2、Step 3の出力がプロンプトに直接埋め込まれます。",
    placeholders: [
      {
        name: "{HYPOTHESIS_COUNT}",
        description: "評価対象の仮説数",
        example: "5",
        source: "実行設定から自動設定",
      },
      {
        name: "{TECHNICAL_ASSETS}",
        description: "技術資産リストの全文",
        example: "【Cap-01】高純度アルミナ粉末\n...",
        source: "リソース（技術資産）から取得",
      },
      {
        name: "{STEP2_OUTPUT}",
        description: "Step 2の出力全文",
        example: "【レポートタイトル】...",
        source: "Step 2-3の結果",
      },
      {
        name: "{STEP3_OUTPUT}",
        description: "Step 3（科学的評価）の出力全文",
        example: "### 仮説 No.1: 高耐熱絶縁フィルム\n* 科学×経済判定: Go\n...",
        source: "Step 3の結果",
      },
    ],
    notes: [
      "TRLギャップ、Moat係数（1.0〜3.0）、キャッチアップ期間を算出",
      "自社技術シーズ監査: 顧客アクセス(A/B/C)、資本的持久力(A/B/C)、製造基盤(A/B/C)",
      "Make vs Buy判定（期間・コスト比較）を実施",
    ],
  },
  "step5": {
    name: "Step 5: 統合出力",
    description: "全ステップの出力を統合し、43項目のTSV形式マスターテーブルを生成します。",
    model: "gemini-3-pro-preview",
    dataFlow: "Step 2、3、4の出力がプロンプトに直接埋め込まれます。",
    placeholders: [
      {
        name: "{HYPOTHESIS_COUNT}",
        description: "データ行数（仮説の総数）",
        example: "5",
        source: "実行設定から自動設定",
      },
      {
        name: "{STEP2_OUTPUT}",
        description: "Step 2の出力全文",
        example: "【レポートタイトル】...",
        source: "Step 2-3の結果",
      },
      {
        name: "{STEP3_OUTPUT}",
        description: "Step 3の出力全文",
        example: "### 仮説 No.1: ...",
        source: "Step 3の結果",
      },
      {
        name: "{STEP4_OUTPUT}",
        description: "Step 4の出力全文",
        example: "### 仮説 No.1: ...\n* 戦略判定: Go\n...",
        source: "Step 4の結果",
      },
    ],
    notes: [
      "出力形式はTSV（タブ区切り）で、コードブロックなしの生テキスト",
      "43項目のカラムを持つマスターテーブルを生成",
      "ダウンロード時にTSV/XLSX/CSV形式を選択可能",
      "改行・タブ・特殊記号はサニタイズされます",
    ],
  },
};

function generateMarkdown(): string {
  const lines: string[] = [];
  lines.push("# ASIP プロンプトマニュアル");
  lines.push("");
  lines.push("各ステップで使用可能なプレースホルダー、入力データ、データフローの説明");
  lines.push("");
  lines.push("---");
  lines.push("");

  Object.entries(STEP_INFO).forEach(([, info]) => {
    lines.push(`## ${info.name}`);
    lines.push("");
    lines.push(info.description);
    lines.push("");
    
    lines.push(`### 使用モデル`);
    lines.push("");
    lines.push(`\`${info.model}\``);
    lines.push("");

    lines.push(`### データフロー`);
    lines.push("");
    lines.push(info.dataFlow);
    lines.push("");

    if (info.files && info.files.length > 0) {
      lines.push(`### アップロードされるファイル（File Search用）`);
      lines.push("");
      info.files.forEach((file) => {
        lines.push(`- **\`${file.name}\`**: ${file.description}`);
      });
      lines.push("");
    }

    lines.push(`### 使用可能なプレースホルダー`);
    lines.push("");
    info.placeholders.forEach((placeholder) => {
      lines.push(`#### \`${placeholder.name}\``);
      lines.push("");
      if (placeholder.source) {
        lines.push(`> ${placeholder.source}`);
        lines.push("");
      }
      lines.push(placeholder.description);
      lines.push("");
      if (placeholder.example) {
        lines.push("**例:**");
        lines.push("```");
        lines.push(placeholder.example);
        lines.push("```");
        lines.push("");
      }
    });

    if (info.notes && info.notes.length > 0) {
      lines.push(`### 備考`);
      lines.push("");
      info.notes.forEach((note) => {
        lines.push(`- ${note}`);
      });
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  });

  return lines.join("\n");
}

function downloadMarkdown() {
  const content = generateMarkdown();
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "gmethod-prompt-manual.md";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function PromptManual() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" data-testid="button-prompt-manual">
          <HelpCircle className="h-4 w-4" />
          プロンプトマニュアル
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>プロンプトマニュアル</DialogTitle>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 shrink-0" 
              onClick={downloadMarkdown}
              data-testid="button-download-prompt-manual"
            >
              <Download className="h-4 w-4" />
              Markdown
            </Button>
          </div>
          <DialogDescription>
            各ステップで使用可能なプレースホルダー、入力データ、データフローの説明
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[calc(85vh-120px)]">
          <Tabs defaultValue="step21" className="w-full">
            <TabsList className="grid w-full grid-cols-6 mb-4">
              <TabsTrigger value="step21">2-1</TabsTrigger>
              <TabsTrigger value="step22">2-2</TabsTrigger>
              <TabsTrigger value="step23">2-3</TabsTrigger>
              <TabsTrigger value="step3">3</TabsTrigger>
              <TabsTrigger value="step4">4</TabsTrigger>
              <TabsTrigger value="step5">5</TabsTrigger>
            </TabsList>

            {Object.entries(STEP_INFO).map(([key, info]) => (
              <TabsContent key={key} value={key} className="space-y-6 pr-4">
                <div>
                  <h3 className="text-lg font-semibold">{info.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{info.description}</p>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    使用モデル
                    <Badge variant="secondary">{info.model}</Badge>
                  </h4>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">データフロー</h4>
                  <p className="text-sm text-muted-foreground">{info.dataFlow}</p>
                </div>

                {info.files && info.files.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">アップロードされるファイル（File Search用）</h4>
                    <div className="space-y-2">
                      {info.files.map((file) => (
                        <div key={file.name} className="p-2 rounded-md bg-muted/50 flex items-start gap-2">
                          <code className="text-xs font-mono bg-background px-1.5 py-0.5 rounded border shrink-0">
                            {file.name}
                          </code>
                          <span className="text-sm text-muted-foreground">{file.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="text-sm font-medium">使用可能なプレースホルダー</h4>
                  <div className="space-y-3">
                    {info.placeholders.map((placeholder) => (
                      <div key={placeholder.name} className="p-3 rounded-md bg-muted/50 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-sm font-mono bg-background px-2 py-0.5 rounded border">
                            {placeholder.name}
                          </code>
                          {placeholder.source && (
                            <Badge variant="outline" className="text-xs">
                              {placeholder.source}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{placeholder.description}</p>
                        {placeholder.example && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">例: </span>
                            <code className="bg-background px-1 rounded whitespace-pre-wrap">{placeholder.example}</code>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {info.notes && info.notes.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">備考</h4>
                    <ul className="text-sm space-y-1 pl-4">
                      {info.notes.map((note, i) => (
                        <li key={i} className="text-muted-foreground list-disc">{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
