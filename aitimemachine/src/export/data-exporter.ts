import * as fs from 'fs';
import * as path from 'path';
import { TimeMachineEngine } from '../core/index.js';
import { SessionServer } from '../server/index.js';
import { ClaudeCodeReader } from '../integrations/index.js';
import { PrivacyRedactor } from './privacy-redactor.js';
import { assertConsent } from '../auth/consent-policy.js';
import { beginExportTrace, completeExportTrace, type ExportTrace } from './traceability.js';

export type ExportFormat = 'json' | 'jsonl' | 'csv';

export interface ExportOptions {
  format: ExportFormat;
  outputPath?: string;
  redact?: boolean;
  projectPath?: string;
  since?: Date;
  includeFiles?: boolean;
}

export interface ExportResult {
  success: boolean;
  outputPath: string;
  trace: ExportTrace;
  stats: {
    checkpoints: number;
    sessions: number;
    messages: number;
    files: number;
  };
}

interface CollectedData {
  exportedAt: string;
  projectPath: string;
  projectName: string;
  checkpoints: Array<{
    id: string;
    timestamp: string | Date;
    description: string;
    trigger?: unknown;
    stats?: unknown;
    changes?: unknown;
    files?: Array<{ path: string }>;
    conversationPreview?: unknown;
  }>;
  sessions: Array<{
    id?: string;
    createdAt: Date | string;
    conversation?: Array<{ content: string }>;
    trigger?: { description: string; action?: string };
  }>;
  conversations: Array<{
    sessionId: string;
    messageCount: number;
    messages: Array<{
      uuid: string;
      timestamp: Date;
      role: string;
      content: string;
    }>;
    summaries: string[];
  }>;
  projectMetadata?: unknown;
}

/**
 * Data Exporter - Export all project data (checkpoints, conversations, files)
 */
export class DataExporter {
  private engine: TimeMachineEngine;
  private server: SessionServer;
  private claude: ClaudeCodeReader;
  private redactor: PrivacyRedactor;

  constructor(projectPath: string = process.cwd()) {
    this.engine = new TimeMachineEngine(projectPath);
    this.server = new SessionServer();
    this.claude = new ClaudeCodeReader();
    this.redactor = new PrivacyRedactor();
  }

