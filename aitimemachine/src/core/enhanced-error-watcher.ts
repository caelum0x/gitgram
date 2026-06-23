import { TimeMachineEngine } from './engine.js';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface ErrorPattern {
  name: string;
  pattern: RegExp;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
}

export interface WatchEvent {
  type: 'start' | 'output' | 'error' | 'success' | 'failure' | 'checkpoint';
  timestamp: Date;
  data?: any;
}

const DEFAULT_ERROR_PATTERNS: ErrorPattern[] = [
  // JavaScript/TypeScript
  { name: 'syntax-error', pattern: /SyntaxError:|Unexpected token/i, severity: 'error' },
  { name: 'type-error', pattern: /TypeError:|is not a function|Cannot read propert/i, severity: 'error' },
  { name: 'reference-error', pattern: /ReferenceError:|is not defined/i, severity: 'error' },
  { name: 'module-not-found', pattern: /Cannot find module|Module not found/i, severity: 'error', suggestion: 'Run npm install' },
  { name: 'ts-error', pattern: /error TS\d+:/i, severity: 'error' },
  
  // Build tools
  { name: 'webpack-error', pattern: /ERROR in|Module build failed/i, severity: 'error' },
  { name: 'vite-error', pattern: /\[vite\].*error/i, severity: 'error' },
  { name: 'esbuild-error', pattern: /✘ \[ERROR\]/i, severity: 'error' },
  
  // Test frameworks
  { name: 'jest-fail', pattern: /FAIL|✕|\d+ failed/i, severity: 'error' },
  { name: 'vitest-fail', pattern: /FAIL|×|\d+ failed/i, severity: 'error' },
  { name: 'mocha-fail', pattern: /failing|\d+ failing/i, severity: 'error' },
  
  // Python
  { name: 'python-error', pattern: /Traceback \(most recent call last\)|IndentationError:|NameError:/i, severity: 'error' },
  { name: 'pytest-fail', pattern: /FAILED|ERROR.*test_/i, severity: 'error' },
  
  // Rust
  { name: 'rust-error', pattern: /error\[E\d+\]:|cannot find|mismatched types/i, severity: 'error' },
  
  // Go
  { name: 'go-error', pattern: /cannot|undefined:|syntax error/i, severity: 'error' },
  
  // General
  { name: 'stack-trace', pattern: /at .+:\d+:\d+|^\s+at\s+/m, severity: 'info' },
  { name: 'deprecation', pattern: /deprecated|DeprecationWarning/i, severity: 'warning' },
  { name: 'permission-denied', pattern: /EACCES|Permission denied/i, severity: 'error', suggestion: 'Check file permissions' },
  { name: 'port-in-use', pattern: /EADDRINUSE|address already in use/i, severity: 'error', suggestion: 'Kill process using the port' },
  { name: 'out-of-memory', pattern: /ENOMEM|JavaScript heap out of memory/i, severity: 'error', suggestion: 'Increase Node memory limit' },
];

export class EnhancedErrorWatcher extends EventEmitter {
  private patterns: ErrorPattern[];
  private process?: ChildProcess;
  private outputBuffer: string[] = [];
  private errorCount = 0;
  private lastGoodCheckpoint?: string;
  private isRunning = false;

  constructor(
    private engine: TimeMachineEngine,
    customPatterns?: ErrorPattern[]
  ) {
    super();
    this.patterns = [...DEFAULT_ERROR_PATTERNS, ...(customPatterns || [])];
  }

  async watch(command: string, options: {
    interval?: number;
    autoCheckpoint?: boolean;
    maxErrors?: number;
  } = {}): Promise<void> {
    const { interval = 0, autoCheckpoint = true, maxErrors = 10 } = options;
    this.isRunning = true;
    this.errorCount = 0;

    const runOnce = async () => {
      if (!this.isRunning) return;

      this.emit('event', { type: 'start', timestamp: new Date() } as WatchEvent);
      this.outputBuffer = [];

      const result = await this.executeCommand(command);
      const errors = this.analyzeOutput(result.output);

      if (result.success) {
        this.errorCount = 0;
        this.emit('event', { 
          type: 'success', 
          timestamp: new Date(),
          data: { duration: result.duration }
        } as WatchEvent);

        if (autoCheckpoint) {
          const tp = this.engine.capture('✅ Watch: Success', { type: 'auto', action: 'watch-success' });
          this.lastGoodCheckpoint = tp.id;
          this.emit('event', { type: 'checkpoint', timestamp: new Date(), data: { id: tp.id } } as WatchEvent);
        }
      } else {
        this.errorCount++;
        this.emit('event', { 
          type: 'failure', 
          timestamp: new Date(),
          data: { errors, exitCode: result.exitCode, errorCount: this.errorCount }
        } as WatchEvent);

        // Capture error state
        if (autoCheckpoint && this.errorCount === 1) {
          const tp = this.engine.capture('❌ Watch: First failure', { type: 'auto', action: 'watch-fail' });
          this.emit('event', { type: 'checkpoint', timestamp: new Date(), data: { id: tp.id } } as WatchEvent);
        }

        // Suggest restore if too many errors
        if (this.errorCount >= maxErrors && this.lastGoodCheckpoint) {
          this.emit('suggest-restore', {
            checkpointId: this.lastGoodCheckpoint,
            errorCount: this.errorCount,
            errors
          });
        }
      }

      if (interval > 0 && this.isRunning) {
        setTimeout(runOnce, interval);
      }
    };

    await runOnce();
  }

  stop(): void {
    this.isRunning = false;
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
  }

  private executeCommand(command: string): Promise<{ success: boolean; output: string; exitCode: number; duration: number }> {
    return new Promise((resolve) => {
      const start = Date.now();
      const [cmd, ...args] = command.split(' ');
      
      this.process = spawn(cmd, args, {
        shell: true,
        cwd: this.engine.getProjectPath(),
        env: { ...process.env, FORCE_COLOR: '1' }
      });

      let output = '';

      this.process.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        this.outputBuffer.push(text);
        this.emit('event', { type: 'output', timestamp: new Date(), data: { text, stream: 'stdout' } } as WatchEvent);
      });

      this.process.stderr?.on('data', (data) => {
        const text = data.toString();
        output += text;
        this.outputBuffer.push(text);
        this.emit('event', { type: 'output', timestamp: new Date(), data: { text, stream: 'stderr' } } as WatchEvent);
      });

      this.process.on('close', (code) => {
        this.process = undefined;
        resolve({
          success: code === 0,
          output,
          exitCode: code ?? 1,
          duration: Date.now() - start
        });
      });

      this.process.on('error', () => {
        this.process = undefined;
        resolve({
          success: false,
          output: `Failed to execute: ${command}`,
          exitCode: 1,
          duration: Date.now() - start
        });
      });
    });
  }

  analyzeOutput(output: string): Array<{ pattern: ErrorPattern; match: string; line?: number }> {
    const errors: Array<{ pattern: ErrorPattern; match: string; line?: number }> = [];
    const lines = output.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of this.patterns) {
        if (pattern.pattern.test(line)) {
          errors.push({
            pattern,
            match: line.trim().slice(0, 200),
            line: i + 1
          });
          break; // One pattern per line
        }
      }
    }

    return errors;
  }

  getLastGoodCheckpoint(): string | undefined {
    return this.lastGoodCheckpoint;
  }

  addPattern(pattern: ErrorPattern): void {
    this.patterns.push(pattern);
  }

  getPatterns(): ErrorPattern[] {
    return [...this.patterns];
  }
}
