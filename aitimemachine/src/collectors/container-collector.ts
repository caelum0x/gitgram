import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface ContainerState {
  hasDocker: boolean;
  containers: Array<{ id: string; name: string; image: string; status: string }>;
  images: Array<{ id: string; repository: string; tag: string }>;
  compose?: { services: string[]; file: string };
}

/**
 * Captures Docker/container state for a project
 */
export class ContainerCollector {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = path.resolve(projectPath);
  }

  private run(cmd: string): string {
    try {
      return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch {
      return '';
    }
  }

  hasDocker(): boolean {
    return this.run('docker --version').includes('Docker');
  }

  capture(): ContainerState {
    if (!this.hasDocker()) {
      return { hasDocker: false, containers: [], images: [] };
    }

    const state: ContainerState = { hasDocker: true, containers: [], images: [] };

    // Running containers
    const ps = this.run('docker ps --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}"');
    if (ps) {
      state.containers = ps.split('\n').filter(Boolean).map(line => {
        const [id, name, image, status] = line.split('|');
        return { id, name, image, status };
      });
    }

    // Local images
    const images = this.run('docker images --format "{{.ID}}|{{.Repository}}|{{.Tag}}"');
    if (images) {
      state.images = images.split('\n').filter(Boolean).slice(0, 20).map(line => {
        const [id, repository, tag] = line.split('|');
        return { id, repository, tag };
      });
    }

    // Docker Compose
    const composeFiles = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
    for (const file of composeFiles) {
      const fullPath = path.join(this.projectPath, file);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const services = content.match(/^\s{2}(\w+):/gm)?.map(s => s.trim().replace(':', '')) || [];
        state.compose = { services, file };
        break;
      }
    }

    return state;
  }

  /**
   * Save current container state (for restore)
   */
  snapshot(): { containers: string[]; volumes: string[] } {
    const containers = this.run('docker ps -q').split('\n').filter(Boolean);
    const volumes = this.run('docker volume ls -q').split('\n').filter(Boolean);
    return { containers, volumes };
  }
}
