import { Link } from "wouter";
import { Calendar, ArrowRight, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import type { Project } from "@shared/schema";

interface ProjectCardProps {
  project: Project;
  onDelete: (id: number) => void;
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  return (
    <Card className="group hover-elevate transition-all duration-200" data-testid={`card-project-${project.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg font-medium leading-tight" data-testid={`text-project-title-${project.id}`}>
            {project.name}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(project.id);
            }}
            data-testid={`button-delete-project-${project.id}`}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
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
        <Link href={`/projects/${project.id}`}>
          <Button variant="ghost" size="sm" className="gap-1" data-testid={`button-open-project-${project.id}`}>
            開く
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
