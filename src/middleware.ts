import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // Skip auth in mock mode
  if (process.env.NEXT_PUBLIC_MOCK_AUTH === 'true') {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Only match specific paths that need auth:
     * - /dashboard
     * - /projects
     * - /settings
     */
    '/dashboard/:path*',
    '/projects/:path*',
    '/settings/:path*',
  ],
};
