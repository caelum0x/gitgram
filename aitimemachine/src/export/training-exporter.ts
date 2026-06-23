import * as fs from 'fs';
import * as path from 'path';
import { SessionServer, Session } from '../server/index.js';
import { ClaudeCodeReader, ClaudeSession } from '../integrations/index.js';
import { PrivacyRedactor } from './privacy-redactor.js';
import { assertConsent } from '../auth/consent-policy.js';
import { beginExportTrace, completeExportTrace, type ExportTrace } from './traceability.js';
import { runRedactionBenchmark } from './redaction-benchmark.js';
import { assertLicenseCompliance } from '../compliance/license-policy.js';

export interface TrainingExportOptions {
  projectPath?: string;
  format?: 'jsonl';
  outputPath?: string;
  includeTools?: boolean;
  includeErrors?: boolean;
  redact?: boolean;
  evaluateRedaction?: boolean;
  minTurnLength?: number;
  maxTurnLength?: number;
}

export interface TrainingExample {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  metadata?: {
    sessionId?: string;
    projectPath?: string;
    timestamp?: string;
    hasTools?: boolean;
    hasErrors?: boolean;
  };
}

export interface TrainingExportResult {
  success: boolean;
  outputPath: string;
  trace: ExportTrace;
  stats: {
    totalExamples: number;
    withTools: number;
    withErrors: number;
    avgTurnLength: number;
    redactionQuality?: {
      precision: number;
      recall: number;
      f1: number;
      truePositives: number;
      falsePositives: number;
      falseNegatives: number;
      sampleCount: number;
      reportPath?: string;
    };
  };
}

/**
 * Training Exporter - Export conversations in training data format
 */
export class TrainingExporter {
  private server: SessionServer;
  private claude: ClaudeCodeReader;
  private redactor: PrivacyRedactor;

  constructor() {
    this.server = new SessionServer();
    this.claude = new ClaudeCodeReader();
    this.redactor = new PrivacyRedactor();
  }

  /**
   * Export training data
   */
  async exportTrainingData(options: TrainingExportOptions = {}): Promise<TrainingExportResult> {
    const projectPath = options.projectPath || process.cwd();
    assertLicenseCompliance(projectPath, 'dataset_export');
    assertConsent(projectPath, 'export_training', {
      source: 'export.training-exporter.exportTrainingData',
      resource: projectPath,
    });
    const trace = beginExportTrace({
      projectPath,
      action: 'export_training',
      source: 'export.training-exporter.exportTrainingData',
      resource: options.outputPath,
    });

    try {
      const outputPath = options.outputPath || this.getDefaultOutputPath(projectPath);

      const examples = await this.collectTrainingExamples(options);

      if (options.redact) {
        this.applyRedaction(examples);
      }

      await this.writeOutput(examples, outputPath);

      const withTools = examples.filter(e => e.metadata?.hasTools).length;
      const withErrors = examples.filter(e => e.metadata?.hasErrors).length;
      const totalTurns = examples.reduce((sum, e) => sum + e.messages.length, 0);
      const stats = {
        totalExamples: examples.length,
        withTools,
        withErrors,
        avgTurnLength: examples.length > 0 ? Math.round(totalTurns / examples.length) : 0,
      } as TrainingExportResult['stats'];
      const shouldEvaluateRedaction = options.evaluateRedaction ?? !!options.redact;
      if (shouldEvaluateRedaction) {
        const report = runRedactionBenchmark(this.redactor);
        const reportPath = this.getRedactionReportPath(outputPath);
        fs.writeFileSync(reportPath, JSON.stringify({
          generatedAt: new Date().toISOString(),
          projectPath,
          outputPath,
          report,
        }, null, 2), 'utf-8');
        stats.redactionQuality = {
          precision: report.metrics.precision,
          recall: report.metrics.recall,
          f1: report.metrics.f1,
          truePositives: report.metrics.truePositives,
          falsePositives: report.metrics.falsePositives,
          falseNegatives: report.metrics.falseNegatives,
          sampleCount: report.sampleCount,
          reportPath,
        };
      }
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
   * Collect and format training examples
   */
  private async collectTrainingExamples(options: TrainingExportOptions): Promise<TrainingExample[]> {
    const projectPath = options.projectPath || process.cwd();
    const examples: TrainingExample[] = [];
    const minTurnLength = options.minTurnLength || 2;
    const maxTurnLength = options.maxTurnLength || 100;

    // Collect from Claude Code sessions
    try {
      const claudeSessions = await this.claude.getSessions(projectPath);

      for (const session of claudeSessions) {
        const sessionExamples = this.processClaudeSession(session, options);
        examples.push(...sessionExamples);
      }
    } catch {
      // Continue without Claude sessions
    }

    // Collect from server sessions
    const serverSessions = this.server.listSessions(projectPath);

    for (const sessionMeta of serverSessions) {
      const session = this.server.loadSession(sessionMeta.id);
      if (!session?.conversation) continue;

      const sessionExamples = this.processServerSession(session, options);
      examples.push(...sessionExamples);
    }

    // Filter by turn length
    return examples.filter(e =>
      e.messages.length >= minTurnLength && e.messages.length <= maxTurnLength
    );
  }

  /**
   * Process Claude Code session into training examples
   */
  private processClaudeSession(session: ClaudeSession, options: TrainingExportOptions): TrainingExample[] {
    const examples: TrainingExample[] = [];
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let hasTools = false;
    let hasErrors = false;

    for (const msg of session.messages) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

      // Check for tool use
      if (content.includes('tool_use') || content.includes('function') || content.includes('```bash')) {
        hasTools = true;
      }

      // Check for errors
      if (content.toLowerCase().includes('error') || content.includes('failed') || content.includes('exception')) {
        hasErrors = true;
      }

      // Skip tool calls if not including them
      if (!options.includeTools && this.isToolCall(content)) {
        continue;
      }

      // Skip error messages if not including them
      if (!options.includeErrors && this.isErrorMessage(content)) {
        continue;
      }

      messages.push({
        role: msg.role,
        content: this.cleanContent(content),
      });
    }

    if (messages.length >= 2) {
      // Create a single example from the conversation
      examples.push({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI coding assistant.',
          },
          ...messages,
        ],
        metadata: {
          sessionId: session.sessionId,
          projectPath: session.projectPath,
          timestamp: session.messages[0]?.timestamp.toISOString(),
          hasTools,
          hasErrors,
        },
      });

      // Also create multi-turn examples by sliding window
      const windowSize = 6; // 3 turns each way
      for (let i = 0; i < messages.length - 1; i += 2) {
        const windowMessages = messages.slice(i, i + windowSize);
        if (windowMessages.length >= 2) {
          examples.push({
            messages: [
              { role: 'system', content: 'You are a helpful AI coding assistant.' },
              ...windowMessages,
            ],
            metadata: {
              sessionId: session.sessionId,
              projectPath: session.projectPath,
              hasTools,
              hasErrors,
            },
          });
        }
      }
    }

