import { Link } from "wouter";
import { Calendar, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { format } from "date-fns";
import type { Project } from "@shared/schema";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="group hover-elevate cursor-pointer transition-all duration-200" data-testid={`card-project-${project.id}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-medium leading-tight" data-testid={`text-project-title-${project.id}`}>
            {project.name}
          </CardTitle>
          <CardDescription className="line-clamp-2 min-h-[2.5rem]" data-testid={`text-project-description-${project.id}`}>
            {project.description || "説明なし"}
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex items-center justify-between gap-4 pt-3 border-t">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span data-testid={`text-project-date-${project.id}`}>
              {format(new Date(project.createdAt), "yyyy/MM/dd")}
            </span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </CardFooter>
      </Card>
    </Link>
  );
}
