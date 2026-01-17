import { Loader2 } from 'lucide-react';

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">プロジェクトを読み込み中...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
