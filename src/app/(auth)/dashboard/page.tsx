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

export default async function DashboardPage() {
  const user = await getUser();

  if (!user) {
    return null;
  }

  const userProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, user.id), isNull(projects.deletedAt)))
    .orderBy(desc(projects.createdAt));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light tracking-tight">プロジェクト</h1>
          <p className="mt-2 text-muted-foreground">
            仮説生成プロジェクトの管理
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      {userProjects.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">
              プロジェクトがありません
            </p>
            <CreateProjectDialog />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {userProjects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-lg font-medium">
                    {project.name}
                  </CardTitle>
                  <CardDescription>
                    作成日: {formatDate(project.createdAt)}
                  </CardDescription>
                </CardHeader>
                {project.description && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">
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
