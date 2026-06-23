/**
 * Analytics Export Utilities
 * Generate usage patterns, metrics, and insights
 */

import * as fs from 'fs';
import { Redactor, createDefaultRedactor } from './privacy.js';

/**
 * Time range for analytics
 */
export interface TimeRange {
  start: Date;
  end: Date;
}

/**
 * Checkpoint statistics
 */
export interface CheckpointStats {
  total: number;
  byTrigger: Record<string, number>;
  byTool: Record<string, number>;
  perDay: Record<string, number>;
  perHour: Record<string, number>;
  averageFilesPerCheckpoint: number;
  averageSizePerCheckpoint: number;
}

/**
 * Restore statistics
 */
export interface RestoreStats {
  total: number;
  successRate: number;
  averageTimeTaken: number;
  byReason: Record<string, number>;
  byCheckpointAge: Record<string, number>;
}

/**
 * Error statistics
 */
export interface ErrorStats {
  total: number;
  byType: Record<string, number>;
  byTool: Record<string, number>;
  recoveryRate: number;
  averageRecoveryTime: number;
  mostCommon: Array<{ type: string; count: number; lastOccurred: string }>;
}

/**
 * Time to fix metrics
 */
export interface TimeToFixMetrics {
  average: number;
  median: number;
  p90: number;
  p99: number;
  byErrorType: Record<string, number>;
  trend: Array<{ date: string; avgTime: number }>;
}

/**
 * Usage patterns
 */
export interface UsagePatterns {
  activeHours: Record<string, number>;
  activeDays: Record<string, number>;
  sessionDurations: number[];
  averageSessionDuration: number;
  toolUsage: Record<string, number>;
  fileTypeDistribution: Record<string, number>;
}

/**
 * Complete analytics summary
 */
export interface AnalyticsSummary {
  timeRange: TimeRange;
  checkpoints: CheckpointStats;
  restores: RestoreStats;
  errors: ErrorStats;
  timeToFix: TimeToFixMetrics;
  usage: UsagePatterns;
  generatedAt: string;
}

/**
 * Analytics export configuration
 */
export interface AnalyticsConfig {
  timeRange?: TimeRange;
  redactor?: Redactor;
  includeFilePaths: boolean;
  groupByDay: boolean;
}

/**
 * Default analytics configuration
 */
export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  includeFilePaths: false,
  groupByDay: true,
};

type AnalyticsEventData = Record<string, unknown>;
type AnalyticsEvent = {
  type: string;
  timestamp: Date | string;
  sessionId?: string;
  data: unknown;
};

