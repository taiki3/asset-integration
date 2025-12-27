import { useState, useMemo, useCallback, useRef } from "react";
import { Upload, Check, Search, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface CsvImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: Record<string, string>[], columnMapping: Record<string, string>) => Promise<void>;
  existingColumns: string[];
}

type Step = "upload" | "mapping";

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || "";
    });
    return row;
  });

  return { headers, rows };
}

export function CsvImportModal({ open, onClose, onImport, existingColumns }: CsvImportModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const { headers, rows } = parseCSV(text);
        
        if (headers.length === 0) {
          setError("CSVファイルにデータがありません");
          return;
        }

        setCsvHeaders(headers);
        setCsvRows(rows);

        // Auto-match: for each existing app column, find matching CSV column
        const initialMapping: Record<string, string> = {};
        existingColumns.forEach(appCol => {
          const exactMatch = headers.find(
            csvCol => csvCol.toLowerCase() === appCol.toLowerCase()
          );
          if (exactMatch) {
            initialMapping[appCol] = exactMatch;
          }
        });
        // Also auto-match new columns from CSV
        headers.forEach(csvCol => {
          if (!existingColumns.some(ac => ac.toLowerCase() === csvCol.toLowerCase())) {
            // New column from CSV, auto-map to itself
            initialMapping[csvCol] = csvCol;
          }
        });
        setColumnMapping(initialMapping);
        setStep("mapping");
      } catch (err) {
        setError("CSVファイルの解析に失敗しました");
      }
    };
    reader.onerror = () => {
      setError("ファイルの読み込みに失敗しました");
    };
    reader.readAsText(file);
  }, [existingColumns]);

  const handleMappingChange = useCallback((appCol: string, csvCol: string) => {
    setColumnMapping(prev => {
      const newMapping = { ...prev };
      if (csvCol) {
        newMapping[appCol] = csvCol;
      } else {
        delete newMapping[appCol];
      }
      return newMapping;
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (Object.keys(columnMapping).length === 0) {
      setError("少なくとも1つの列をマッピングしてください");
      return;
    }

    setImporting(true);
    setError(null);
    try {
      await onImport(csvRows, columnMapping);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "インポートに失敗しました");
    } finally {
      setImporting(false);
    }
  }, [csvRows, columnMapping, onImport]);

  const handleClose = useCallback(() => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMapping({});
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onClose();
  }, [onClose]);

  const mappedCount = Object.keys(columnMapping).length;
  const allAppColumns = useMemo(() => {
    const colSet = new Set(existingColumns);
    csvHeaders.forEach(h => {
      if (!Array.from(colSet).some(c => c.toLowerCase() === h.toLowerCase())) {
        colSet.add(h);
      }
    });
    return Array.from(colSet);
  }, [existingColumns, csvHeaders]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>仮説CSVインポート</DialogTitle>
          <DialogDescription>
            {step === "upload" 
              ? "CSVまたはTSVファイルをアップロードしてください"
              : `${csvRows.length}行を検出しました。列の紐づけを設定してください`
            }
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === "upload" ? (
          <div className="flex-1 flex flex-col items-center justify-center py-8">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFileChange}
              className="hidden"
              data-testid="csv-file-input"
            />
            <Button
              variant="outline"
              size="lg"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-upload-csv"
            >
              <Upload className="h-5 w-5" />
              ファイルを選択
            </Button>
            <p className="text-sm text-muted-foreground mt-4">
              CSV, TSV形式に対応しています
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{mappedCount}</span>
                {" / "}
                {csvHeaders.length} 列をマッピング済み
              </div>
            </div>
            
            <div className="flex items-center gap-4 py-2 border-b-2 border-border mb-2">
              <div className="flex-1 text-sm font-semibold text-muted-foreground">
                アプリ側列名
              </div>
              <div className="flex-shrink-0 w-4" />
              <div className="flex-1 text-sm font-semibold text-muted-foreground">
                CSV列名
              </div>
            </div>

            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-1">
                {allAppColumns.map(appCol => (
                  <div key={appCol} className="flex items-center gap-4 py-2 border-b border-border last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block" title={appCol}>
                        {appCol}
                      </span>
                    </div>
                    <div className="flex-shrink-0 text-muted-foreground">←</div>
                    <div className="flex-1 min-w-0">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between"
                            data-testid={`csv-col-select-${appCol}`}
                          >
                            <span className="truncate">
                              {columnMapping[appCol] || "(未選択)"}
                            </span>
                            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-0" align="start">
                          <Command>
                            <CommandInput placeholder="列を検索..." />
                            <CommandList>
                              <CommandEmpty>列が見つかりません</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  value=""
                                  onSelect={() => handleMappingChange(appCol, "")}
                                >
                                  <span className="text-muted-foreground">(選択解除)</span>
                                </CommandItem>
                                {csvHeaders.map((csvCol) => (
                                  <CommandItem
                                    key={csvCol}
                                    value={csvCol}
                                    onSelect={() => handleMappingChange(appCol, csvCol)}
                                  >
                                    {columnMapping[appCol] === csvCol && (
                                      <Check className="mr-2 h-4 w-4" />
                                    )}
                                    <span className={columnMapping[appCol] === csvCol ? "" : "ml-6"}>
                                      {csvCol}
                                    </span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "mapping" && (
            <Button
              variant="outline"
              onClick={() => {
                setStep("upload");
                setCsvHeaders([]);
                setCsvRows([]);
                setColumnMapping({});
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
              data-testid="button-back-to-upload"
            >
              戻る
            </Button>
          )}
          <Button variant="ghost" onClick={handleClose} data-testid="button-cancel-import">
            キャンセル
          </Button>
          {step === "mapping" && (
            <Button
              onClick={handleImport}
              disabled={importing || mappedCount === 0}
              data-testid="button-execute-import"
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  インポート中...
                </>
              ) : (
                <>インポート ({csvRows.length}件)</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}