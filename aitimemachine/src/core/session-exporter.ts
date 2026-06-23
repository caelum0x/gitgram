import { ConversationLogger } from './conversation-logger.js';
import { TimeMachineEngine } from './engine.js';
import * as fs from 'fs';
import * as path from 'path';
import { assertConsent } from '../auth/consent-policy.js';
import { beginExportTrace, completeExportTrace } from '../export/traceability.js';

/**
 * Export complete session data for analysis/sharing
 */
export class SessionExporter {
  constructor(
    private logger: ConversationLogger,
    private engine: TimeMachineEngine
  ) {}

  /**
   * Export session to JSON
   */
  exportToJSON(sessionId: string): any {
    assertConsent(this.engine.getProjectPath(), 'export_operational', {
      source: 'core.session-exporter.exportToJSON',
      resource: sessionId,
    });
    const trace = beginExportTrace({
      projectPath: this.engine.getProjectPath(),
      action: 'export_operational',
      source: 'core.session-exporter.exportToJSON',
      resource: sessionId,
    });

    try {
      const events = this.logger.getAllEvents().filter(e => e.sessionId === sessionId);
      const payload = {
        sessionId,
        startTime: events[0]?.timestamp,
        endTime: events[events.length - 1]?.timestamp,
        eventCount: events.length,
        events: events.map(e => ({
          id: e.id,
          timestamp: e.timestamp,
          type: e.type,
          data: e.data,
          // Include full content if available
          fullContent: this.logger.getFullContent(e),
          diff: this.logger.getDiff(e)
        })),
        summary: this.generateSummary(events)
      };
      const traceResult = completeExportTrace(trace, {
        success: true,
        stats: { eventCount: events.length },
      });
      return { ...payload, trace: traceResult };
    } catch (error) {
      completeExportTrace(trace, {
        success: false,
        error,
      });
      throw error;
    }
  }

  /**
   * Export session to Markdown
   */
  exportToMarkdown(sessionId: string): string {
    assertConsent(this.engine.getProjectPath(), 'export_operational', {
      source: 'core.session-exporter.exportToMarkdown',
      resource: sessionId,
    });
    const trace = beginExportTrace({
      projectPath: this.engine.getProjectPath(),
      action: 'export_operational',
      source: 'core.session-exporter.exportToMarkdown',
      resource: sessionId,
    });

    try {
      const events = this.logger.getAllEvents().filter(e => e.sessionId === sessionId);
      
      let md = `# Session ${sessionId}\n\n`;
      md += `**Start**: ${events[0]?.timestamp}\n`;
      md += `**End**: ${events[events.length - 1]?.timestamp}\n`;
      md += `**Events**: ${events.length}\n\n`;
      
      md += `## Timeline\n\n`;
      
      for (const event of events) {
        md += `### ${event.type} - ${event.timestamp}\n\n`;
        
        switch (event.type) {
          case 'user_message':
            md += `**User**: ${event.data.content}\n\n`;
            break;
          case 'assistant_message':
            md += `**Assistant**: ${event.data.content}\n\n`;
            break;
          case 'file_created':
          case 'file_modified':
          case 'file_deleted':
            md += `**File**: ${event.data.filePath}\n`;
            md += `**Size**: ${event.data.oldSize} → ${event.data.newSize} bytes\n\n`;
            const diff = this.logger.getDiff(event);
            if (diff) {
              md += `\`\`\`diff\n${diff}\n\`\`\`\n\n`;
            }
            break;
          case 'checkpoint_created':
            md += `**Checkpoint**: ${event.data.checkpointId}\n`;
            md += `**Description**: ${event.data.description}\n\n`;
            break;
        }
      }
      completeExportTrace(trace, {
        success: true,
        stats: { eventCount: events.length },
      });
      return md;
    } catch (error) {
      completeExportTrace(trace, {
        success: false,
        error,
      });
      throw error;
    }
  }

  /**
   * Generate session summary
   */
  private generateSummary(events: any[]): any {
    const messageCount = events.filter(e => e.type === 'user_message' || e.type === 'assistant_message').length;
    const codeChanges = events.filter(e => e.type === 'file_created' || e.type === 'file_modified' || e.type === 'file_deleted').length;
    const toolCalls = events.filter(e => e.type === 'tool_call').length;
    const checkpoints = events.filter(e => e.type === 'checkpoint_created').length;
    
    const filesChanged = new Set(
      events
        .filter(e => e.type === 'file_created' || e.type === 'file_modified' || e.type === 'file_deleted')
        .map(e => e.data.filePath)
    );
    
    return {
      messageCount,
      codeChanges,
      toolCalls,
      checkpoints,
      filesChanged: Array.from(filesChanged)
    };
  }

  /**
   * Save export to file
   */
  saveExport(sessionId: string, format: 'json' | 'markdown', outputPath: string): void {
    const content = format === 'json' 
      ? JSON.stringify(this.exportToJSON(sessionId), null, 2)
      : this.exportToMarkdown(sessionId);
    
    fs.writeFileSync(outputPath, content, 'utf-8');
  }
}
