import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { useAuth } from "@/hooks/use-auth";
import Dashboard from "@/pages/Dashboard";
import ProjectWorkspace from "@/pages/ProjectWorkspace";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogIn, Mail } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/settings" component={Settings} />
      <Route path="/projects/:projectId">
        {(params) => <ProjectWorkspace projectId={params.projectId} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-medium">G-Method Platform</CardTitle>
          <CardDescription>
            ビジネス仮説生成のための自動化プラットフォーム
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center text-sm text-muted-foreground">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Mail className="h-4 w-4" />
              <span>agc.comドメインのメールアドレスでログイン</span>
            </div>
          </div>
          <Button
            size="lg"
            className="w-full gap-2"
            onClick={() => window.location.href = "/api/login"}
            data-testid="button-login"
          >
            <LogIn className="h-5 w-5" />
            ログイン
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            このアプリは@agc.comドメインのメールアドレスでのみご利用いただけます。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function AuthWrapper() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <LoadingPage />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        <Router />
      </div>
      <AppFooter />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <AuthWrapper />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
