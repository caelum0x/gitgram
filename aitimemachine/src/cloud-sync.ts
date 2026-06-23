import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { assertConsent } from './auth/consent-policy.js';
import { assertLicenseCompliance } from './compliance/license-policy.js';

export interface SyncConfig {
  endpoint?: string;
  apiKey?: string;
  projectId?: string;
}

/**
 * Cloud sync for backing up timepoints across devices
 */
export class CloudSync {
  private configPath: string;
  private config: SyncConfig = {};
  private basePath: string;

  constructor(private projectPath: string) {
    this.basePath = path.join(projectPath, '.aitimemachine');
    this.configPath = path.join(this.basePath, 'sync.json');
    this.loadConfig();
  }

  private loadConfig(): void {
    if (fs.existsSync(this.configPath)) {
      try {
        this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      } catch {}
    }
  }

  private saveConfig(): void {
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  configure(endpoint: string, apiKey: string): void {
    this.config = {
      endpoint,
      apiKey,
      projectId: this.config.projectId || crypto.randomUUID(),
    };
    this.saveConfig();
  }

  isConfigured(): boolean {
    return !!(this.config.endpoint && this.config.apiKey);
  }

  getConfig(): SyncConfig {
    return { ...this.config };
  }

  /**
   * Push timepoints to cloud
   */
  async push(): Promise<{ uploaded: number; errors: string[] }> {
    if (!this.isConfigured()) throw new Error('Not configured');

    assertConsent(this.projectPath, 'capture', {
      source: 'cloud-sync.push',
      resource: this.config.endpoint,
    });

    const tpDir = path.join(this.basePath, 'timepoints');
    if (!fs.existsSync(tpDir)) return { uploaded: 0, errors: [] };

    const files = fs.readdirSync(tpDir).filter(f => f.endsWith('.json'));
    let uploaded = 0;
    const errors: string[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(tpDir, file), 'utf-8');
        const res = await fetch(`${this.config.endpoint}/projects/${this.config.projectId}/timepoints/${file}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: content,
        });
        if (res.ok) uploaded++;
        else errors.push(`${file}: ${res.statusText}`);
      } catch (err) {
        errors.push(`${file}: ${(err as Error).message}`);
      }
    }

    return { uploaded, errors };
  }

  /**
   * Pull timepoints from cloud
   */
  async pull(): Promise<{ downloaded: number; errors: string[] }> {
    if (!this.isConfigured()) throw new Error('Not configured');

    let downloaded = 0;
    const errors: string[] = [];

    try {
      const res = await fetch(`${this.config.endpoint}/projects/${this.config.projectId}/timepoints`, {
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
      });

      if (!res.ok) throw new Error(res.statusText);

      const files = (await res.json()) as string[];
      const tpDir = path.join(this.basePath, 'timepoints');

      for (const file of files) {
        const localPath = path.join(tpDir, file);
        if (fs.existsSync(localPath)) continue;

        try {
          const tpRes = await fetch(`${this.config.endpoint}/projects/${this.config.projectId}/timepoints/${file}`, {
            headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
          });
          if (tpRes.ok) {
            fs.writeFileSync(localPath, await tpRes.text());
            downloaded++;
          }
        } catch (err) {
          errors.push(`${file}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      errors.push((err as Error).message);
    }

    return { downloaded, errors };
  }

  /**
   * Full sync
   */
  async sync(): Promise<{ pushed: number; pulled: number; errors: string[] }> {
    const pushResult = await this.push();
    const pullResult = await this.pull();
    return {
      pushed: pushResult.uploaded,
      pulled: pullResult.downloaded,
      errors: [...pushResult.errors, ...pullResult.errors],
    };
  }

  /**
   * Export all data to a portable file
   */
  export(outputPath: string): void {
    assertConsent(this.projectPath, 'export_operational', {
      source: 'cloud-sync.export',
      resource: outputPath,
    });

    const data: any = {
      projectId: this.config.projectId,
      exportedAt: new Date().toISOString(),
      timepoints: [],
      store: [],
      conversations: [],
    };

    // Export timepoints
    const tpDir = path.join(this.basePath, 'timepoints');
    if (fs.existsSync(tpDir)) {
      for (const file of fs.readdirSync(tpDir)) {
        data.timepoints.push({
          name: file,
          content: JSON.parse(fs.readFileSync(path.join(tpDir, file), 'utf-8')),
        });
      }
    }

    // Export content store
    const storeDir = path.join(this.basePath, 'store');
    if (fs.existsSync(storeDir)) {
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else {
            const rel = path.relative(storeDir, full);
            data.store.push({
              path: rel,
              content: fs.readFileSync(full, 'base64'),
            });
          }
        }
      };
      walk(storeDir);
    }

    // Export conversations
    const convDir = path.join(this.basePath, 'conversations');
    if (fs.existsSync(convDir)) {
      for (const file of fs.readdirSync(convDir)) {
        data.conversations.push({
          name: file,
          content: JSON.parse(fs.readFileSync(path.join(convDir, file), 'utf-8')),
        });
      }
    }

    fs.writeFileSync(outputPath, JSON.stringify(data));
  }

  /**
   * Import from a portable file
   */
  import(inputPath: string): { timepoints: number; files: number; conversations: number } {
    assertLicenseCompliance(this.projectPath, 'repo_ingest');
    const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    let timepoints = 0, files = 0, conversations = 0;

    // Import timepoints
    const tpDir = path.join(this.basePath, 'timepoints');
    if (!fs.existsSync(tpDir)) fs.mkdirSync(tpDir, { recursive: true });
    for (const tp of data.timepoints || []) {
      const dest = path.join(tpDir, tp.name);
      if (!fs.existsSync(dest)) {
        fs.writeFileSync(dest, JSON.stringify(tp.content, null, 2));
        timepoints++;
      }
    }

    // Import store
    const storeDir = path.join(this.basePath, 'store');
    for (const file of data.store || []) {
      const dest = path.join(storeDir, file.path);
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, Buffer.from(file.content, 'base64'));
        files++;
      }
    }

    // Import conversations
    const convDir = path.join(this.basePath, 'conversations');
    if (!fs.existsSync(convDir)) fs.mkdirSync(convDir, { recursive: true });
    for (const conv of data.conversations || []) {
      const dest = path.join(convDir, conv.name);
      if (!fs.existsSync(dest)) {
        fs.writeFileSync(dest, JSON.stringify(conv.content, null, 2));
        conversations++;
      }
    }

    // Rebuild index
    this.rebuildIndex();

    return { timepoints, files, conversations };
  }

  private rebuildIndex(): void {
    const tpDir = path.join(this.basePath, 'timepoints');
    const indexPath = path.join(this.basePath, 'index.json');
    
    if (!fs.existsSync(tpDir)) return;

    const index: Record<string, { timestamp: string; description: string }> = {};
    
    for (const file of fs.readdirSync(tpDir)) {
      try {
        const tp = JSON.parse(fs.readFileSync(path.join(tpDir, file), 'utf-8'));
        const id = file.replace('.json', '');
        index[id] = {
          timestamp: tp.timestamp,
          description: tp.description,
        };
      } catch {}
    }

    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }
}
