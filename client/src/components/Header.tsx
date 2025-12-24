import { Link, useLocation } from "wouter";
import { ChevronRight, FolderOpen } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import type { Project } from "@shared/schema";

interface HeaderProps {
  project?: Project | null;
}

export function Header({ project }: HeaderProps) {
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-50 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-full items-center justify-between gap-4 px-6">
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/" className="flex items-center gap-2 font-medium text-foreground hover-elevate active-elevate-2 px-2 py-1 rounded-md" data-testid="link-dashboard">
            <FolderOpen className="h-4 w-4" />
            <span>G-Methodプラットフォーム</span>
          </Link>
          {project && (
            <>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground" data-testid="text-project-name">{project.name}</span>
            </>
          )}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
