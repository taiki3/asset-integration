'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { User } from '@supabase/supabase-js';
import { LogOut, Settings, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

interface HeaderProps {
  user: User;
}

export function Header({ user }: HeaderProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-card/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link
            href="/dashboard"
            className="group flex items-center gap-2"
          >
            <span className="font-display text-2xl font-black tracking-tighter text-gradient">
              ASIP
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/dashboard"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent/10"
            >
              ダッシュボード
            </Link>
            <Link
              href="/settings"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent/10"
            >
              設定
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-sm font-light text-muted-foreground">
            {user.email}
          </span>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="relative h-9 w-9 rounded-md hover:bg-accent/10 transition-colors"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-aurora-yellow" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-frost" />
              <span className="sr-only">テーマを切り替え</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              asChild
              className="h-9 w-9 rounded-md hover:bg-accent/10 transition-colors"
            >
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                <span className="sr-only">設定</span>
              </Link>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="h-9 w-9 rounded-md hover:bg-aurora-red/10 hover:text-aurora-red transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="sr-only">ログアウト</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
