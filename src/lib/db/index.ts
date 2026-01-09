import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/postgres';

// Always create real db connection for proper typing
// USE_MOCK_DB check should be done at the usage site
const client = postgres(connectionString, { prepare: false });
export const db: PostgresJsDatabase<typeof schema> = drizzle(client, { schema });
