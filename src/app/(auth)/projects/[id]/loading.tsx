import { Loader2 } from 'lucide-react';

export default function ProjectLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <div className="h-8 w-8 bg-muted animate-pulse rounded" />
          <div className="h-6 w-64 bg-muted animate-pulse rounded" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="border-b bg-card/50">
        <div className="container mx-auto px-4">
          <div className="flex gap-4 py-2">
            <div className="h-8 w-24 bg-muted animate-pulse rounded" />
            <div className="h-8 w-24 bg-muted animate-pulse rounded" />
            <div className="h-8 w-24 bg-muted animate-pulse rounded" />
          </div>
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
