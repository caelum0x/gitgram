import { TimeMachineEngine } from './engine.js';
import { spawn } from 'child_process';

export interface AutoCheckpointRule {
  name: string;
  command: string;
  successPattern?: RegExp;
  failurePattern?: RegExp;
  exitCodeSuccess?: number[];
  description: string;
  enabled: boolean;
}

export interface WatchResult {
  success: boolean;
  output: string;
  exitCode: number;
  checkpointId?: string;
  duration: number;
}

const DEFAULT_RULES: AutoCheckpointRule[] = [
  {
    name: 'tests-pass',
    command: 'npm test',
    successPattern: /passed|✓|success|\d+ passing/i,
    failurePattern: /failed|✗|error|\d+ failing/i,
    exitCodeSuccess: [0],
    description: 'Tests passed',
    enabled: true
  },
  {
    name: 'build-success',
    command: 'npm run build',
    successPattern: /successfully|compiled|built|done/i,
    failurePattern: /error|failed|exception/i,
    exitCodeSuccess: [0],
    description: 'Build successful',
    enabled: true
  },
  {
    name: 'lint-pass',
    command: 'npm run lint',
    exitCodeSuccess: [0],
    description: 'Lint passed',
    enabled: false
  },
  {
    name: 'typecheck-pass',
    command: 'npx tsc --noEmit',
    exitCodeSuccess: [0],
    description: 'Type check passed',
    enabled: false
  }
];

export class SmartAutoCheckpoint {
  private rules: AutoCheckpointRule[];
  private lastResults = new Map<string, { success: boolean; time: Date }>();

  constructor(
    private engine: TimeMachineEngine,
    customRules?: AutoCheckpointRule[]
  ) {
    this.rules = customRules || [...DEFAULT_RULES];
  }

  async runRule(ruleName: string): Promise<WatchResult> {
    const rule = this.rules.find(r => r.name === ruleName);
    if (!rule) throw new Error(`Rule not found: ${ruleName}`);
    return this.executeRule(rule);
  }

  async runAllEnabled(): Promise<Map<string, WatchResult>> {
    const results = new Map<string, WatchResult>();
    for (const rule of this.rules.filter(r => r.enabled)) {
      results.set(rule.name, await this.executeRule(rule));
    }
    return results;
  }

  private async executeRule(rule: AutoCheckpointRule): Promise<WatchResult> {
    const start = Date.now();
    
    return new Promise((resolve) => {
      const [cmd, ...args] = rule.command.split(' ');
      const proc = spawn(cmd, args, { 
        shell: true, 
        cwd: this.engine.getProjectPath(),
        env: { ...process.env, FORCE_COLOR: '0' }
      });

      let output = '';
      proc.stdout?.on('data', (d) => output += d.toString());
      proc.stderr?.on('data', (d) => output += d.toString());

      proc.on('close', (exitCode) => {
        const duration = Date.now() - start;
        const code = exitCode ?? 1;
        
        // Determine success
        let success = false;
        if (rule.exitCodeSuccess?.includes(code)) {
          success = true;
        }
        if (rule.successPattern?.test(output)) {
          success = true;
        }
        if (rule.failurePattern?.test(output)) {
          success = false;
        }

        // Check if state changed
        const lastResult = this.lastResults.get(rule.name);
        const stateChanged = !lastResult || lastResult.success !== success;
        
        let checkpointId: string | undefined;

        // Create checkpoint on success or state change
        if (success && stateChanged) {
          const tp = this.engine.capture(
            `✅ ${rule.description}`,
            { type: 'auto', action: rule.name }
          );
          checkpointId = tp.id;
        } else if (!success && stateChanged && lastResult?.success) {
          // Went from passing to failing - capture the broken state
          const tp = this.engine.capture(
            `❌ ${rule.description} - FAILED`,
            { type: 'auto', action: `${rule.name}-failed` }
          );
          checkpointId = tp.id;
        }

        this.lastResults.set(rule.name, { success, time: new Date() });

        resolve({ success, output, exitCode: code, checkpointId, duration });
      });

      proc.on('error', () => {
        resolve({ 
          success: false, 
          output: `Failed to execute: ${rule.command}`, 
          exitCode: 1,
          duration: Date.now() - start
        });
      });
    });
  }

  addRule(rule: AutoCheckpointRule): void {
    this.rules.push(rule);
  }

  removeRule(name: string): boolean {
    const idx = this.rules.findIndex(r => r.name === name);
    if (idx >= 0) {
      this.rules.splice(idx, 1);
      return true;
    }
    return false;
  }

  enableRule(name: string, enabled: boolean): boolean {
    const rule = this.rules.find(r => r.name === name);
    if (rule) {
      rule.enabled = enabled;
      return true;
    }
    return false;
  }

  getRules(): AutoCheckpointRule[] {
    return [...this.rules];
  }

  getLastResult(ruleName: string) {
    return this.lastResults.get(ruleName);
  }
}
