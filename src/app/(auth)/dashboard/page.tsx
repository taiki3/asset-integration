// Force dynamic rendering to prevent database connection at build time
export const dynamic = 'force-dynamic';

import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq, isNull, desc, and } from 'drizzle-orm';
import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { CreateProjectDialog } from '@/components/create-project-dialog';
import { mockProjects } from '@/lib/db/mock';
import { FolderOpen } from 'lucide-react';

export default async function DashboardPage() {
  const useMockDb = process.env.USE_MOCK_DB === 'true';

  // Parallel fetch: auth + projects
  const [user, allProjects] = await Promise.all([
    getUser(),
    useMockDb
      ? Promise.resolve(mockProjects)
      : db
          .select()
          .from(projects)
          .where(isNull(projects.deletedAt))
          .orderBy(desc(projects.createdAt)),
  ]);

  if (!user) {
    return null;
  }

  // Filter by user after parallel fetch
  const userProjects = allProjects.filter(p => p.userId === user.id);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between fade-in stagger-1">
        <div>
          <h1 className="font-display text-4xl font-black tracking-tighter">
            プロジェクト
          </h1>
          <p className="mt-2 font-light text-muted-foreground">
            仮説生成プロジェクトの管理
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      {userProjects.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 fade-in stagger-2">
          <CardContent className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-light">
              プロジェクトがありません
            </p>
            <CreateProjectDialog />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {userProjects.map((project, index) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className={`fade-in stagger-${Math.min(index + 2, 8)}`}
            >
              <Card className="h-full card-hover glow-border cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {project.name}
                  </CardTitle>
                  <CardDescription>
                    作成日: {formatDate(project.createdAt)}
                  </CardDescription>
                </CardHeader>
                {project.description && (
                  <CardContent>
                    <p className="text-sm font-light text-muted-foreground line-clamp-2">
                      {project.description}
                    </p>
                  </CardContent>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
