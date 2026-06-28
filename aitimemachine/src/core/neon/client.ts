import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';
import * as dotenv from 'dotenv';

dotenv.config();

type NeonDb = NeonHttpDatabase<typeof schema>;

let cachedDb: NeonDb | null = null;

/**
 * Returns true when cloud/Neon features are configured. Callers that treat the
 * cloud as optional should check this before touching `db`.
 */
export function isNeonConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Lazily construct the Neon-backed Drizzle client. Fails fast with an
 * actionable message when DATABASE_URL is unset, instead of building a client
 * against a bogus 'postgres://placeholder' host that would only surface an
 * opaque error at query time.
 */
export function getDb(): NeonDb {
  if (cachedDb) return cachedDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'Cloud/Neon database is not configured. Set the DATABASE_URL environment variable ' +
        '(a Neon Postgres connection string) to enable cloud commands.',
    );
  }

  const sql = neon(connectionString);
  cachedDb = drizzle(sql, { schema });
  return cachedDb;
}

/**
 * Proxy that defers to a real client on first use. Existing imports of `db`
 * keep working, but accessing any property without DATABASE_URL set throws the
 * clear configuration error above rather than failing later at query time.
 */
export const db: NeonDb = new Proxy({} as NeonDb, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
}) as NeonDb;
