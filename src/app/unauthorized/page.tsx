'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function UnauthorizedPage() {
  const router = useRouter();

  useEffect(() => {
    // Clear any remaining auth state
    const timer = setTimeout(() => {
      router.push('/login');
    }, 10000); // Auto-redirect after 10 seconds

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <ShieldX className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-xl">アクセスが拒否されました</CardTitle>
          <CardDescription>
            このアプリケーションは許可されたドメインのメールアドレスでのみ利用可能です。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            @agc.com のメールアドレスでログインしてください。
          </p>
          <Button
            className="w-full"
            onClick={() => router.push('/login')}
          >
            ログインページに戻る
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
