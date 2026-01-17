import { Loader2 } from 'lucide-react';

export default function RunDetailLoading() {
  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header skeleton */}
      <div className="border-b bg-card">
        <div className="px-4 py-4 flex items-center gap-4">
          <div className="h-8 w-8 bg-muted animate-pulse rounded" />
          <div className="flex-1">
            <div className="h-6 w-48 bg-muted animate-pulse rounded mb-2" />
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-20 bg-muted animate-pulse rounded" />
            <div className="h-8 w-20 bg-muted animate-pulse rounded" />
          </div>
        </div>
      </div>

      {/* Progress bar skeleton */}
      <div className="p-4 border-b bg-muted/30">
        <div className="flex justify-between mb-2">
          <div className="h-4 w-40 bg-muted animate-pulse rounded" />
          <div className="h-4 w-12 bg-muted animate-pulse rounded" />
        </div>
        <div className="flex gap-1">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex-1 h-2 bg-muted animate-pulse rounded-full" />
          ))}
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 flex">
        {/* Sidebar skeleton */}
        <div className="w-[300px] border-r p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-3 border rounded-lg">
              <div className="h-4 w-full bg-muted animate-pulse rounded mb-2" />
              <div className="h-3 w-2/3 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>

        {/* Detail area */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Run詳細を読み込み中...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
