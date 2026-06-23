import * as fs from 'fs';
import * as path from 'path';
import { TimeMachineEngine, TimePoint } from '../core/index.js';
import { SessionServer, Session, SessionDiff } from '../server/index.js';
import { PrivacyRedactor } from './privacy-redactor.js';
import { assertConsent } from '../auth/consent-policy.js';
import { beginExportTrace, completeExportTrace, type ExportTrace } from './traceability.js';

export type ChangesExportFormat = 'json' | 'jsonl';

export interface ChangesExportOptions {
  projectPath?: string;
  projectName?: string;
  since?: Date;
  format?: ChangesExportFormat;
  outputPath?: string;
  includeContent?: boolean;
  redact?: boolean;
}

export interface ChangeRecord {
  id: string;
  timestamp: Date;
  description: string;
  source: 'checkpoint' | 'session';
  changes: {
    added: FileChange[];
    modified: FileChange[];
    deleted: FileChange[];
  };
  stats: {
    addedCount: number;
    modifiedCount: number;
    deletedCount: number;
    totalChanges: number;
  };
}

export interface FileChange {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  oldHash?: string;
  newHash?: string;
  content?: string;
  hunks?: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }>;
}

export interface ChangesExportResult {
  success: boolean;
  outputPath: string;
  trace: ExportTrace;
  stats: {
    changeRecords: number;
    totalAdditions: number;
    totalModifications: number;
    totalDeletions: number;
  };
}

/**
 * Changes Exporter - Export file change history
 */
export class ChangesExporter {
  private engine: TimeMachineEngine;
  private server: SessionServer;
  private redactor: PrivacyRedactor;

  constructor(projectPath: string = process.cwd()) {
    this.engine = new TimeMachineEngine(projectPath);
    this.server = new SessionServer();
    this.redactor = new PrivacyRedactor();
  }

  /**
   * Export change history
   */
  async exportChanges(options: ChangesExportOptions = {}): Promise<ChangesExportResult> {
    const format = options.format || 'json';
    const projectPath = options.projectPath || process.cwd();
    assertConsent(projectPath, 'export_operational', {
      source: 'export.changes-exporter.exportChanges',
      resource: projectPath,
    });
    const trace = beginExportTrace({
      projectPath,
      action: 'export_operational',
      source: 'export.changes-exporter.exportChanges',
      resource: options.outputPath,
    });

    try {
      const outputPath = options.outputPath || this.getDefaultOutputPath(projectPath, format);

      const changes = await this.collectChanges(options);

      if (options.redact) {
        this.applyRedaction(changes);
      }

      await this.writeOutput(changes, outputPath, format);

      const stats = changes.records.reduce(
        (acc, r) => ({
          addedCount: acc.addedCount + r.stats.addedCount,
          modifiedCount: acc.modifiedCount + r.stats.modifiedCount,
          deletedCount: acc.deletedCount + r.stats.deletedCount,
        }),
        { addedCount: 0, modifiedCount: 0, deletedCount: 0 }
      );

      const summary = {
        changeRecords: changes.records.length,
        totalAdditions: stats.addedCount,
        totalModifications: stats.modifiedCount,
        totalDeletions: stats.deletedCount,
      };
      const traceResult = completeExportTrace(trace, {
        success: true,
        outputPath,
        stats: summary as unknown as Record<string, unknown>,
      });

      return {
        success: true,
        outputPath,
        trace: traceResult,
        stats: summary,
      };
    } catch (error) {
      completeExportTrace(trace, {
        success: false,
        error,
      });
      throw error;
    }
  }

