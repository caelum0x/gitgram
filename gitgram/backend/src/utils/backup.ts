import { exec } from 'child_process';
import { promisify } from 'util';
import logger from './logger';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface BackupOptions {
  outputDir?: string;
  compress?: boolean;
  retentionDays?: number;
}

export async function createDatabaseBackup(options: BackupOptions = {}) {
  const {
    outputDir = './backups',
    compress = true,
    retentionDays = 7,
  } = options;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL not configured');
  }

  // Parse database URL
  const url = new URL(dbUrl);
  const dbName = url.pathname.slice(1);
  const dbHost = url.hostname;
  const dbPort = url.port || '5432';
  const dbUser = url.username;
  const dbPassword = url.password;

  // Create backup directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(outputDir, `backup-${timestamp}.sql`);
  const compressedFile = `${backupFile}.gz`;

  try {
    // Set PGPASSWORD environment variable
    process.env.PGPASSWORD = dbPassword;

    // Create backup using pg_dump
    const dumpCommand = `pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -F c -f ${backupFile}`;
    
    logger.info('Creating database backup...', { backupFile });
    await execAsync(dumpCommand);

    // Compress if requested
    if (compress) {
      logger.info('Compressing backup...');
      await execAsync(`gzip ${backupFile}`);
      await cleanupOldBackups(outputDir, retentionDays, '.sql.gz');
      return compressedFile;
    }

    await cleanupOldBackups(outputDir, retentionDays, '.sql');
    return backupFile;
  } catch (error: any) {
    logger.error('Backup failed:', error);
    throw error;
  } finally {
    // Clear password from environment
    delete process.env.PGPASSWORD;
  }
}

async function cleanupOldBackups(
  backupDir: string,
  retentionDays: number,
  extension: string
) {
  try {
    const files = fs.readdirSync(backupDir);
    const now = Date.now();
    const maxAge = retentionDays * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (file.endsWith(extension)) {
        const filePath = path.join(backupDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtime.getTime();

        if (age > maxAge) {
          fs.unlinkSync(filePath);
          logger.info('Deleted old backup', { file });
        }
      }
    }
  } catch (error) {
    logger.error('Cleanup failed:', error);
  }
}

export async function restoreDatabaseBackup(backupFile: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL not configured');
  }

  const url = new URL(dbUrl);
  const dbName = url.pathname.slice(1);
  const dbHost = url.hostname;
  const dbPort = url.port || '5432';
  const dbUser = url.username;
  const dbPassword = url.password;

  try {
    process.env.PGPASSWORD = dbPassword;

    // Check if file is compressed
    const isCompressed = backupFile.endsWith('.gz');
    let restoreCommand: string;

    if (isCompressed) {
      restoreCommand = `gunzip -c ${backupFile} | pg_restore -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -c`;
    } else {
      restoreCommand = `psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} < ${backupFile}`;
    }

    logger.info('Restoring database backup...', { backupFile });
    await execAsync(restoreCommand);
    logger.info('Database restored successfully');
  } catch (error: any) {
    logger.error('Restore failed:', error);
    throw error;
  } finally {
    delete process.env.PGPASSWORD;
  }
}

