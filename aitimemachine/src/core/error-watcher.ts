import { TimeMachineEngine } from '../core/index.js';
import { execSync } from 'child_process';

export interface WatchOptions {
  testCommand?: string;
  buildCommand?: string;
  onError?: 'checkpoint' | 'notify' | 'ignore';
}

export class ErrorWatcher {
  private engine: TimeMachineEngine;
  private lastTestPass: boolean = true;
  private lastBuildPass: boolean = true;

  constructor(projectPath: string) {
    this.engine = new TimeMachineEngine(projectPath);
  }

  async watchTests(command: string): Promise<void> {
    try {
      execSync(command, { stdio: 'pipe' });
      
      if (!this.lastTestPass) {
        // Tests fixed - create checkpoint
        this.engine.capture('✅ Tests fixed', {
          type: 'auto',
          action: 'tests_fixed',
        });
      }
      
      this.lastTestPass = true;
    } catch (e) {
      if (this.lastTestPass) {
        // Tests broke - create checkpoint
        this.engine.capture('❌ Tests broke', {
          type: 'auto',
          action: 'tests_failed',
        });
      }
      
      this.lastTestPass = false;
    }
  }

  async watchBuild(command: string): Promise<void> {
    try {
      execSync(command, { stdio: 'pipe' });
      
      if (!this.lastBuildPass) {
        this.engine.capture('✅ Build fixed', {
          type: 'auto',
          action: 'build_fixed',
        });
      }
      
      this.lastBuildPass = true;
    } catch (e) {
      if (this.lastBuildPass) {
        this.engine.capture('❌ Build broke', {
          type: 'auto',
          action: 'build_failed',
        });
      }
      
      this.lastBuildPass = false;
    }
  }
}
