import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface EnvironmentState {
  runtimes: {
    node?: string;
    python?: string;
    rust?: string;
    go?: string;
    ruby?: string;
    java?: string;
  };
  packageManager?: {
    name: string;
    version: string;
    lockFile?: string;
  };
  dependencies?: {
    count: number;
    file: string;
  };
}

/**
 * Captures development environment state
 */
export class EnvironmentCollector {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = path.resolve(projectPath);
  }

  /**
   * Capture environment state
   */
  capture(): EnvironmentState {
    return {
      runtimes: this.captureRuntimes(),
      packageManager: this.detectPackageManager(),
      dependencies: this.countDependencies(),
    };
  }

  private captureRuntimes(): EnvironmentState['runtimes'] {
    const runtimes: EnvironmentState['runtimes'] = {};

    const tryCmd = (cmd: string): string | undefined => {
      try {
        return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      } catch {
        return undefined;
      }
    };

    // Node.js
    const nodeV = tryCmd('node --version');
    if (nodeV) runtimes.node = nodeV;

    // Python
    const pythonV = tryCmd('python3 --version') || tryCmd('python --version');
    if (pythonV) runtimes.python = pythonV.replace('Python ', '');

    // Rust
    const rustV = tryCmd('rustc --version');
    if (rustV) runtimes.rust = rustV.split(' ')[1];

    // Go
    const goV = tryCmd('go version');
    if (goV) {
      const match = goV.match(/go(\d+\.\d+(\.\d+)?)/);
      if (match) runtimes.go = match[1];
    }

    // Ruby
    const rubyV = tryCmd('ruby --version');
    if (rubyV) {
      const match = rubyV.match(/ruby (\d+\.\d+\.\d+)/);
      if (match) runtimes.ruby = match[1];
    }

    // Java
    const javaV = tryCmd('java --version');
    if (javaV) {
      const match = javaV.match(/(\d+\.\d+\.\d+)/);
      if (match) runtimes.java = match[1];
    }

    return runtimes;
  }

  private detectPackageManager(): EnvironmentState['packageManager'] {
    const tryCmd = (cmd: string): string | undefined => {
      try {
        return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      } catch {
        return undefined;
      }
    };

    // Check for lock files to determine package manager
    if (fs.existsSync(path.join(this.projectPath, 'pnpm-lock.yaml'))) {
      return { name: 'pnpm', version: tryCmd('pnpm --version') || 'unknown', lockFile: 'pnpm-lock.yaml' };
    }
    if (fs.existsSync(path.join(this.projectPath, 'yarn.lock'))) {
      return { name: 'yarn', version: tryCmd('yarn --version') || 'unknown', lockFile: 'yarn.lock' };
    }
    if (fs.existsSync(path.join(this.projectPath, 'package-lock.json'))) {
      return { name: 'npm', version: tryCmd('npm --version') || 'unknown', lockFile: 'package-lock.json' };
    }
    if (fs.existsSync(path.join(this.projectPath, 'Cargo.lock'))) {
      return { name: 'cargo', version: tryCmd('cargo --version')?.split(' ')[1] || 'unknown', lockFile: 'Cargo.lock' };
    }
    if (fs.existsSync(path.join(this.projectPath, 'Pipfile.lock'))) {
      return { name: 'pipenv', version: tryCmd('pipenv --version')?.split(' ')[2] || 'unknown', lockFile: 'Pipfile.lock' };
    }
    if (fs.existsSync(path.join(this.projectPath, 'poetry.lock'))) {
      return { name: 'poetry', version: tryCmd('poetry --version')?.split(' ')[2] || 'unknown', lockFile: 'poetry.lock' };
    }
    if (fs.existsSync(path.join(this.projectPath, 'go.sum'))) {
      return { name: 'go', version: tryCmd('go version')?.match(/go(\d+\.\d+)/)?.[1] || 'unknown', lockFile: 'go.sum' };
    }

    return undefined;
  }

  private countDependencies(): EnvironmentState['dependencies'] {
    // package.json
    const pkgPath = path.join(this.projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const deps = Object.keys(pkg.dependencies || {}).length;
        const devDeps = Object.keys(pkg.devDependencies || {}).length;
        return { count: deps + devDeps, file: 'package.json' };
      } catch {}
    }

    // Cargo.toml
    const cargoPath = path.join(this.projectPath, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      try {
        const content = fs.readFileSync(cargoPath, 'utf-8');
        const deps = (content.match(/^\[.*dependencies.*\]/gm) || []).length;
        return { count: deps, file: 'Cargo.toml' };
      } catch {}
    }

    // requirements.txt
    const reqPath = path.join(this.projectPath, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
      try {
        const lines = fs.readFileSync(reqPath, 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
        return { count: lines.length, file: 'requirements.txt' };
      } catch {}
    }

    return undefined;
  }
}
