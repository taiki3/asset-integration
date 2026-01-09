import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { mockDb } from './mock';

const connectionString = process.env.DATABASE_URL!;
const useMockDb = process.env.USE_MOCK_DB === 'true';

export const db = useMockDb 
  ? mockDb 
  : drizzle(
      postgres(connectionString, { prepare: false }), 
      { schema }
    );
