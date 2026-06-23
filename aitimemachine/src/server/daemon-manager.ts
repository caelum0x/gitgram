import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess, fork } from 'child_process';
import { platform } from '../utils/platform.js';
import { DaemonError } from '../errors.js';

const MAX_RESTART_ATTEMPTS = 5;
const RESTART_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000]; // Exponential backoff
const HEALTH_CHECK_INTERVAL_MS = 30000;

/**
 * Daemon Manager - Handles background daemon lifecycle
 * Makes auto-capture invisible and always-running
 */
export class DaemonManager {
  private pidFile: string;
  private logFile: string;
  private stateFile: string;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor() {
    const dataDir = platform.dataDir();
    platform.ensureDir(dataDir);
    this.pidFile = path.join(dataDir, 'daemon.pid');
    this.logFile = path.join(dataDir, 'daemon.log');
    this.stateFile = path.join(dataDir, 'daemon.state.json');
  }

  /**
   * Check if daemon is running
   */
  isRunning(): boolean {
    if (!fs.existsSync(this.pidFile)) return false;
    
    try {
      const pid = parseInt(fs.readFileSync(this.pidFile, 'utf-8').trim());
      // Check if process exists
      process.kill(pid, 0);
      return true;
    } catch {
      // Process doesn't exist, clean up stale pid file
      this.cleanup();
      return false;
    }
  }

  /**
   * Get daemon PID
   */
  getPid(): number | null {
    if (!fs.existsSync(this.pidFile)) return null;
    try {
      return parseInt(fs.readFileSync(this.pidFile, 'utf-8').trim());
    } catch {
      return null;
    }
  }

  /**
   * Get daemon state
   */
  getState(): DaemonState {
    const defaultState: DaemonState = {
      restartCount: 0,
      lastStartTime: null,
      lastCrashTime: null,
      crashCount: 0,
      projects: [],
    };

    if (!fs.existsSync(this.stateFile)) return defaultState;
    
    try {
      const content = fs.readFileSync(this.stateFile, 'utf-8');
      return { ...defaultState, ...JSON.parse(content) };
    } catch {
      return defaultState;
    }
  }

  /**
   * Save daemon state
   */
  private saveState(state: DaemonState): void {
    try {
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
    } catch (err) {
      this.log(`Failed to save state: ${(err as Error).message}`);
    }
  }

  /**
   * Start daemon in background with crash recovery
   */
  start(projectPath?: string, options?: { 
    recovery?: boolean; 
    supervisor?: boolean;
  }): { success: boolean; message: string; pid?: number } | Promise<{ success: boolean; message: string; pid?: number }> {
    if (this.isRunning()) {
      return { success: true, message: 'Daemon already running', pid: this.getPid()! };
    }

    const state = this.getState();
    
    // Check restart count for backoff
    if (state.crashCount >= MAX_RESTART_ATTEMPTS) {
      const lastCrash = state.lastCrashTime ? new Date(state.lastCrashTime).getTime() : 0;
      const cooldownMs = 60000; // 1 minute cooldown after max crashes
      if (Date.now() - lastCrash < cooldownMs) {
        return { 
          success: false, 
          message: `Too many crashes (${state.crashCount}). Wait ${Math.ceil((cooldownMs - (Date.now() - lastCrash)) / 1000)}s before retry.` 
        };
      }
      // Reset crash count after cooldown
      state.crashCount = 0;
    }

    const args = ['daemon'];
    if (options?.supervisor) {
      args.push('--supervisor');
    }
    if (projectPath) {
      args.push('--project', projectPath);
    }

    try {
      // Find the CLI script
      const cliPath = this.findCliPath();
      
      // Spawn detached process
      const child = spawn('node', [cliPath, ...args], {
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'],
        env: { 
          ...process.env, 
          AITM_DAEMON: '1', 
          ...(options?.recovery ? { AITM_RECOVERY: '1' } : {}) 
        },
      });

      child.unref();

      // Update state
      state.lastStartTime = new Date().toISOString();
      state.restartCount++;
      if (projectPath && !state.projects.includes(projectPath)) {
        state.projects.push(projectPath);
      }
      this.saveState(state);

      // Wait a moment for process to start
      return new Promise((resolve) => {
        setTimeout(() => {
          if (this.isRunning()) {
            resolve({ success: true, message: 'Daemon started', pid: this.getPid()! });
          } else {
            // Increment crash count on immediate failure
            state.crashCount++;
            state.lastCrashTime = new Date().toISOString();
            this.saveState(state);
            resolve({ success: false, message: 'Daemon failed to start' });
          }
        }, 500);
      });
    } catch (err) {
      return { success: false, message: `Failed to start: ${(err as Error).message}` };
    }
  }

