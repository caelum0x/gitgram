import * as fs from 'fs';
import * as path from 'path';

export interface Config {
  autoConfirm: boolean;
  watchEnabled: boolean;
  maxSnapshots: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  maxFileSize?: number; // in bytes, default 10MB
}

export class ConfigManager {
  private config: Config = {
    autoConfirm: false,
    watchEnabled: true,
    maxSnapshots: 100,
    maxFileSize: 10 * 1024 * 1024, // 10MB
  };

  private configPath: string;

  constructor(projectPath: string) {
    this.configPath = path.join(projectPath, '.aitimemachine', 'config.json');
    this.loadConfig();
  }

  getConfig(): Config {
    return { ...this.config };
  }

  updateConfig(updates: Partial<Config>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        this.config = { ...this.config, ...data };
      }
    } catch (error) {
      console.warn('Failed to load config:', error);
    }
  }

  private saveConfig(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.warn('Failed to save config:', error);
    }
  }
}