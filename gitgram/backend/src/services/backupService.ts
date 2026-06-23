import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger';

const execAsync = promisify(exec);

export const createDatabaseBackup = async (): Promise<string> => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '../../backups');
  const backupFile = path.join(backupDir, `backup-${timestamp}.sql`);

  try {
    await fs.mkdir(backupDir, { recursive: true });

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL not set');

    await execAsync(`pg_dump ${dbUrl} > ${backupFile}`);

    logger.info(`Backup created: ${backupFile}`);
    return backupFile;
  } catch (error) {
    logger.error('Backup failed:', error);
    throw error;
  }
};

export const cleanOldBackups = async (daysToKeep = 7) => {
  const backupDir = path.join(__dirname, '../../backups');
  const files = await fs.readdir(backupDir);
  const now = Date.now();
  const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

  for (const file of files) {
    const filePath = path.join(backupDir, file);
    const stats = await fs.stat(filePath);
    const age = now - stats.mtimeMs;

    if (age > maxAge) {
      await fs.unlink(filePath);
      logger.info(`Deleted old backup: ${file}`);
    }
  }
};
