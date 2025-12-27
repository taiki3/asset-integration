import { useState, useMemo, useCallback, useRef } from "react";
import { Upload, X, Check, Search, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface ColumnMappingRowProps {
  appColumn: string;
  csvColumns: string[];
  selectedCsvColumn: string;
  onSelect: (csvColumn: string) => void;
}

function ColumnMappingRow({ appColumn, csvColumns, selectedCsvColumn, onSelect }: ColumnMappingRowProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const filteredColumns = useMemo(() => {
    if (!searchValue) return csvColumns;
    const lower = searchValue.toLowerCase();
    return csvColumns.filter(col => col.toLowerCase().includes(lower));
  }, [csvColumns, searchValue]);

  return (
    <div className="flex items-center gap-4 py-2 border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block" title={appColumn}>
          {appColumn}
        </span>
      </div>
      <div className="flex-shrink-0 text-muted-foreground">→</div>
      <div className="flex-1 min-w-0">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between"
              data-testid={`mapping-select-${appColumn}`}
            >
              <span className="truncate">
                {selectedCsvColumn || "(未選択)"}
              </span>
              <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput 
                placeholder="列を検索..." 
                value={searchValue}
                onValueChange={setSearchValue}
                data-testid={`mapping-search-${appColumn}`}
              />
              <CommandList>
                <CommandEmpty>列が見つかりません</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value=""
                    onSelect={() => {
                      onSelect("");
                      setOpen(false);
                      setSearchValue("");
                    }}
                  >
                    <span className="text-muted-foreground">(選択解除)</span>
                  </CommandItem>
                  {filteredColumns.map((col) => (
                    <CommandItem
                      key={col}
                      value={col}
                      onSelect={() => {
                        onSelect(col);
                        setOpen(false);
                        setSearchValue("");
                      }}
                    >
                      {selectedCsvColumn === col && (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      <span className={selectedCsvColumn === col ? "" : "ml-6"}>
                        {col}
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
  );
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

        const initialMapping: Record<string, string> = {};
        headers.forEach(csvCol => {
          const exactMatch = existingColumns.find(
            appCol => appCol.toLowerCase() === csvCol.toLowerCase()
          );
          if (exactMatch) {
            initialMapping[csvCol] = exactMatch;
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

  const handleMappingChange = useCallback((csvCol: string, appCol: string) => {
    setColumnMapping(prev => {
      const newMapping = { ...prev };
      if (appCol) {
        newMapping[csvCol] = appCol;
      } else {
        delete newMapping[csvCol];
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
                {csvHeaders.map(csvCol => (
                  <div key={csvCol} className="flex items-center gap-4 py-2 border-b border-border last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between"
                            data-testid={`app-col-select-${csvCol}`}
                          >
                            <span className="truncate">
                              {columnMapping[csvCol] || "(未選択)"}
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
                                  onSelect={() => handleMappingChange(csvCol, "")}
                                >
                                  <span className="text-muted-foreground">(選択解除)</span>
                                </CommandItem>
                                {allAppColumns.map((appCol) => (
                                  <CommandItem
                                    key={appCol}
                                    value={appCol}
                                    onSelect={() => handleMappingChange(csvCol, appCol)}
                                  >
                                    {columnMapping[csvCol] === appCol && (
                                      <Check className="mr-2 h-4 w-4" />
                                    )}
                                    <span className={columnMapping[csvCol] === appCol ? "" : "ml-6"}>
                                      {appCol}
                                    </span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="flex-shrink-0 text-muted-foreground">←</div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block" title={csvCol}>
                        {csvCol}
                      </span>
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