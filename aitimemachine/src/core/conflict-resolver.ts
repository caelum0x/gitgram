import { Conflict } from './selective-restore.js';

export type MergeStrategy = 'ours' | 'theirs' | 'manual';

export interface MergeResult {
  path: string;
  strategy: MergeStrategy;
  resolved: boolean;
  content?: string;
}

export class ConflictResolver {
  resolve(conflict: Conflict, strategy: MergeStrategy, currentContent: string, checkpointContent: string): MergeResult {
    switch (strategy) {
      case 'ours':
        return { path: conflict.path, strategy, resolved: true, content: currentContent };
      case 'theirs':
        return { path: conflict.path, strategy, resolved: true, content: checkpointContent };
      case 'manual':
        return {
          path: conflict.path,
          strategy,
          resolved: false,
          content: this.createMergeMarkers(currentContent, checkpointContent)
        };
    }
  }

  private createMergeMarkers(current: string, checkpoint: string): string {
    return `<<<<<<< CURRENT\n${current}\n=======\n${checkpoint}\n>>>>>>> CHECKPOINT`;
  }
}