  /**
   * Stop daemon gracefully
   */
  stop(): { success: boolean; message: string } {
    const pid = this.getPid();
    if (!pid) {
      return { success: true, message: 'Daemon not running' };
    }

    try {
      // Send SIGTERM for graceful shutdown
      process.kill(pid, 'SIGTERM');
      
      // Wait for process to exit (with timeout)
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        try {
          process.kill(pid, 0);
          // Process still running, wait a bit
          const { execSync } = require('child_process');
          execSync('sleep 0.5', { stdio: 'ignore' });
          attempts++;
        } catch {
          // Process exited
          break;
        }
      }

      // Force kill if still running
      if (attempts >= maxAttempts) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {}
      }

      this.cleanup();
      return { success: true, message: 'Daemon stopped' };
    } catch (err) {
      this.cleanup();
      return { success: false, message: `Failed to stop: ${(err as Error).message}` };
    }
  }

  /**
   * Restart daemon with optional backoff
   */
  restart(projectPath?: string): { success: boolean; message: string; pid?: number } | Promise<{ success: boolean; message: string; pid?: number }> {
    this.stop();
    return this.start(projectPath);
  }

  /**
   * Auto-restart on crash with exponential backoff
   */
  async autoRestart(projectPath?: string): Promise<{ success: boolean; message: string; pid?: number }> {
    const state = this.getState();
    const backoffIndex = Math.min(state.crashCount, RESTART_BACKOFF_MS.length - 1);
    const backoffMs = RESTART_BACKOFF_MS[backoffIndex];

    this.log(`Auto-restart in ${backoffMs}ms (crash #${state.crashCount + 1})`);
    
    await new Promise(resolve => setTimeout(resolve, backoffMs));
    
    return this.start(projectPath, { recovery: true }) as Promise<{ success: boolean; message: string; pid?: number }>;
  }

  /**
   * Get daemon status with health info
   */
  status(): DaemonStatus {
    const running = this.isRunning();
    if (!running) return { running: false };

    const pid = this.getPid();
    const state = this.getState();
    let uptime: string | undefined;

    try {
      const stats = fs.statSync(this.pidFile);
      const uptimeMs = Date.now() - stats.mtimeMs;
      uptime = this.formatUptime(uptimeMs);
    } catch {}

    return { 
      running: true, 
      pid: pid!, 
      uptime,
      restartCount: state.restartCount,
      crashCount: state.crashCount,
      projects: state.projects,
    };
  }

  /**
   * Write PID file (called by daemon process)
   */
  writePid(): void {
    fs.writeFileSync(this.pidFile, process.pid.toString());
  }

  /**
   * Register shutdown handlers for graceful exit
   */
  registerShutdownHandlers(onShutdown: () => void | Promise<void>): void {
    const shutdown = async (signal: string) => {
      this.log(`Received ${signal}, shutting down gracefully...`);
      try {
        await onShutdown();
      } catch (err) {
        this.log(`Error during shutdown: ${(err as Error).message}`);
      }
      this.cleanup();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('uncaughtException', (err) => {
      this.log(`Uncaught exception: ${err.message}\n${err.stack}`);
      const state = this.getState();
      state.crashCount++;
      state.lastCrashTime = new Date().toISOString();
      this.saveState(state);
      this.cleanup();
      process.exit(1);
    });
  }

  /**
   * Clean up PID file
   */
  cleanup(): void {
    try {
      if (fs.existsSync(this.pidFile)) {
        fs.unlinkSync(this.pidFile);
      }
    } catch {}
  }

  /**
   * Log message (for daemon process)
   */
  log(message: string): void {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(this.logFile, line);
  }

  /**
   * Get recent logs
   */
  getLogs(lines = 50): string[] {
    if (!fs.existsSync(this.logFile)) return [];
    
    try {
      const content = fs.readFileSync(this.logFile, 'utf-8');
      return content.split('\n').filter(l => l).slice(-lines);
    } catch {
      return [];
    }
  }

  private findCliPath(): string {
    // Try to find the CLI script
    const possiblePaths = [
      path.join(__dirname, '..', 'cli-v2.js'),
      path.join(__dirname, '..', '..', 'lib', 'cli-v2.js'),
      path.join(process.cwd(), 'node_modules', 'aitimemachine', 'lib', 'cli-v2.js'),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p;
    }

    // Fallback to global
    return 'aitm';
  }

  getCliPath(): string {
    return this.findCliPath();
  }

  private formatUptime(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }
}

interface DaemonState {
  restartCount: number;
  lastStartTime: string | null;
  lastCrashTime: string | null;
  crashCount: number;
  projects: string[];
}

interface DaemonStatus {
  running: boolean;
  pid?: number;
  uptime?: string;
  restartCount?: number;
  crashCount?: number;
  projects?: string[];
}

/**
 * Auto-start daemon on import if not running
 * This makes capture truly invisible
 */
export function ensureDaemonRunning(projectPath?: string): void {
  // Only auto-start if explicitly enabled
  if (process.env.AITM_AUTO_DAEMON !== '1') return;
  
  const manager = new DaemonManager();
  if (!manager.isRunning()) {
    manager.start(projectPath);
  }
}

export default DaemonManager;
