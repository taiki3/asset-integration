'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Redirect to dashboard if mock auth is enabled
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_MOCK_AUTH === 'true') {
      router.push('/dashboard');
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setMessage(`エラー: ${error.message}`);
    } else {
      setMessage('ログインリンクをメールで送信しました。メールをご確認ください。');
    }

    setIsLoading(false);
  };

  const handleGoogleLogin = async () => {
    const supabase = createClient();

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0 gradient-bg" />
      <div className="absolute inset-0 grid-pattern opacity-30" />

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-md space-y-8 p-8">
        {/* Logo Section */}
        <div className="text-center fade-in stagger-1">
          <h1 className="font-display text-5xl font-black tracking-tighter text-gradient">
            ASIP
          </h1>
          <p className="mt-3 font-light text-muted-foreground tracking-wide">
            AGC Strategic Innovation Playbook
          </p>
        </div>

        {/* Login Card */}
        <div className="glass-card rounded-xl p-8 fade-in stagger-2">
          <div className="space-y-6">
            <Button
              variant="outline"
              className="w-full h-12 font-medium transition-all hover:shadow-glow hover:border-agc-gold"
              onClick={handleGoogleLogin}
            >
              <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Googleでログイン
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card/80 backdrop-blur-sm px-3 text-muted-foreground tracking-wider">
                  または
                </span>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  メールアドレス
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@agc.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 bg-background/50 backdrop-blur-sm border-border/50 focus:border-agc-gold transition-colors"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 font-medium bg-primary hover:bg-primary/90 transition-all hover:shadow-glow"
                disabled={isLoading}
              >
                {isLoading ? 'ログインリンクを送信中...' : 'メールでログイン'}
              </Button>
            </form>

            {message && (
              <p className="text-center text-sm text-muted-foreground fade-in-fast">
                {message}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/70 fade-in stagger-3">
          @agc.com ドメインのメールアドレスのみ使用可能です
        </p>
      </div>
    </div>
  );
}
