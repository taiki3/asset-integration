'use client';

import Link from 'next/link';
import { ArrowLeft, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Project } from '@/lib/db/schema';

interface ProjectHeaderProps {
  project: Project;
}

export function ProjectHeader({ project }: ProjectHeaderProps) {
  return (
    <div className="flex items-center justify-between fade-in">
      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="rounded-lg hover:bg-accent/10">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="font-display text-3xl font-black tracking-tighter">
            {project.name}
          </h1>
          {project.description && (
            <p className="text-sm font-light text-muted-foreground mt-1">
              {project.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-lg hover:bg-accent/10">
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-lg hover:bg-aurora-red/10 hover:text-aurora-red"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
