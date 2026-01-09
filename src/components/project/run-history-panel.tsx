'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Clock, CheckCircle, XCircle, Pause, Play, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Run } from '@/lib/db/schema';

interface RunHistoryPanelProps {
  runs: Run[];
}

const statusConfig = {
  pending: { icon: Clock, label: '待機中', className: 'text-muted-foreground' },
  running: { icon: Play, label: '実行中', className: 'text-blue-500' },
  paused: { icon: Pause, label: '一時停止', className: 'text-yellow-500' },
  completed: { icon: CheckCircle, label: '完了', className: 'text-green-500' },
  error: { icon: XCircle, label: 'エラー', className: 'text-red-500' },
  cancelled: { icon: AlertCircle, label: 'キャンセル', className: 'text-muted-foreground' },
};

export function RunHistoryPanel({ runs }: RunHistoryPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">実行履歴</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            実行履歴がありません
          </p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => {
              const status = statusConfig[run.status as keyof typeof statusConfig];
              const StatusIcon = status.icon;

              return (
                <Link
                  key={run.id}
                  href={`/projects/${run.projectId}/runs/${run.id}`}
                  className="flex items-center justify-between p-3 rounded-md hover:bg-muted transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{run.jobName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(run.createdAt), {
                        addSuffix: true,
                        locale: ja,
                      })}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1 shrink-0 ${status.className}`}>
                    <StatusIcon className="h-4 w-4" />
                    <span className="text-xs">{status.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
