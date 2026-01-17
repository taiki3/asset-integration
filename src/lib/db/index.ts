import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/postgres';

// Optimized connection settings for serverless
// - prepare: false - Required for Supabase pooler (transaction mode)
// - max: 1 - Single connection per serverless instance
// - idle_timeout: 20 - Close idle connections after 20s
// - connect_timeout: 10 - Fail fast if connection takes too long
const client = postgres(connectionString, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db: PostgresJsDatabase<typeof schema> = drizzle(client, { schema });
