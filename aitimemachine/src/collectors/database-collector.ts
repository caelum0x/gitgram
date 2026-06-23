import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface DatabaseState {
  type: 'sqlite' | 'postgres' | 'mysql' | 'mongodb' | 'redis' | 'unknown';
  detected: boolean;
  files?: string[];
  schema?: string;
  tables?: string[];
  connectionString?: string;
}

/**
 * Captures database state for a project
 */
export class DatabaseCollector {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = path.resolve(projectPath);
  }

  private run(cmd: string): string {
    try {
      return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd: this.projectPath }).trim();
    } catch {
      return '';
    }
  }

  capture(): DatabaseState[] {
    const databases: DatabaseState[] = [];

    // SQLite files
    const sqliteFiles = this.findFiles(['*.db', '*.sqlite', '*.sqlite3']);
    if (sqliteFiles.length > 0) {
      databases.push({
        type: 'sqlite',
        detected: true,
        files: sqliteFiles,
        tables: this.getSqliteTables(sqliteFiles[0]),
      });
    }

    // Check for database config in common files
    const envFile = path.join(this.projectPath, '.env');
    if (fs.existsSync(envFile)) {
      const env = fs.readFileSync(envFile, 'utf-8');
      
      if (env.includes('postgres') || env.includes('POSTGRES') || env.includes('PG_')) {
        databases.push({ type: 'postgres', detected: true });
      }
      if (env.includes('mysql') || env.includes('MYSQL')) {
        databases.push({ type: 'mysql', detected: true });
      }
      if (env.includes('mongodb') || env.includes('MONGO')) {
        databases.push({ type: 'mongodb', detected: true });
      }
      if (env.includes('redis') || env.includes('REDIS')) {
        databases.push({ type: 'redis', detected: true });
      }
    }

    // Check for Prisma schema
    const prismaSchema = path.join(this.projectPath, 'prisma', 'schema.prisma');
    if (fs.existsSync(prismaSchema)) {
      const schema = fs.readFileSync(prismaSchema, 'utf-8');
      const models = schema.match(/^model\s+(\w+)/gm)?.map(m => m.replace('model ', '')) || [];
      const dbType = schema.includes('postgresql') ? 'postgres' : 
                     schema.includes('mysql') ? 'mysql' : 
                     schema.includes('sqlite') ? 'sqlite' : 'unknown';
      
      const existing = databases.find(d => d.type === dbType);
      if (existing) {
        existing.schema = prismaSchema;
        existing.tables = models;
      } else {
        databases.push({ type: dbType, detected: true, schema: prismaSchema, tables: models });
      }
    }

    // Check for Drizzle schema
    const drizzleFiles = this.findFiles(['**/schema.ts', '**/db/schema.ts']);
    if (drizzleFiles.length > 0) {
      const content = fs.readFileSync(path.join(this.projectPath, drizzleFiles[0]), 'utf-8');
      const tables = content.match(/export const (\w+) = /g)?.map(m => m.replace('export const ', '').replace(' = ', '')) || [];
      if (tables.length > 0 && databases.length === 0) {
        databases.push({ type: 'unknown', detected: true, schema: drizzleFiles[0], tables });
      }
    }

    return databases;
  }

  private findFiles(patterns: string[]): string[] {
    const files: string[] = [];
    const scan = (dir: string, depth = 0) => {
      if (depth > 3) return;
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) scan(full, depth + 1);
          else {
            for (const pattern of patterns) {
              const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
              if (regex.test(entry.name)) {
                files.push(path.relative(this.projectPath, full));
              }
            }
          }
        }
      } catch {}
    };
    scan(this.projectPath);
    return files;
  }

  private getSqliteTables(dbFile: string): string[] {
    const fullPath = path.join(this.projectPath, dbFile);
    const output = this.run(`sqlite3 "${fullPath}" ".tables" 2>/dev/null`);
    return output.split(/\s+/).filter(Boolean);
  }

  /**
   * Backup SQLite database
   */
  backupSqlite(dbFile: string, backupDir: string): string | null {
    const fullPath = path.join(this.projectPath, dbFile);
    if (!fs.existsSync(fullPath)) return null;
    
    const backupPath = path.join(backupDir, `${path.basename(dbFile)}.backup`);
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(fullPath, backupPath);
    return backupPath;
  }
}
