import { Link, useLocation } from "wouter";
import { ChevronRight, FolderOpen, LogOut, Settings } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import type { Project } from "@shared/schema";

interface HeaderProps {
  project?: Project | null;
}

export function Header({ project }: HeaderProps) {
  const [location] = useLocation();
  const { user, logout, isLoggingOut } = useAuth();

  return (
    <header className="sticky top-0 z-50 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-full items-center justify-between gap-4 px-6">
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/" className="flex items-center gap-2 font-medium text-foreground hover-elevate active-elevate-2 px-2 py-1 rounded-md" data-testid="link-dashboard">
            <FolderOpen className="h-4 w-4" />
            <span>ASIP</span>
          </Link>
          {project && (
            <>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground" data-testid="text-project-name">{project.name}</span>
            </>
          )}
        </nav>
        <div className="flex items-center gap-3">
          {user && (
            <span className="text-sm text-muted-foreground" data-testid="text-user-email">
              {user.email}
            </span>
          )}
          <Link href="/settings">
            <Button variant="ghost" size="icon" data-testid="button-settings">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.location.href = "/api/logout"}
            disabled={isLoggingOut}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
