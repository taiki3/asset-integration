import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isMockAuthEnabled, getMockUser } from './mock';

/**
 * Get current authenticated user
 * Returns mock user in development when NEXT_PUBLIC_MOCK_AUTH=true
 */
export async function getUser(): Promise<User | null> {
  if (isMockAuthEnabled()) {
    return getMockUser();
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

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