  /**
   * Collect changes from checkpoints and sessions
   */
  private async collectChanges(options: ChangesExportOptions): Promise<{
    exportedAt: string;
    projectPath: string;
    records: ChangeRecord[];
  }> {
    const projectPath = options.projectPath || process.cwd();
    const records: ChangeRecord[] = [];

    // Collect from TimeMachine checkpoints
    const timepoints = this.engine.listTimePoints();

    for (const tp of timepoints) {
      if (options.since && new Date(tp.timestamp) < options.since) {
        continue;
      }

      const full = this.engine.getTimePoint(tp.id);
      if (!full) continue;

      const record: ChangeRecord = {
        id: tp.id,
        timestamp: new Date(tp.timestamp),
        description: tp.description,
        source: 'checkpoint',
        changes: {
          added: full.changes.added.map(p => ({ path: p, type: 'added' as const })),
          modified: full.changes.modified.map(p => ({ path: p, type: 'modified' as const })),
          deleted: full.changes.deleted.map(p => ({ path: p, type: 'deleted' as const })),
        },
        stats: {
          addedCount: full.changes.added.length,
          modifiedCount: full.changes.modified.length,
          deletedCount: full.changes.deleted.length,
          totalChanges: full.changes.added.length + full.changes.modified.length + full.changes.deleted.length,
        },
      };

      // Include content if requested
      if (options.includeContent && full.files) {
        for (const change of record.changes.modified) {
          const file = full.files.find(f => f.path === change.path);
          if (file) {
            try {
              const content = this.engine.getFileContent(tp.id, change.path);
              if (content) {
                change.content = content;
              }
            } catch {
              // Skip if can't read
            }
          }
        }
      }

      records.push(record);
    }

    // Collect from server sessions
    const sessions = this.server.listSessions(projectPath);

    for (const sessionMeta of sessions) {
      if (options.since && sessionMeta.createdAt < options.since) {
        continue;
      }

      const session = this.server.loadSession(sessionMeta.id);
      if (!session || !session.diffs || session.diffs.length === 0) {
        continue;
      }

      const added = session.diffs.filter(d => d.type === 'added');
      const modified = session.diffs.filter(d => d.type === 'modified');
      const deleted = session.diffs.filter(d => d.type === 'deleted');

      const record: ChangeRecord = {
        id: session.id,
        timestamp: session.createdAt,
        description: session.trigger?.description || 'Session',
        source: 'session',
        changes: {
          added: added.map(d => this.diffToFileChange(d, options.includeContent)),
          modified: modified.map(d => this.diffToFileChange(d, options.includeContent)),
          deleted: deleted.map(d => this.diffToFileChange(d, options.includeContent)),
        },
        stats: {
          addedCount: added.length,
          modifiedCount: modified.length,
          deletedCount: deleted.length,
          totalChanges: session.diffs.length,
        },
      };

      records.push(record);
    }

    // Sort by timestamp (newest first)
    records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return {
      exportedAt: new Date().toISOString(),
      projectPath,
      records,
    };
  }

  /**
   * Convert session diff to file change
   */
  private diffToFileChange(diff: SessionDiff, includeContent?: boolean): FileChange {
    const change: FileChange = {
      path: diff.path,
      type: diff.type,
      oldHash: diff.oldHash,
      newHash: diff.newHash,
    };

    if (includeContent && diff.hunks) {
      change.hunks = diff.hunks;
    }

    return change;
  }

  /**
   * Apply redaction to changes
   */
  private applyRedaction(changes: { records: ChangeRecord[] }): void {
    for (const record of changes.records) {
      record.description = this.redactor.redact(record.description);

      for (const changeList of [record.changes.added, record.changes.modified, record.changes.deleted]) {
        for (const change of changeList) {
          if (change.content) {
            change.content = this.redactor.redact(change.content);
          }
          if (change.hunks) {
            for (const hunk of change.hunks) {
              hunk.lines = hunk.lines.map(line => this.redactor.redact(line));
            }
          }
        }
      }
    }
  }

  /**
   * Write output to file
   */
  private async writeOutput(
    changes: { exportedAt: string; projectPath: string; records: ChangeRecord[] },
    outputPath: string,
    format: ChangesExportFormat
  ): Promise<void> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    switch (format) {
      case 'json':
        fs.writeFileSync(outputPath, JSON.stringify(changes, null, 2));
        break;

      case 'jsonl':
        const lines: string[] = [];
        lines.push(JSON.stringify({
          type: 'metadata',
          exportedAt: changes.exportedAt,
          projectPath: changes.projectPath,
        }));

        for (const record of changes.records) {
          lines.push(JSON.stringify({
            type: 'change_record',
            ...record,
          }));
        }

        fs.writeFileSync(outputPath, lines.join('\n') + '\n');
        break;
    }
  }

  /**
   * Get default output path
   */
  private getDefaultOutputPath(projectPath: string, format: ChangesExportFormat): string {
    const projectName = path.basename(projectPath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(process.cwd(), `${projectName}-changes-${timestamp}.${format}`);
  }
}
