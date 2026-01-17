'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { Upload, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

// App columns for hypothesis import
const HYPOTHESIS_COLUMNS = [
  { key: 'hypothesisNumber', label: '仮説番号' },
  { key: 'displayTitle', label: '仮説タイトル' },
  { key: 'step2_1Summary', label: '概要 (S2-1)' },
];

interface CsvImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (
    rows: Record<string, string>[],
    columnMapping: Record<string, string>
  ) => Promise<void>;
}

type Step = 'upload' | 'mapping';

/**
 * Parse CSV/TSV text into headers and rows
 */
function parseCSV(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  // Auto-detect delimiter (tab for TSV, comma for CSV)
  const delimiter = lines[0].includes('\t') ? '\t' : ',';

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
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
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    return row;
  });

  return { headers, rows };
}

export function CsvImportModal({ open, onClose, onImport }: CsvImportModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setError(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const { headers, rows } = parseCSV(text);

          if (headers.length === 0) {
            setError('CSVファイルにデータがありません');
            return;
          }

          setCsvHeaders(headers);
          setCsvRows(rows);

          // Auto-match columns
          const initialMapping: Record<string, string> = {};
          HYPOTHESIS_COLUMNS.forEach(({ key }) => {
            const exactMatch = headers.find(
              (csvCol) => csvCol.toLowerCase() === key.toLowerCase()
            );
            if (exactMatch) {
              initialMapping[key] = exactMatch;
            }
          });
          setColumnMapping(initialMapping);
          setStep('mapping');
        } catch {
          setError('CSVファイルの解析に失敗しました');
        }
      };
      reader.onerror = () => {
        setError('ファイルの読み込みに失敗しました');
      };
      reader.readAsText(file);
    },
    []
  );

  const handleMappingChange = useCallback((appCol: string, csvCol: string) => {
    setColumnMapping((prev) => {
      const newMapping = { ...prev };
      if (csvCol && csvCol !== '__none__') {
        newMapping[appCol] = csvCol;
      } else {
        delete newMapping[appCol];
      }
      return newMapping;
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (Object.keys(columnMapping).length === 0) {
      setError('少なくとも1つの列をマッピングしてください');
      return;
    }

    setImporting(true);
    setError(null);
    try {
      await onImport(csvRows, columnMapping);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'インポートに失敗しました');
    } finally {
      setImporting(false);
    }
  }, [csvRows, columnMapping, onImport]);

  const handleClose = useCallback(() => {
    setStep('upload');
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMapping({});
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  }, [onClose]);

  const mappedCount = Object.keys(columnMapping).length;

  // Get columns to display in mapping step
  const displayColumns = useMemo(() => {
    // Add any new columns from CSV that aren't in our predefined list
    const existingKeys = HYPOTHESIS_COLUMNS.map((c) => c.key.toLowerCase());
    const result = [...HYPOTHESIS_COLUMNS];

    csvHeaders.forEach((h) => {
      if (!existingKeys.includes(h.toLowerCase())) {
        result.push({ key: h, label: h });
      }
    });

    return result;
  }, [csvHeaders]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent
        className="max-w-2xl max-h-[80vh] flex flex-col"
        data-testid="csv-import-modal"
      >
        <DialogHeader>
          <DialogTitle>仮説CSVインポート</DialogTitle>
          <DialogDescription>
            {step === 'upload'
              ? 'CSVまたはTSVファイルをアップロードしてください'
              : `${csvRows.length}行を検出しました。列の紐づけを設定してください`}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === 'upload' ? (
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
                {' / '}
                {HYPOTHESIS_COLUMNS.length} 列をマッピング済み
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
                {displayColumns.map(({ key, label }) => (
                  <div
                    key={key}
                    className="flex items-center gap-4 py-2 border-b border-border last:border-b-0"
                  >
                    <div className="flex-1 min-w-0">
                      <span
                        className="text-sm font-medium truncate block"
                        title={label}
                      >
                        {label}
                      </span>
                    </div>
                    <div className="flex-shrink-0 text-muted-foreground">←</div>
                    <div className="flex-1 min-w-0">
                      <Select
                        value={columnMapping[key] || '__none__'}
                        onValueChange={(value) => handleMappingChange(key, value)}
                      >
                        <SelectTrigger
                          className="w-full"
                          data-testid={`csv-col-select-${key}`}
                        >
                          <SelectValue placeholder="(未選択)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">(未選択)</SelectItem>
                          {csvHeaders.map((csvCol) => (
                            <SelectItem key={csvCol} value={csvCol}>
                              {csvCol}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'mapping' && (
            <Button
              variant="outline"
              onClick={() => {
                setStep('upload');
                setCsvHeaders([]);
                setCsvRows([]);
                setColumnMapping({});
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
              data-testid="button-back-to-upload"
            >
              戻る
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={handleClose}
            data-testid="button-cancel-import"
          >
            キャンセル
          </Button>
          {step === 'mapping' && (
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