  /**
   * Export all data
   */
  async exportAll(options: ExportOptions): Promise<ExportResult> {
    const projectPath = options.projectPath || process.cwd();
    assertConsent(projectPath, 'export_operational', {
      source: 'export.data-exporter.exportAll',
      resource: projectPath,
    });
    const trace = beginExportTrace({
      projectPath,
      action: 'export_operational',
      source: 'export.data-exporter.exportAll',
      resource: options.outputPath,
    });

    try {
      const format = options.format || 'json';
      const outputPath = options.outputPath || this.getDefaultOutputPath(projectPath, format);

      const data = await this.collectData(projectPath, options);

      if (options.redact) {
        this.applyRedaction(data);
      }

      await this.writeOutput(data, outputPath, format);

      const stats = {
        checkpoints: data.checkpoints.length,
        sessions: data.sessions.length,
        messages: data.conversations.reduce((sum: number, c) => sum + c.messages.length, 0),
        files: data.checkpoints.reduce((sum: number, cp) => sum + (cp.files?.length || 0), 0),
      };

      const traceResult = completeExportTrace(trace, {
        success: true,
        outputPath,
        stats: stats as unknown as Record<string, unknown>,
      });

      return {
        success: true,
        outputPath,
        trace: traceResult,
        stats,
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
   * Collect all data from various sources
   */
  private async collectData(projectPath: string, options: ExportOptions): Promise<CollectedData> {
    const data: CollectedData = {
      exportedAt: new Date().toISOString(),
      projectPath,
      projectName: path.basename(projectPath),
      checkpoints: [],
      sessions: [],
      conversations: [],
    };

    // Collect checkpoints from TimeMachine engine
    const checkpoints = this.engine.listTimePoints();
    data.checkpoints = checkpoints.map(tp => {
      const full = this.engine.getTimePoint(tp.id);

      const checkpoint: CollectedData['checkpoints'][0] = {
        id: tp.id,
        timestamp: tp.timestamp,
        description: tp.description,
      };

      if (full) {
        checkpoint.trigger = full.trigger;
        checkpoint.stats = full.stats;
        checkpoint.changes = full.changes;

        if (options.includeFiles !== false && full.files) {
          checkpoint.files = full.files.map(f => ({ path: f.path }));
        }

        if (full.conversation) {
          checkpoint.conversationPreview = {
            messageCount: full.conversation.messageCount,
            lastMessage: full.conversation.lastMessagePreview,
          };
        }
      }

      return checkpoint;
    });

    // Collect sessions from server
    const sessionsList = this.server.listSessions(projectPath);
    data.sessions = sessionsList.map(s => {
      const full = this.server.loadSession(s.id);
      if (full) {
        return {
          id: full.id,
          createdAt: full.createdAt,
          conversation: full.conversation?.map(m => ({ content: m.content })),
          trigger: full.trigger ? {
            description: full.trigger.description,
            action: full.trigger.action,
          } : undefined,
        };
      }
      return {
        id: s.id,
        createdAt: s.createdAt,
      };
    }).filter(s => {
      if (!options.since) return true;
      const createdAt = s.createdAt instanceof Date ? s.createdAt : new Date(s.createdAt);
      return createdAt >= options.since;
    });

    // Collect conversations from Claude Code
    try {
      const claudeSessions = await this.claude.getSessions(projectPath);
      data.conversations = claudeSessions.filter(s => {
        if (!options.since) return true;
        const firstMsg = s.messages[0];
        if (!firstMsg) return true;
        return firstMsg.timestamp >= options.since;
      }).map(s => ({
        sessionId: s.sessionId,
        messageCount: s.messages.length,
        messages: s.messages.map(m => ({
          uuid: m.uuid,
          timestamp: m.timestamp,
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })),
        summaries: s.summaries,
      }));
    } catch {
      data.conversations = [];
    }

    // Collect project metadata
    const project = this.server.getProject(projectPath);
    if (project) {
      data.projectMetadata = {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        lastSessionAt: project.lastSessionAt,
        sessionCount: project.sessionCount,
        totalSize: project.totalSize,
      };
    }

    return data;
  }

  /**
   * Apply redaction to collected data
   */
  private applyRedaction(data: CollectedData): void {
    // Redact conversations
    data.conversations = data.conversations.map(conv => ({
      ...conv,
      messages: conv.messages.map(m => ({
        ...m,
        content: this.redactor.redact(m.content),
      })),
      summaries: conv.summaries.map(s => this.redactor.redact(s)),
    }));

    // Redact checkpoint descriptions
    data.checkpoints = data.checkpoints.map(cp => ({
      ...cp,
      description: this.redactor.redact(cp.description),
    }));

    // Redact session descriptions
    data.sessions = data.sessions.map(s => {
      const result = { ...s };
      if (s.trigger) {
        result.trigger = {
          description: this.redactor.redact(s.trigger.description),
          action: s.trigger.action ? this.redactor.redact(s.trigger.action) : undefined,
        };
      }
      if (s.conversation) {
        result.conversation = s.conversation.map(m => ({
          ...m,
          content: this.redactor.redact(m.content),
        }));
      }
      return result;
    });
  }

  /**
   * Write output to file in specified format
   */
  private async writeOutput(data: CollectedData, outputPath: string, format: ExportFormat): Promise<void> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    switch (format) {
      case 'json':
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
        break;

      case 'jsonl':
        const lines: string[] = [];
        lines.push(JSON.stringify({ type: 'metadata', data: { exportedAt: data.exportedAt, projectPath: data.projectPath, projectName: data.projectName } }));

        for (const cp of data.checkpoints) {
          lines.push(JSON.stringify({ type: 'checkpoint', data: cp }));
        }

        for (const s of data.sessions) {
          lines.push(JSON.stringify({ type: 'session', data: s }));
        }

        for (const c of data.conversations) {
          lines.push(JSON.stringify({ type: 'conversation', data: c }));
        }

        fs.writeFileSync(outputPath, lines.join('\n') + '\n');
        break;

      case 'csv':
        // For CSV, we flatten conversations to rows
        const csvLines: string[] = [];
        csvLines.push('type,id,timestamp,role,content');

        for (const conv of data.conversations) {
          for (const msg of conv.messages) {
            const content = String(msg.content || '').replace(/"/g, '""').replace(/\n/g, '\\n');
            csvLines.push(`conversation,${conv.sessionId},${msg.timestamp},"${msg.role}","${content}"`);
          }
        }

        for (const cp of data.checkpoints) {
          const desc = String(cp.description || '').replace(/"/g, '""').replace(/\n/g, '\\n');
          csvLines.push(`checkpoint,${cp.id},${cp.timestamp},,"${desc}"`);
        }

        fs.writeFileSync(outputPath, csvLines.join('\n') + '\n');
        break;
    }
  }

  /**
   * Get default output path
   */
  private getDefaultOutputPath(projectPath: string, format: ExportFormat): string {
    const projectName = path.basename(projectPath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(process.cwd(), `${projectName}-export-${timestamp}.${format}`);
  }
}
