import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function Header() {
  return (
    <header className="border-b">
      <div className="flex h-16 items-center px-4">
        <Link href="/" className="flex items-center space-x-2">
          <h1 className="text-xl font-bold">ASIP</h1>
        </Link>
        <div className="ml-auto flex items-center space-x-4">
          <Button variant="ghost" size="sm">
            ダッシュボード
          </Button>
        </div>
      </div>
    </header>
  );
}