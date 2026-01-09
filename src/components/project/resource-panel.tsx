'use client';

import { useState } from 'react';
import { Plus, FileText, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Resource } from '@/lib/db/schema';

interface ResourcePanelProps {
  projectId: number;
  title: string;
  type: 'target_spec' | 'technical_assets';
  resources: Resource[];
}

export function ResourcePanel({ projectId, title, type, resources }: ResourcePanelProps) {
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const content = await file.text();

      const response = await fetch(`/api/projects/${projectId}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          name: file.name,
          content,
        }),
      });

      if (response.ok) {
        window.location.reload();
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (resourceId: number) => {
    if (!confirm('このリソースを削除しますか？')) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/resources/${resourceId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        window.location.reload();
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        <label>
          <input
            type="file"
            accept=".txt,.md,.json"
            className="hidden"
            onChange={handleFileUpload}
            disabled={isUploading}
          />
          <Button variant="ghost" size="icon" asChild disabled={isUploading}>
            <span className="cursor-pointer">
              {isUploading ? (
                <Upload className="h-4 w-4 animate-pulse" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </span>
          </Button>
        </label>
      </CardHeader>
      <CardContent>
        {resources.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            リソースがありません
          </p>
        ) : (
          <div className="space-y-2">
            {resources.map((resource) => (
              <div
                key={resource.id}
                className="flex items-center justify-between p-2 rounded-md hover:bg-muted"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm truncate">{resource.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(resource.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
