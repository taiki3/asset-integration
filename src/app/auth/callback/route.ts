import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check email domain restriction
      const { data: { user } } = await supabase.auth.getUser();

      if (user && process.env.ALLOWED_EMAIL_DOMAINS) {
        const allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS.split(',').map(d => d.trim());
        const userDomain = user.email?.split('@')[1];

        if (userDomain && !allowedDomains.includes(userDomain)) {
          // Sign out unauthorized user
          await supabase.auth.signOut();

          const forwardedHost = request.headers.get('x-forwarded-host');
          const isLocalEnv = process.env.NODE_ENV === 'development';
          const baseUrl = isLocalEnv ? origin : (forwardedHost ? `https://${forwardedHost}` : origin);

          return NextResponse.redirect(`${baseUrl}/unauthorized`);
        }
      }

      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_error`);
}
