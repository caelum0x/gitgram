import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

import { db, schema } from '../src/db/index.js';
import { count } from 'drizzle-orm';

async function main() {
  const result = await db.select({ count: count() }).from(schema.codeEmbeddings);
  console.log('Total embeddings:', result[0].count);

  const files = await db.select({ count: count() }).from(schema.indexedFiles);
  console.log('Total indexed files:', files[0].count);
  
  process.exit(0);
}
main();
