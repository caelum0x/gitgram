import { TimeMachineEngine } from './engine.js';
import { TimelineIndex } from './timeline-index.js';

export interface FileHistory {
  path: string;
  versions: FileVersion[];
}

export interface FileVersion {
  checkpointId: string;
  timestamp: Date;
  hash: string;
  size: number;
}

export class FileHistoryTracker {
  constructor(
    private engine: TimeMachineEngine,
    private timeline: TimelineIndex
  ) {}

  getFileHistory(filePath: string): FileHistory {
    const checkpoints = this.timeline.getCheckpointsByFile(filePath);
    const versions: FileVersion[] = [];

    for (const cp of checkpoints) {
      const fullCp = this.engine.getTimePoint(cp.id);
      if (!fullCp) continue;

      const file = fullCp.files.find((f: any) => f.path === filePath);
      if (file) {
        versions.push({
          checkpointId: cp.id,
          timestamp: cp.timestamp,
          hash: file.hash,
          size: file.size
        });
      }
    }

    return { path: filePath, versions };
  }

  getFileAtCheckpoint(filePath: string, checkpointId: string): string | null {
    return this.engine.getFileContent(checkpointId, filePath);
  }

  listFilesAtCheckpoint(checkpointId: string): string[] {
    const cp = this.engine.getTimePoint(checkpointId);
    if (!cp) return [];
    return cp.files.map((f: any) => f.path);
  }
}
