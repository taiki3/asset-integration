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
          Execute G-Method
        </CardTitle>
        <CardDescription>
          Select resources and run the hypothesis generation pipeline
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="space-y-6 flex-1">
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Target Specification
            </Label>
            <Select
              value={selectedTargetSpec}
              onValueChange={setSelectedTargetSpec}
              disabled={isExecuting}
            >
              <SelectTrigger data-testid="select-target-spec">
                <SelectValue placeholder="Select target specification..." />
              </SelectTrigger>
              <SelectContent>
                {targetSpecs.length === 0 ? (
                  <div className="py-4 px-2 text-sm text-muted-foreground text-center">
                    No target specs available. Add one first.
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
              Technical Assets
            </Label>
            <Select
              value={selectedTechnicalAssets}
              onValueChange={setSelectedTechnicalAssets}
              disabled={isExecuting}
            >
              <SelectTrigger data-testid="select-technical-assets">
                <SelectValue placeholder="Select technical assets..." />
              </SelectTrigger>
              <SelectContent>
                {technicalAssets.length === 0 ? (
                  <div className="py-4 px-2 text-sm text-muted-foreground text-center">
                    No technical assets available. Add one first.
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
                Processing...
              </>
            ) : (
              <>
                <Play className="h-5 w-5" />
                Run G-Method
              </>
            )}
          </Button>
          {!selectedTargetSpec && !selectedTechnicalAssets && (
            <p className="text-xs text-muted-foreground text-center mt-3">
              Select both resources to enable execution
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
