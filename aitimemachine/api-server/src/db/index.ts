import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";
import { logger } from "../lib/monitoring.js";

// Both Neon and node-postgres drivers share the same query API surface.
// We use NeonHttpDatabase as the canonical type since the API is identical.
export type Database = NeonHttpDatabase<typeof schema>;

const DEFAULT_LOCAL_DATABASE_URL = "postgresql://gitgram:gitgram_dev@localhost:5432/gitgram";
const nodeEnv = process.env.NODE_ENV || "development";
const isStrictEnv = nodeEnv === "production" || nodeEnv === "staging";
const connectionString = process.env.DATABASE_URL || (!isStrictEnv ? DEFAULT_LOCAL_DATABASE_URL : undefined);

if (!connectionString) {
  throw new Error("DATABASE_URL is required in production/staging");
}

if (!process.env.DATABASE_URL && !isStrictEnv) {
  logger.warn("DATABASE_URL not set, using local default", { defaultUrl: DEFAULT_LOCAL_DATABASE_URL });
}

const isNeonUrl = /neon\.tech|neon\.build/i.test(connectionString);

let dbInstance: Database;

if (isNeonUrl) {
  const sql = neon(connectionString) as NeonQueryFunction<boolean, boolean>;
  dbInstance = drizzleNeon(sql, { schema });
} else {
  const pool = new Pool({ connectionString });
  dbInstance = drizzlePg(pool, { schema }) as unknown as Database;
}

export const db: Database = dbInstance;

export { schema };
