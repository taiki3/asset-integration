/**
 * Mock authentication for local development
 *
 * When NEXT_PUBLIC_MOCK_AUTH=true, authentication is bypassed
 * and a mock user is used instead.
 */

import { User } from '@supabase/supabase-js';

export const MOCK_USER: User = {
  id: 'mock-user-001',
  email: 'dev@agc.com',
  app_metadata: {},
  user_metadata: {
    full_name: 'Developer',
  },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
};

export function isMockAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_AUTH === 'true';
}

export function getMockUser(): User {
  return MOCK_USER;
}
