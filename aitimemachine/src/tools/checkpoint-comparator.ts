import { TimeMachineEngine } from '../core/engine.js';
import { ConversationLogger } from '../core/conversation-logger.js';
import { EventStore } from '../core/event-store.js';

export interface ComparisonResult {
  from: {
    id: string;
    description: string;
    timestamp: Date;
  };
  to: {
    id: string;
    description: string;
    timestamp: Date;
  };
  fileChanges: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
  conversationChanges: {
    messageCount: number;
    toolCalls: number;
    newMessages: Array<{
      role: string;
      content: string;
      timestamp: Date;
    }>;
  };
  timeDiff: number; // milliseconds
}

/**
 * Compare two checkpoints - files and conversation
 */
export class CheckpointComparator {
  constructor(
    private logger: ConversationLogger,
    private eventStore: EventStore,
    private engine: TimeMachineEngine
  ) {}

  /**
   * Compare two checkpoints
   */
  compare(fromId: string, toId: string): ComparisonResult {
    const from = this.engine.getTimePoint(fromId);
    const to = this.engine.getTimePoint(toId);

    if (!from || !to) {
      throw new Error('Checkpoint not found');
    }

    // File changes
    const fileChanges = this.compareFiles(from, to);

    // Conversation changes
    const conversationChanges = this.compareConversation(fromId, toId);

    return {
      from: {
        id: from.id,
        description: from.description,
        timestamp: from.timestamp,
      },
      to: {
        id: to.id,
        description: to.description,
        timestamp: to.timestamp,
      },
      fileChanges,
      conversationChanges,
      timeDiff: to.timestamp.getTime() - from.timestamp.getTime(),
    };
  }

  private compareFiles(from: any, to: any) {
    const fromFiles = new Set(from.files.map((f: any) => f.path));
    const toFiles = new Set(to.files.map((f: any) => f.path));

    const added: string[] = [];
    const deleted: string[] = [];
    const modified: string[] = [];

    // Find added files
    for (const file of toFiles) {
      if (!fromFiles.has(file)) {
        added.push(file as string);
      }
    }

    // Find deleted files
    for (const file of fromFiles) {
      if (!toFiles.has(file)) {
        deleted.push(file as string);
      }
    }

    // Find modified files
    const fromMap = new Map(from.files.map((f: any) => [f.path, f.hash]));
    const toMap = new Map(to.files.map((f: any) => [f.path, f.hash]));

    for (const [path, hash] of toMap) {
      if (fromMap.has(path) && fromMap.get(path) !== hash) {
        modified.push(path as string);
      }
    }

    return { added, modified, deleted };
  }

  private compareConversation(fromId: string, toId: string) {
    const fromEvents = this.eventStore.getEventsUntil(fromId);
    const toEvents = this.eventStore.getEventsUntil(toId);

    const newEvents = toEvents.slice(fromEvents.length);

    const messages = newEvents.filter(
      e => e.type === 'user_message' || e.type === 'assistant_message'
    );

    const toolCalls = newEvents.filter(e => e.type === 'tool_call');

    return {
      messageCount: messages.length,
      toolCalls: toolCalls.length,
      newMessages: messages.map(e => ({
        role: e.type === 'user_message' ? 'user' : 'assistant',
        content: e.data.content || '',
        timestamp: e.timestamp,
      })),
    };
  }

  /**
   * Generate comparison report
   */
  generateReport(comparison: ComparisonResult): string {
    const { from, to, fileChanges, conversationChanges, timeDiff } = comparison;

    const duration = this.formatDuration(timeDiff);

    let report = `# Checkpoint Comparison\n\n`;
    report += `## From: ${from.description}\n`;
    report += `**Time:** ${from.timestamp.toISOString()}\n\n`;
    report += `## To: ${to.description}\n`;
    report += `**Time:** ${to.timestamp.toISOString()}\n`;
    report += `**Duration:** ${duration}\n\n`;

    report += `## File Changes\n\n`;
    report += `- **Added:** ${fileChanges.added.length} files\n`;
    report += `- **Modified:** ${fileChanges.modified.length} files\n`;
    report += `- **Deleted:** ${fileChanges.deleted.length} files\n\n`;

    if (fileChanges.added.length > 0) {
      report += `### Added Files\n`;
      fileChanges.added.forEach(f => report += `- ${f}\n`);
      report += `\n`;
    }

    if (fileChanges.modified.length > 0) {
      report += `### Modified Files\n`;
      fileChanges.modified.forEach(f => report += `- ${f}\n`);
      report += `\n`;
    }

    if (fileChanges.deleted.length > 0) {
      report += `### Deleted Files\n`;
      fileChanges.deleted.forEach(f => report += `- ${f}\n`);
      report += `\n`;
    }

    report += `## Conversation Changes\n\n`;
    report += `- **Messages:** ${conversationChanges.messageCount}\n`;
    report += `- **Tool Calls:** ${conversationChanges.toolCalls}\n\n`;

    if (conversationChanges.newMessages.length > 0) {
      report += `### New Messages\n\n`;
      conversationChanges.newMessages.forEach(m => {
        const icon = m.role === 'user' ? '👤' : '🤖';
        report += `${icon} **${m.role}** (${m.timestamp.toISOString()})\n`;
        report += `${m.content.slice(0, 200)}${m.content.length > 200 ? '...' : ''}\n\n`;
      });
    }

    return report;
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}
