import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { platform } from './utils/platform.js';
import { SessionServer } from './server/index.js';

interface S3Config {
  bucket: string;
  prefix: string;
  region?: string;
  profile?: string;
}

/**
 * S3 Backup - Sync all sessions to S3 bucket
 */
export class S3Backup {
  private server: SessionServer;
  private configPath: string;

  constructor() {
    this.server = new SessionServer();
    this.configPath = path.join(platform.dataDir(), 's3-config.json');
  }

  configure(bucket: string, prefix = 'aitimemachine', region?: string, profile?: string): void {
    const config: S3Config = { bucket, prefix, region, profile };
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  getConfig(): S3Config | null {
    if (!fs.existsSync(this.configPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  private awsCmd(config: S3Config): string {
    let cmd = 'aws';
    if (config.profile) cmd += ` --profile ${config.profile}`;
    if (config.region) cmd += ` --region ${config.region}`;
    return cmd;
  }

  /**
   * Backup all data to S3
   */
  async backup(): Promise<{ sessions: number; blobs: number; size: string }> {
    const config = this.getConfig();
    if (!config) throw new Error('S3 not configured. Run: aitm s3-config <bucket>');

    const dataDir = platform.dataDir();
    const s3Path = `s3://${config.bucket}/${config.prefix}`;
    const aws = this.awsCmd(config);

    // Sync sessions
    execSync(`${aws} s3 sync ${dataDir}/sessions ${s3Path}/sessions --quiet`, { stdio: 'pipe' });

    // Sync blobs
    execSync(`${aws} s3 sync ${dataDir}/blobs ${s3Path}/blobs --quiet`, { stdio: 'pipe' });

    // Get stats
    const sessions = fs.readdirSync(path.join(dataDir, 'sessions')).length;
    const blobs = fs.readdirSync(path.join(dataDir, 'blobs')).length;
    
    // Get total size
    const sizeOutput = execSync(`du -sh ${dataDir}`, { encoding: 'utf-8' });
    const size = sizeOutput.split('\t')[0];

    return { sessions, blobs, size };
  }

  /**
   * Restore from S3
   */
  async restore(): Promise<{ sessions: number; blobs: number }> {
    const config = this.getConfig();
    if (!config) throw new Error('S3 not configured');

    const dataDir = platform.dataDir();
    const s3Path = `s3://${config.bucket}/${config.prefix}`;
    const aws = this.awsCmd(config);

    // Sync from S3
    execSync(`${aws} s3 sync ${s3Path}/sessions ${dataDir}/sessions --quiet`, { stdio: 'pipe' });
    execSync(`${aws} s3 sync ${s3Path}/blobs ${dataDir}/blobs --quiet`, { stdio: 'pipe' });

    const sessions = fs.readdirSync(path.join(dataDir, 'sessions')).length;
    const blobs = fs.readdirSync(path.join(dataDir, 'blobs')).length;

    return { sessions, blobs };
  }

  /**
   * List backups in S3
   */
  async list(): Promise<{ sessions: number; lastModified?: string }> {
    const config = this.getConfig();
    if (!config) throw new Error('S3 not configured');

    const aws = this.awsCmd(config);
    const s3Path = `s3://${config.bucket}/${config.prefix}/sessions/`;

    try {
      const output = execSync(`${aws} s3 ls ${s3Path} --summarize`, { encoding: 'utf-8' });
      const lines = output.split('\n');
      const totalLine = lines.find(l => l.includes('Total Objects:'));
      const sessions = totalLine ? parseInt(totalLine.split(':')[1].trim()) : 0;
      
      // Get last modified from first file
      const firstFile = lines.find(l => l.includes('.json'));
      const lastModified = firstFile ? firstFile.substring(0, 19) : undefined;

      return { sessions, lastModified };
    } catch {
      return { sessions: 0 };
    }
  }
}
