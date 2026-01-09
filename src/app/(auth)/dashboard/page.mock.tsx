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

export default async function DashboardPage() {
  const userProjects = mockProjects;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">プロジェクト</h1>
          <p className="text-muted-foreground">
            仮説の生成と評価を行うプロジェクトを管理します
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      {userProjects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>プロジェクトがありません</CardTitle>
            <CardDescription>
              最初のプロジェクトを作成して、仮説の生成を始めましょう
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {userProjects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="transition-transform hover:scale-105"
            >
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>{project.name}</CardTitle>
                  <CardDescription>
                    {project.description || 'プロジェクトの説明がありません'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    作成日: {formatDate(project.createdAt)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}