import { useState } from "react";
import { Play, Loader2, Target, Cpu } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Resource } from "@shared/schema";

interface ExecutionPanelProps {
  targetSpecs: Resource[];
  technicalAssets: Resource[];
  onExecute: (targetSpecId: number, technicalAssetsId: number) => void;
  isExecuting?: boolean;
}

export function ExecutionPanel({
  targetSpecs,
  technicalAssets,
  onExecute,
  isExecuting,
}: ExecutionPanelProps) {
  const [selectedTargetSpec, setSelectedTargetSpec] = useState<string>("");
  const [selectedTechnicalAssets, setSelectedTechnicalAssets] = useState<string>("");

  const canExecute =
    selectedTargetSpec &&
    selectedTechnicalAssets &&
    !isExecuting;

  const handleExecute = () => {
    if (!canExecute) return;
    onExecute(parseInt(selectedTargetSpec), parseInt(selectedTechnicalAssets));
  };

  return (
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
  );
}