    return examples;
  }

  /**
   * Process server session into training examples
   */
  private processServerSession(session: Session, options: TrainingExportOptions): TrainingExample[] {
    if (!session.conversation || session.conversation.length < 2) {
      return [];
    }

    const examples: TrainingExample[] = [];
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    let hasTools = false;
    let hasErrors = false;

    for (const msg of session.conversation) {
      if (msg.role === 'system') continue;

      // Check for tool use
      if (msg.tool || msg.content.includes('tool_use')) {
        hasTools = true;
      }

      // Check for errors
      if (msg.content.toLowerCase().includes('error') || msg.content.includes('failed')) {
        hasErrors = true;
      }

      // Skip tool calls if not including them
      if (!options.includeTools && msg.tool) {
        continue;
      }

      // Skip error messages if not including them
      if (!options.includeErrors && this.isErrorMessage(msg.content)) {
        continue;
      }

      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: this.cleanContent(msg.content),
      });
    }

    if (messages.length >= 2) {
      examples.push({
        messages: [
          { role: 'system', content: 'You are a helpful AI coding assistant.' },
          ...messages,
        ],
        metadata: {
          sessionId: session.id,
          projectPath: session.projectPath,
          timestamp: session.createdAt.toISOString(),
          hasTools,
          hasErrors,
        },
      });
    }

    return examples;
  }

  /**
   * Check if content is a tool call
   */
  private isToolCall(content: string): boolean {
    return (
      content.includes('"type": "tool_use"') ||
      content.includes('"type":"tool_use"') ||
      content.startsWith('{"name":') ||
      /^```(bash|shell|sh)\n/.test(content)
    );
  }

  /**
   * Check if content is an error message
   */
  private isErrorMessage(content: string): boolean {
    const errorPatterns = [
      /\b(error|Error|ERROR)\b/,
      /\b(failed|Failed|FAILED)\b/,
      /\b(exception|Exception|EXCEPTION)\b/,
      /traceback/i,
      /stack trace/i,
    ];
    return errorPatterns.some(p => p.test(content));
  }

  /**
   * Clean content for training
   */
  private cleanContent(content: string): string {
    // Remove excessive whitespace
    let cleaned = content.replace(/\n{3,}/g, '\n\n');

    // Truncate very long content
    const maxLength = 8000;
    if (cleaned.length > maxLength) {
      cleaned = cleaned.slice(0, maxLength) + '...[truncated]';
    }

    return cleaned.trim();
  }

  /**
   * Apply redaction to training examples
   */
  private applyRedaction(examples: TrainingExample[]): void {
    for (const example of examples) {
      for (const msg of example.messages) {
        msg.content = this.redactor.redact(msg.content);
      }
    }
  }

  /**
   * Write output to JSONL file
   */
  private async writeOutput(examples: TrainingExample[], outputPath: string): Promise<void> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const lines = examples.map(e => JSON.stringify(e));
    fs.writeFileSync(outputPath, lines.join('\n') + '\n');
  }

  /**
   * Get default output path
   */
  private getDefaultOutputPath(projectPath: string): string {
    const projectName = path.basename(projectPath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(process.cwd(), `${projectName}-training-${timestamp}.jsonl`);
  }

  private getRedactionReportPath(outputPath: string): string {
    const ext = path.extname(outputPath);
    const base = ext ? outputPath.slice(0, -ext.length) : outputPath;
    return `${base}.redaction-benchmark.json`;
  }
}