type AnalyticsCheckpoint = {
  id: string;
  timestamp: Date | string;
  trigger?: { type?: string; tool?: string };
  stats?: { totalFiles?: number; totalSize?: number };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Analytics Exporter
 */
export class AnalyticsExporter {
  private config: AnalyticsConfig;
  private redactor: Redactor;

  constructor(config: Partial<AnalyticsConfig> = {}) {
    this.config = { ...DEFAULT_ANALYTICS_CONFIG, ...config };
    this.redactor = this.config.redactor || createDefaultRedactor();
  }

  /**
   * Calculate checkpoint statistics
   */
  calculateCheckpointStats(
    checkpoints: Array<{
      id: string;
      timestamp: Date | string;
      trigger?: { type?: string; tool?: string };
      stats?: { totalFiles?: number; totalSize?: number };
    }>
  ): CheckpointStats {
    const byTrigger: Record<string, number> = {};
    const byTool: Record<string, number> = {};
    const perDay: Record<string, number> = {};
    const perHour: Record<string, number> = {};
    let totalFiles = 0;
    let totalSize = 0;

    for (const cp of checkpoints) {
      const ts = cp.timestamp instanceof Date ? cp.timestamp : new Date(cp.timestamp);

      // By trigger
      const trigger = cp.trigger?.type || 'unknown';
      byTrigger[trigger] = (byTrigger[trigger] || 0) + 1;

      // By tool
      const tool = cp.trigger?.tool || 'unknown';
      byTool[tool] = (byTool[tool] || 0) + 1;

      // Per day
      const dayKey = ts.toISOString().split('T')[0];
      perDay[dayKey] = (perDay[dayKey] || 0) + 1;

      // Per hour
      const hourKey = ts.getHours().toString().padStart(2, '0');
      perHour[hourKey] = (perHour[hourKey] || 0) + 1;

      // Stats
      if (cp.stats) {
        totalFiles += cp.stats.totalFiles || 0;
        totalSize += cp.stats.totalSize || 0;
      }
    }

    return {
      total: checkpoints.length,
      byTrigger,
      byTool,
      perDay,
      perHour,
      averageFilesPerCheckpoint: checkpoints.length > 0 ? totalFiles / checkpoints.length : 0,
      averageSizePerCheckpoint: checkpoints.length > 0 ? totalSize / checkpoints.length : 0,
    };
  }

  /**
   * Calculate restore statistics
   */
  calculateRestoreStats(
    restores: Array<{
      timestamp: Date | string;
      checkpointId: string;
      checkpointTimestamp?: Date | string;
      success: boolean;
      duration?: number;
      reason?: string;
    }>
  ): RestoreStats {
    const byReason: Record<string, number> = {};
    const byCheckpointAge: Record<string, number> = {};
    let successCount = 0;
    let totalDuration = 0;
    let durationCount = 0;

    for (const restore of restores) {
      if (restore.success) successCount++;

      // By reason
      const reason = restore.reason || 'unknown';
      byReason[reason] = (byReason[reason] || 0) + 1;

      // Duration
      if (restore.duration !== undefined) {
        totalDuration += restore.duration;
        durationCount++;
      }

      // By checkpoint age
      if (restore.checkpointTimestamp) {
        const restoreTs = restore.timestamp instanceof Date ? restore.timestamp : new Date(restore.timestamp);
        const cpTs = restore.checkpointTimestamp instanceof Date
          ? restore.checkpointTimestamp
          : new Date(restore.checkpointTimestamp);
        const ageMs = restoreTs.getTime() - cpTs.getTime();
        const ageCategory = this.categorizeAge(ageMs);
        byCheckpointAge[ageCategory] = (byCheckpointAge[ageCategory] || 0) + 1;
      }
    }

    return {
      total: restores.length,
      successRate: restores.length > 0 ? successCount / restores.length : 0,
      averageTimeTaken: durationCount > 0 ? totalDuration / durationCount : 0,
      byReason,
      byCheckpointAge,
    };
  }

  /**
   * Calculate error statistics
   */
  calculateErrorStats(
    events: AnalyticsEvent[]
  ): ErrorStats {
    const errors = events.filter(e =>
      e.type === 'tool_error' || e.type === 'error_occurred'
    );

    const byType: Record<string, number> = {};
    const byTool: Record<string, number> = {};
    const errorDetails: Array<{ type: string; timestamp: Date; recovered: boolean; recoveryTime?: number }> = [];

    let recoveredCount = 0;
    let totalRecoveryTime = 0;
    let recoveryTimeCount = 0;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.type !== 'tool_error' && event.type !== 'error_occurred') continue;

      const data = asRecord(event.data);
      const errorType = readString(data.type) || readString(data.errorType) || 'unknown';
      const tool = readString(data.tool) || 'unknown';
      const ts = event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp);

      byType[errorType] = (byType[errorType] || 0) + 1;
      byTool[tool] = (byTool[tool] || 0) + 1;

      // Check for recovery
      const recovery = this.findRecovery(events, i);
      errorDetails.push({
        type: errorType,
        timestamp: ts,
        recovered: recovery.recovered,
        recoveryTime: recovery.recoveryTime,
      });

      if (recovery.recovered) {
        recoveredCount++;
        if (recovery.recoveryTime !== undefined) {
          totalRecoveryTime += recovery.recoveryTime;
          recoveryTimeCount++;
        }
      }
    }

    // Most common errors
    const mostCommon = Object.entries(byType)
      .map(([type, count]) => ({
        type,
        count,
        lastOccurred: errorDetails
          .filter(e => e.type === type)
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0]
          ?.timestamp.toISOString() || '',
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      total: errors.length,
      byType,
      byTool,
      recoveryRate: errors.length > 0 ? recoveredCount / errors.length : 0,
      averageRecoveryTime: recoveryTimeCount > 0 ? totalRecoveryTime / recoveryTimeCount : 0,
      mostCommon,
    };
  }

  /**
   * Calculate time to fix metrics
   */
  calculateTimeToFixMetrics(
    events: AnalyticsEvent[]
  ): TimeToFixMetrics {
    const fixTimes: number[] = [];
    const byErrorType: Record<string, number[]> = {};
    const byDate: Record<string, number[]> = {};

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.type !== 'tool_error' && event.type !== 'error_occurred') continue;

      const data = asRecord(event.data);
      const errorType = readString(data.type) || readString(data.errorType) || 'unknown';
      const ts = event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp);
      const dateKey = ts.toISOString().split('T')[0];

      const recovery = this.findRecovery(events, i);
      if (recovery.recovered && recovery.recoveryTime !== undefined) {
        fixTimes.push(recovery.recoveryTime);

        if (!byErrorType[errorType]) byErrorType[errorType] = [];
        byErrorType[errorType].push(recovery.recoveryTime);

        if (!byDate[dateKey]) byDate[dateKey] = [];
        byDate[dateKey].push(recovery.recoveryTime);
      }
    }

    // Calculate percentiles
    const sorted = [...fixTimes].sort((a, b) => a - b);
    const p90Index = Math.floor(sorted.length * 0.9);
    const p99Index = Math.floor(sorted.length * 0.99);
    const medianIndex = Math.floor(sorted.length / 2);

    // Calculate averages by type
    const avgByType: Record<string, number> = {};
    for (const [type, times] of Object.entries(byErrorType)) {
      avgByType[type] = times.reduce((a, b) => a + b, 0) / times.length;
    }

    // Calculate trend
    const trend = Object.entries(byDate)
      .map(([date, times]) => ({
        date,
        avgTime: times.reduce((a, b) => a + b, 0) / times.length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      average: fixTimes.length > 0 ? fixTimes.reduce((a, b) => a + b, 0) / fixTimes.length : 0,
      median: sorted[medianIndex] || 0,
      p90: sorted[p90Index] || 0,
      p99: sorted[p99Index] || 0,
      byErrorType: avgByType,
      trend,
    };
  }

  /**
   * Calculate usage patterns
   */
  calculateUsagePatterns(
    events: AnalyticsEvent[]
  ): UsagePatterns {
    const activeHours: Record<string, number> = {};
    const activeDays: Record<string, number> = {};
    const toolUsage: Record<string, number> = {};
    const fileTypes: Record<string, number> = {};
    const sessionTimestamps: Map<string, Date[]> = new Map();

    for (const event of events) {
      const ts = event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp);
      const data = asRecord(event.data);

      // Active hours
      const hourKey = ts.getHours().toString().padStart(2, '0');
      activeHours[hourKey] = (activeHours[hourKey] || 0) + 1;

      // Active days
      const dayKey = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][ts.getDay()];
      activeDays[dayKey] = (activeDays[dayKey] || 0) + 1;

      // Tool usage
      if (event.type === 'tool_call') {
        const tool = readString(data.toolName) || readString(data.name) || 'unknown';
        toolUsage[tool] = (toolUsage[tool] || 0) + 1;
      }

      // File types
      const files = Array.isArray(data.files) ? data.files : [];
      for (const file of files) {
        const filePath = readString(file);
        if (filePath) {
          const ext = this.getFileExtension(filePath);
          fileTypes[ext] = (fileTypes[ext] || 0) + 1;
        }
      }

      const singleFilePath = readString(data.filePath);
      if (singleFilePath) {
        const ext = this.getFileExtension(singleFilePath);
        fileTypes[ext] = (fileTypes[ext] || 0) + 1;
      }

      // Session tracking
      if (event.sessionId) {
        if (!sessionTimestamps.has(event.sessionId)) {
          sessionTimestamps.set(event.sessionId, []);
        }
        sessionTimestamps.get(event.sessionId)!.push(ts);
      }
    }

    // Calculate session durations
    const sessionDurations: number[] = [];
    for (const timestamps of sessionTimestamps.values()) {
      if (timestamps.length >= 2) {
        const sorted = timestamps.sort((a, b) => a.getTime() - b.getTime());
        const duration = sorted[sorted.length - 1].getTime() - sorted[0].getTime();
        sessionDurations.push(duration);
      }
    }

    return {
      activeHours,
      activeDays,
      sessionDurations,
      averageSessionDuration: sessionDurations.length > 0
        ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length
        : 0,
      toolUsage,
      fileTypeDistribution: fileTypes,
    };
  }

  /**
   * Generate complete analytics summary
   */
  generateSummary(
    checkpoints: AnalyticsCheckpoint[],
    events: AnalyticsEvent[],
    restores: Array<{
      timestamp: Date | string;
      checkpointId: string;
      checkpointTimestamp?: Date | string;
      success: boolean;
      duration?: number;
      reason?: string;
    }> = []
  ): AnalyticsSummary {
    // Determine time range
    const allTimestamps = [
      ...checkpoints.map(c => c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp)),
      ...events.map(e => e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp)),
    ].sort((a, b) => a.getTime() - b.getTime());

    const timeRange: TimeRange = this.config.timeRange || {
      start: allTimestamps[0] || new Date(),
      end: allTimestamps[allTimestamps.length - 1] || new Date(),
    };

    // Filter by time range if specified
    const filteredCheckpoints = this.config.timeRange
      ? checkpoints.filter(c => {
          const ts = c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp);
          return ts >= timeRange.start && ts <= timeRange.end;
        })
      : checkpoints;

    const filteredEvents = this.config.timeRange
      ? events.filter(e => {
          const ts = e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp);
          return ts >= timeRange.start && ts <= timeRange.end;
        })
      : events;

    const filteredRestores = this.config.timeRange
      ? restores.filter(r => {
          const ts = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp);
          return ts >= timeRange.start && ts <= timeRange.end;
        })
      : restores;

    return {
      timeRange,
      checkpoints: this.calculateCheckpointStats(filteredCheckpoints),
      restores: this.calculateRestoreStats(filteredRestores),
      errors: this.calculateErrorStats(filteredEvents),
      timeToFix: this.calculateTimeToFixMetrics(filteredEvents),
      usage: this.calculateUsagePatterns(filteredEvents),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Export analytics as JSON
   */
  exportJSON(summary: AnalyticsSummary): string {
    return JSON.stringify(summary, null, 2);
  }

  /**
   * Export analytics as CSV
   */
  exportCSV(summary: AnalyticsSummary, type: 'checkpoints' | 'errors' | 'usage' = 'checkpoints'): string {
    switch (type) {
      case 'checkpoints':
        return this.checkpointsToCSV(summary.checkpoints);
      case 'errors':
        return this.errorsToCSV(summary.errors);
      case 'usage':
        return this.usageToCSV(summary.usage);
      default:
        return '';
    }
  }

  /**
   * Write analytics to file
   */
  writeToFile(summary: AnalyticsSummary, outputPath: string, format: 'json' | 'csv' = 'json'): void {
    const content = format === 'json'
      ? this.exportJSON(summary)
      : this.exportCSV(summary);
    fs.writeFileSync(outputPath, content, 'utf-8');
  }

  // Private helper methods

  private categorizeAge(ageMs: number): string {
    const hours = ageMs / (1000 * 60 * 60);
    if (hours < 1) return '<1h';
    if (hours < 24) return '1-24h';
    if (hours < 168) return '1-7d';
    return '>7d';
  }

  private findRecovery(
    events: AnalyticsEvent[],
    errorIndex: number
  ): { recovered: boolean; recoveryTime?: number } {
    const errorTs = events[errorIndex].timestamp instanceof Date
      ? events[errorIndex].timestamp
      : new Date(events[errorIndex].timestamp);

    for (let i = errorIndex + 1; i < Math.min(errorIndex + 20, events.length); i++) {
      const event = events[i];

      if (event.type === 'tool_error' || event.type === 'error_occurred') {
        return { recovered: false };
      }

      if (event.type === 'checkpoint_created' &&
          readString(asRecord(asRecord(event.data).trigger).status) === 'after_success') {
        const recoveryTs = event.timestamp instanceof Date
          ? event.timestamp
          : new Date(event.timestamp);
        return {
          recovered: true,
          recoveryTime: recoveryTs.getTime() - (errorTs as Date).getTime(),
        };
      }
    }

    return { recovered: true }; // Assume recovered if no more errors
  }

  private getFileExtension(filePath: string): string {
    const parts = filePath.split('.');
    if (parts.length > 1) {
      return '.' + parts[parts.length - 1].toLowerCase();
    }
    return 'no-extension';
  }

  private checkpointsToCSV(stats: CheckpointStats): string {
    const rows: string[] = ['date,count'];
    for (const [date, count] of Object.entries(stats.perDay)) {
      rows.push(`${date},${count}`);
    }
    return rows.join('\n');
  }

  private errorsToCSV(stats: ErrorStats): string {
    const rows: string[] = ['type,count,last_occurred'];
    for (const error of stats.mostCommon) {
      rows.push(`${error.type},${error.count},${error.lastOccurred}`);
    }
    return rows.join('\n');
  }

  private usageToCSV(stats: UsagePatterns): string {
    const rows: string[] = ['metric,key,value'];

    for (const [hour, count] of Object.entries(stats.activeHours)) {
      rows.push(`active_hours,${hour},${count}`);
    }

    for (const [day, count] of Object.entries(stats.activeDays)) {
      rows.push(`active_days,${day},${count}`);
    }

    for (const [tool, count] of Object.entries(stats.toolUsage)) {
      rows.push(`tool_usage,${tool},${count}`);
    }

    return rows.join('\n');
  }
}

/**
 * Create an analytics exporter with default settings
 */
export function createAnalyticsExporter(config?: Partial<AnalyticsConfig>): AnalyticsExporter {
  return new AnalyticsExporter(config);
}

/**
 * Quick utility to generate analytics summary
 */
export function generateAnalytics(
  checkpoints: AnalyticsCheckpoint[],
  events: AnalyticsEvent[]
): AnalyticsSummary {
  const exporter = new AnalyticsExporter();
  return exporter.generateSummary(checkpoints, events);
}
