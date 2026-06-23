import { TimeMachineEngine } from './engine.js';
import { AnnotationStore } from './annotation-store.js';
import type { TimePoint } from './types.js';

export interface ComparisonReport {
  markdown: string;
  summary: {
    from: { id: string; description: string; timestamp: Date };
    to: { id: string; description: string; timestamp: Date };
    duration: string;
    totalChanges: number;
    added: number;
    modified: number;
    deleted: number;
  };
}

export class CheckpointReportGenerator {
  constructor(
    private engine: TimeMachineEngine,
    private annotations?: AnnotationStore
  ) {}

  generateComparison(fromId: string, toId?: string): ComparisonReport {
    const fromTp = this.engine.getTimePoint(fromId);
    if (!fromTp) throw new Error(`Checkpoint not found: ${fromId}`);

    const toTp = toId ? this.engine.getTimePoint(toId) : null;
    const diff = this.engine.getDiff(fromId, toId);

    const duration = this.formatDuration(
      (toTp?.timestamp || new Date()).getTime() - fromTp.timestamp.getTime()
    );

    const summary = {
      from: { id: fromId, description: fromTp.description, timestamp: fromTp.timestamp },
      to: { 
        id: toId || 'current', 
        description: toTp?.description || 'Current State', 
        timestamp: toTp?.timestamp || new Date() 
      },
      duration,
      totalChanges: diff.added.length + diff.modified.length + diff.deleted.length,
      added: diff.added.length,
      modified: diff.modified.length,
      deleted: diff.deleted.length
    };

    const fromAnn = this.annotations?.get(fromId);
    const toAnn = toId ? this.annotations?.get(toId) : undefined;

    let md = `# Checkpoint Comparison Report\n\n`;
    md += `Generated: ${new Date().toISOString()}\n\n`;
    md += `## Summary\n\n`;
    md += `| Metric | Value |\n|--------|-------|\n`;
    md += `| From | ${fromTp.description} |\n`;
    md += `| To | ${toTp?.description || 'Current State'} |\n`;
    md += `| Duration | ${duration} |\n`;
    md += `| Total Changes | ${summary.totalChanges} |\n`;
    md += `| Files Added | ${diff.added.length} |\n`;
    md += `| Files Modified | ${diff.modified.length} |\n`;
    md += `| Files Deleted | ${diff.deleted.length} |\n\n`;

    // Annotations
    if (fromAnn || toAnn) {
      md += `## Annotations\n\n`;
      if (fromAnn) {
        md += `### From Checkpoint\n`;
        if (fromAnn.notes) md += `> ${fromAnn.notes}\n\n`;
        if (fromAnn.tags.length) md += `Tags: ${fromAnn.tags.map(t => `\`${t}\``).join(', ')}\n\n`;
      }
      if (toAnn) {
        md += `### To Checkpoint\n`;
        if (toAnn.notes) md += `> ${toAnn.notes}\n\n`;
        if (toAnn.tags.length) md += `Tags: ${toAnn.tags.map(t => `\`${t}\``).join(', ')}\n\n`;
      }
    }

    // File changes
    if (diff.added.length > 0) {
      md += `## Added Files (${diff.added.length})\n\n`;
      diff.added.forEach(f => md += `- \`${f}\`\n`);
      md += '\n';
    }

    if (diff.modified.length > 0) {
      md += `## Modified Files (${diff.modified.length})\n\n`;
      diff.modified.forEach(f => md += `- \`${f}\`\n`);
      md += '\n';
    }

    if (diff.deleted.length > 0) {
      md += `## Deleted Files (${diff.deleted.length})\n\n`;
      diff.deleted.forEach(f => md += `- \`${f}\`\n`);
      md += '\n';
    }

    // Checkpoint details
    md += `## Checkpoint Details\n\n`;
    md += `### From: ${fromTp.description}\n\n`;
    md += `- **ID:** \`${fromId}\`\n`;
    md += `- **Time:** ${fromTp.timestamp.toISOString()}\n`;
    md += `- **Files:** ${fromTp.stats.totalFiles}\n`;
    md += `- **Size:** ${this.formatSize(fromTp.stats.totalSize)}\n`;
    md += `- **Trigger:** ${fromTp.trigger.type}${fromTp.trigger.action ? ` (${fromTp.trigger.action})` : ''}\n\n`;

    if (toTp) {
      md += `### To: ${toTp.description}\n\n`;
      md += `- **ID:** \`${toId}\`\n`;
      md += `- **Time:** ${toTp.timestamp.toISOString()}\n`;
      md += `- **Files:** ${toTp.stats.totalFiles}\n`;
      md += `- **Size:** ${this.formatSize(toTp.stats.totalSize)}\n`;
      md += `- **Trigger:** ${toTp.trigger.type}${toTp.trigger.action ? ` (${toTp.trigger.action})` : ''}\n\n`;
    }

    return { markdown: md, summary };
  }

  generateCheckpointReport(checkpointId: string): string {
    const tp = this.engine.getTimePoint(checkpointId);
    if (!tp) throw new Error(`Checkpoint not found: ${checkpointId}`);

    const ann = this.annotations?.get(checkpointId);

    let md = `# Checkpoint Report\n\n`;
    md += `## ${tp.description}\n\n`;
    md += `| Property | Value |\n|----------|-------|\n`;
    md += `| ID | \`${checkpointId}\` |\n`;
    md += `| Time | ${tp.timestamp.toISOString()} |\n`;
    md += `| Files | ${tp.stats.totalFiles} |\n`;
    md += `| Size | ${this.formatSize(tp.stats.totalSize)} |\n`;
    md += `| Trigger | ${tp.trigger.type} |\n`;
    if (tp.trigger.action) md += `| Action | ${tp.trigger.action} |\n`;
    md += '\n';

    if (ann) {
      md += `## Notes\n\n`;
      if (ann.notes) md += `${ann.notes}\n\n`;
      if (ann.tags.length) md += `**Tags:** ${ann.tags.map(t => `\`${t}\``).join(', ')}\n\n`;
    }

    if (tp.changes.added.length + tp.changes.modified.length + tp.changes.deleted.length > 0) {
      md += `## Changes\n\n`;
      if (tp.changes.added.length) {
        md += `### Added (${tp.changes.added.length})\n`;
        tp.changes.added.slice(0, 20).forEach(f => md += `- \`${f}\`\n`);
        if (tp.changes.added.length > 20) md += `- ... and ${tp.changes.added.length - 20} more\n`;
        md += '\n';
      }
      if (tp.changes.modified.length) {
        md += `### Modified (${tp.changes.modified.length})\n`;
        tp.changes.modified.slice(0, 20).forEach(f => md += `- \`${f}\`\n`);
        if (tp.changes.modified.length > 20) md += `- ... and ${tp.changes.modified.length - 20} more\n`;
        md += '\n';
      }
      if (tp.changes.deleted.length) {
        md += `### Deleted (${tp.changes.deleted.length})\n`;
        tp.changes.deleted.slice(0, 20).forEach(f => md += `- \`${f}\`\n`);
        if (tp.changes.deleted.length > 20) md += `- ... and ${tp.changes.deleted.length - 20} more\n`;
        md += '\n';
      }
    }

    return md;
  }

  private formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
}
