import { cache } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isMockAuthEnabled, getMockUser } from './mock';

/**
 * Get current authenticated user (cached per request)
 * Returns mock user in development when NEXT_PUBLIC_MOCK_AUTH=true
 *
 * Uses React cache() to deduplicate auth calls within a single request.
 * Multiple components/functions calling getUser() will only hit Supabase once.
 */
export const getUser = cache(async (): Promise<User | null> => {
  if (isMockAuthEnabled()) {
    return getMockUser();
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/**
 * Require authenticated user or throw
 */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}
