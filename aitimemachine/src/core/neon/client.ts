import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.warn('DATABASE_URL not set. Neon features will be disabled.');
}

const sql = neon(connectionString || 'postgres://placeholder');
export const db = drizzle(sql, { schema });
