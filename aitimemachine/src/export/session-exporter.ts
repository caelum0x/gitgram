import * as fs from 'fs';
import * as path from 'path';
import { SessionServer, Session } from '../server/index.js';
import { ClaudeCodeReader, ClaudeSession } from '../integrations/index.js';
import { PrivacyRedactor } from './privacy-redactor.js';
import { assertConsent } from '../auth/consent-policy.js';
import { beginExportTrace, completeExportTrace, type ExportTrace } from './traceability.js';

export type SessionExportFormat = 'json' | 'jsonl';

export interface SessionExportOptions {
  projectPath?: string;
  projectName?: string;
  since?: Date;
  format?: SessionExportFormat;
  outputPath?: string;
  redact?: boolean;
  includeClaudeSessions?: boolean;
  includeServerSessions?: boolean;
}

export interface SessionExportResult {
  success: boolean;
  outputPath: string;
  trace: ExportTrace;
  stats: {
    claudeSessions: number;
    serverSessions: number;
    totalMessages: number;
  };
}

/**
 * Session Exporter - Export chat sessions from Claude Code and server
 */
export class SessionExporter {
  private server: SessionServer;
  private claude: ClaudeCodeReader;
  private redactor: PrivacyRedactor;

  constructor() {
    this.server = new SessionServer();
    this.claude = new ClaudeCodeReader();
    this.redactor = new PrivacyRedactor();
  }

  /**
   * Export sessions
   */
  async exportSessions(options: SessionExportOptions = {}): Promise<SessionExportResult> {
    const format = options.format || 'json';
    const projectPath = options.projectPath || process.cwd();
    assertConsent(projectPath, 'export_operational', {
      source: 'export.session-exporter.exportSessions',
      resource: projectPath,
    });
    const trace = beginExportTrace({
      projectPath,
      action: 'export_operational',
      source: 'export.session-exporter.exportSessions',
      resource: options.outputPath,
    });

    try {
      const outputPath = options.outputPath || this.getDefaultOutputPath(projectPath, format);

      const sessions = await this.collectSessions(options);

      if (options.redact) {
        this.applyRedaction(sessions);
      }

      await this.writeOutput(sessions, outputPath, format);

      const claudeCount = sessions.claudeSessions?.length || 0;
      const serverCount = sessions.serverSessions?.length || 0;
      const claudeMessages = sessions.claudeSessions?.reduce((sum, s) => sum + s.messages.length, 0) || 0;
      const serverMessages = sessions.serverSessions?.reduce((sum, s) => sum + (s.conversation?.length || 0), 0) || 0;
      const stats = {
        claudeSessions: claudeCount,
        serverSessions: serverCount,
        totalMessages: claudeMessages + serverMessages,
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
   * Collect sessions from various sources
   */
  private async collectSessions(options: SessionExportOptions): Promise<{
    exportedAt: string;
    projectPath: string;
    claudeSessions?: ClaudeSession[];
    serverSessions?: Session[];
  }> {
    const projectPath = options.projectPath || process.cwd();
    const result: {
      exportedAt: string;
      projectPath: string;
      claudeSessions?: ClaudeSession[];
      serverSessions?: Session[];
    } = {
      exportedAt: new Date().toISOString(),
      projectPath,
    };

    // Collect Claude Code sessions
    if (options.includeClaudeSessions !== false) {
      try {
        let claudeSessions = await this.claude.getSessions(projectPath);

        // Filter by project name if specified
        if (options.projectName) {
          const projectNameLower = options.projectName.toLowerCase();
          claudeSessions = claudeSessions.filter(s =>
            s.projectPath.toLowerCase().includes(projectNameLower)
          );
        }

        // Filter by date
        if (options.since) {
          claudeSessions = claudeSessions.filter(s => {
            const firstMsg = s.messages[0];
            if (!firstMsg) return true;
            return firstMsg.timestamp >= options.since!;
          });
        }

        result.claudeSessions = claudeSessions;
      } catch {
        result.claudeSessions = [];
      }
    }

    // Collect server sessions
    if (options.includeServerSessions !== false) {
      let serverSessions = this.server.listSessions(projectPath);

      // Filter by date
      if (options.since) {
        serverSessions = serverSessions.filter(s => s.createdAt >= options.since!);
      }

      // Load full session data
      result.serverSessions = serverSessions
        .map(s => this.server.loadSession(s.id))
        .filter((s): s is Session => s !== null);
    }

    return result;
  }

  /**
   * Apply redaction to sessions
   */
  private applyRedaction(sessions: {
    claudeSessions?: ClaudeSession[];
    serverSessions?: Session[];
  }): void {
    if (sessions.claudeSessions) {
      for (const session of sessions.claudeSessions) {
        for (const msg of session.messages) {
          msg.content = this.redactor.redact(String(msg.content || ''));
        }
        session.summaries = session.summaries.map(s => this.redactor.redact(s));
      }
    }

    if (sessions.serverSessions) {
      for (const session of sessions.serverSessions) {
        if (session.conversation) {
          for (const msg of session.conversation) {
            msg.content = this.redactor.redact(msg.content);
          }
        }
        if (session.trigger) {
          session.trigger.description = this.redactor.redact(session.trigger.description);
          if (session.trigger.action) {
            session.trigger.action = this.redactor.redact(session.trigger.action);
          }
        }
      }
    }
  }

  /**
   * Write output to file
   */
  private async writeOutput(
    sessions: { exportedAt: string; projectPath: string; claudeSessions?: ClaudeSession[]; serverSessions?: Session[] },
    outputPath: string,
    format: SessionExportFormat
  ): Promise<void> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    switch (format) {
      case 'json':
        fs.writeFileSync(outputPath, JSON.stringify(sessions, null, 2));
        break;

      case 'jsonl':
        const lines: string[] = [];
        lines.push(JSON.stringify({
          type: 'metadata',
          exportedAt: sessions.exportedAt,
          projectPath: sessions.projectPath,
        }));

        if (sessions.claudeSessions) {
          for (const session of sessions.claudeSessions) {
            lines.push(JSON.stringify({
              type: 'claude_session',
              sessionId: session.sessionId,
              projectPath: session.projectPath,
              messageCount: session.messages.length,
              messages: session.messages,
              summaries: session.summaries,
            }));
          }
        }

        if (sessions.serverSessions) {
          for (const session of sessions.serverSessions) {
            lines.push(JSON.stringify({
              type: 'server_session',
              id: session.id,
              projectPath: session.projectPath,
              createdAt: session.createdAt,
              trigger: session.trigger,
              conversation: session.conversation,
              stats: session.stats,
            }));
          }
        }

        fs.writeFileSync(outputPath, lines.join('\n') + '\n');
        break;
    }
  }

  /**
   * Get default output path
   */
  private getDefaultOutputPath(projectPath: string, format: SessionExportFormat): string {
    const projectName = path.basename(projectPath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(process.cwd(), `${projectName}-sessions-${timestamp}.${format}`);
  }
}
