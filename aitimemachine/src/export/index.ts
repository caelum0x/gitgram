/**
 * AITimeMachine Data Export Utilities
 *
 * This module provides comprehensive export functionality for:
 * - AI training data in JSONL format
 * - Analytics and metrics
 * - Privacy-preserving redaction
 */

// Re-export all privacy utilities
export {
  RedactionPattern,
  RedactionConfig,
  RedactionResult,
  DEFAULT_SECRET_PATTERNS,
  DEFAULT_SENSITIVE_FILENAMES,
  DEFAULT_REDACTION_CONFIG,
  createMinimalRedactionConfig,
  createStrictRedactionConfig,
  Redactor,
  createDefaultRedactor,
  createMinimalRedactor,
  createStrictRedactor,
  redactText,
  hasSecrets,
} from './privacy.js';

// Re-export all training data utilities
export {
  TrainingFormat,
  TrainingExample,
  ToolUseExample,
  ErrorRecoveryExample,
  FileChangeExample,
  TrainingExportConfig,
  DEFAULT_EXPORT_CONFIG,
  TrainingDataExporter,
  createTrainingExporter,
  exportConversationsToJSONL,
} from './training-data.js';

// Re-export all analytics utilities
export {
  TimeRange,
  CheckpointStats,
  RestoreStats,
  ErrorStats,
  TimeToFixMetrics,
  UsagePatterns,
  AnalyticsSummary,
  AnalyticsConfig,
  DEFAULT_ANALYTICS_CONFIG,
  AnalyticsExporter,
  createAnalyticsExporter,
  generateAnalytics,
} from './analytics.js';

// Re-export legacy modules for backward compatibility
export * from './data-exporter.js';
export * from './session-exporter.js';
export * from './changes-exporter.js';
export * from './training-exporter.js';
export * from './privacy-redactor.js';
export * from './redaction-benchmark.js';

import * as fs from 'fs';
import * as path from 'path';
import { Redactor, createDefaultRedactor } from './privacy.js';
import { TrainingDataExporter } from './training-data.js';
import { AnalyticsExporter, AnalyticsSummary } from './analytics.js';
import { assertConsent } from '../auth/consent-policy.js';
import { beginExportTrace, completeExportTrace, type ExportTrace } from './traceability.js';
import { assertLicenseCompliance } from '../compliance/license-policy.js';

/**
 * Complete export configuration
 */
export interface ExportConfig {
  outputDir: string;
  includeTrainingData: boolean;
  includeAnalytics: boolean;
  includeToolExamples: boolean;
  includeErrorRecovery: boolean;
  includeFileChanges: boolean;
  redactor?: Redactor;
  trainingFormat?: 'openai' | 'anthropic' | 'generic';
  analyticsFormat?: 'json' | 'csv';
}

/**
 * Export result
 */
export interface ExportResult {
  success: boolean;
  outputDir: string;
  trace: ExportTrace;
  files: string[];
  stats: {
    trainingExamples?: number;
    toolExamples?: number;
    errorRecoveryExamples?: number;
    fileChangeExamples?: number;
    checkpointsAnalyzed?: number;
    eventsAnalyzed?: number;
  };
  errors?: string[];
}

/**
 * Default export configuration
 */
export const DEFAULT_FULL_EXPORT_CONFIG: ExportConfig = {
  outputDir: './export',
  includeTrainingData: true,
  includeAnalytics: true,
  includeToolExamples: true,
  includeErrorRecovery: true,
  includeFileChanges: true,
  trainingFormat: 'generic',
  analyticsFormat: 'json',
};

/**
 * Main export function that combines all features
 */
export async function exportAll(
  data: {
    messages?: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
      timestamp?: Date | string;
      metadata?: Record<string, unknown>;
    }>;
    events?: Array<{
      type: string;
      timestamp: Date | string;
      sessionId?: string;
      data: unknown;
    }>;
    checkpoints?: Array<{
      id: string;
      timestamp: Date | string;
      description: string;
      trigger?: { type?: string; tool?: string };
      stats?: { totalFiles?: number; totalSize?: number };
      files?: Array<{
        path: string;
        hash: string;
        content?: string;
      }>;
    }>;
    restores?: Array<{
      timestamp: Date | string;
      checkpointId: string;
      checkpointTimestamp?: Date | string;
      success: boolean;
      duration?: number;
      reason?: string;
    }>;
    getFileContent?: (checkpointId: string, filePath: string) => string | null;
  },
  config: Partial<ExportConfig> = {}
): Promise<ExportResult> {
  const fullConfig: ExportConfig = { ...DEFAULT_FULL_EXPORT_CONFIG, ...config };
  const needsTrainingConsent =
    !!fullConfig.includeTrainingData ||
    !!fullConfig.includeToolExamples ||
    !!fullConfig.includeErrorRecovery ||
    !!fullConfig.includeFileChanges;
  if (needsTrainingConsent) {
    assertLicenseCompliance(process.cwd(), 'dataset_export');
  }
  assertConsent(process.cwd(), needsTrainingConsent ? 'export_training' : 'export_operational', {
    source: 'export.index.exportAll',
    resource: fullConfig.outputDir,
  });
  const trace = beginExportTrace({
    projectPath: process.cwd(),
    action: needsTrainingConsent ? 'export_training' : 'export_operational',
    source: 'export.index.exportAll',
    resource: fullConfig.outputDir,
  });

  try {
    const redactor = fullConfig.redactor || createDefaultRedactor();
    const errors: string[] = [];
    const files: string[] = [];
    const stats: ExportResult['stats'] = {};

  // Ensure output directory exists
  if (!fs.existsSync(fullConfig.outputDir)) {
    fs.mkdirSync(fullConfig.outputDir, { recursive: true });
  }

  // Initialize exporters
  const trainingExporter = new TrainingDataExporter({
    format: fullConfig.trainingFormat,
    redactor,
  });
  const analyticsExporter = new AnalyticsExporter({ redactor });

  // Export training data
  if (fullConfig.includeTrainingData && data.messages) {
    try {
      const examples = trainingExporter.generateFromConversations(data.messages);
      stats.trainingExamples = examples.length;

      if (examples.length > 0) {
        const outputPath = path.join(fullConfig.outputDir, 'training-data.jsonl');
        trainingExporter.writeToFile(examples, outputPath);
        files.push(outputPath);
      }
    } catch (err) {
      errors.push(`Training data export failed: ${err}`);
    }
  }

  // Export tool examples
  if (fullConfig.includeToolExamples && data.events) {
    try {
      const toolExamples = trainingExporter.extractToolUseExamples(
        data.events as Array<{ type: string; timestamp?: Date | string; data: unknown; sessionId?: string }>
      );
      stats.toolExamples = toolExamples.length;

      if (toolExamples.length > 0) {
        const outputPath = path.join(fullConfig.outputDir, 'tool-examples.jsonl');
        trainingExporter.writeToolExamples(toolExamples, outputPath);
        files.push(outputPath);
      }
    } catch (err) {
      errors.push(`Tool examples export failed: ${err}`);
    }
  }

  // Export error recovery examples
  if (fullConfig.includeErrorRecovery && data.events) {
    try {
      const errorExamples = trainingExporter.extractErrorRecoveryPatterns(
        data.events as Array<{ type: string; timestamp?: Date | string; data: unknown; sessionId?: string }>
      );
      stats.errorRecoveryExamples = errorExamples.length;

      if (errorExamples.length > 0) {
        const outputPath = path.join(fullConfig.outputDir, 'error-recovery.jsonl');
        trainingExporter.writeErrorRecoveryExamples(errorExamples, outputPath);
        files.push(outputPath);
      }
    } catch (err) {
      errors.push(`Error recovery export failed: ${err}`);
    }
  }

  // Export file change examples
  if (fullConfig.includeFileChanges && data.checkpoints) {
    try {
      const checkpointsWithFiles = data.checkpoints.filter(c => c.files && c.files.length > 0);
      const fileExamples = trainingExporter.extractFileChangeExamples(
        checkpointsWithFiles as Array<{
          id: string;
          timestamp?: Date | string;
          description: string;
          files: Array<{ path: string; hash: string; content?: string }>;
          trigger?: { action?: string };
        }>,
        data.getFileContent
      );
      stats.fileChangeExamples = fileExamples.length;

      if (fileExamples.length > 0) {
        const outputPath = path.join(fullConfig.outputDir, 'file-changes.jsonl');
        trainingExporter.writeFileChangeExamples(fileExamples, outputPath);
        files.push(outputPath);
      }
    } catch (err) {
      errors.push(`File changes export failed: ${err}`);
    }
  }

  // Export analytics
  if (fullConfig.includeAnalytics && (data.checkpoints || data.events)) {
    try {
      const summary = analyticsExporter.generateSummary(
        data.checkpoints || [],
        (data.events || []) as Array<{ type: string; timestamp: Date | string; sessionId?: string; data: unknown }>,
        data.restores || []
      );

      stats.checkpointsAnalyzed = data.checkpoints?.length || 0;
      stats.eventsAnalyzed = data.events?.length || 0;

      const ext = fullConfig.analyticsFormat === 'csv' ? 'csv' : 'json';
      const outputPath = path.join(fullConfig.outputDir, `analytics.${ext}`);
      analyticsExporter.writeToFile(summary, outputPath, fullConfig.analyticsFormat);
      files.push(outputPath);

      // Also export individual CSV files for detailed analytics
      if (fullConfig.analyticsFormat === 'json') {
        const checkpointsCsv = path.join(fullConfig.outputDir, 'checkpoints-per-day.csv');
        fs.writeFileSync(checkpointsCsv, analyticsExporter.exportCSV(summary, 'checkpoints'), 'utf-8');
        files.push(checkpointsCsv);

        const errorsCsv = path.join(fullConfig.outputDir, 'errors-summary.csv');
        fs.writeFileSync(errorsCsv, analyticsExporter.exportCSV(summary, 'errors'), 'utf-8');
        files.push(errorsCsv);

        const usageCsv = path.join(fullConfig.outputDir, 'usage-patterns.csv');
        fs.writeFileSync(usageCsv, analyticsExporter.exportCSV(summary, 'usage'), 'utf-8');
        files.push(usageCsv);
      }
    } catch (err) {
      errors.push(`Analytics export failed: ${err}`);
    }
  }

  // Write export manifest
  const manifest = {
    exportedAt: new Date().toISOString(),
    config: {
      ...fullConfig,
      redactor: undefined, // Don't serialize the redactor
    },
    files,
    stats,
    errors: errors.length > 0 ? errors : undefined,
  };

  const manifestPath = path.join(fullConfig.outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  files.push(manifestPath);

    const result: Omit<ExportResult, 'trace'> = {
      success: errors.length === 0,
      outputDir: fullConfig.outputDir,
      files,
      stats,
      errors: errors.length > 0 ? errors : undefined,
    };
    const traceResult = completeExportTrace(trace, {
      success: result.success,
      outputPath: path.join(fullConfig.outputDir, 'manifest.json'),
      stats: stats as Record<string, unknown>,
      error: result.errors?.join('; '),
    });

    return {
      ...result,
      trace: traceResult,
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
 * Export only training data
 */
export function exportTrainingData(
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: Date | string;
    metadata?: Record<string, unknown>;
  }>,
  outputPath: string,
  format: 'openai' | 'anthropic' | 'generic' = 'generic'
): number {
  assertLicenseCompliance(process.cwd(), 'dataset_export');
  assertConsent(process.cwd(), 'export_training', {
    source: 'export.index.exportTrainingData',
    resource: outputPath,
  });
  const trace = beginExportTrace({
    projectPath: process.cwd(),
    action: 'export_training',
    source: 'export.index.exportTrainingData',
    resource: outputPath,
  });

  try {
    const exporter = new TrainingDataExporter({ format });
    const examples = exporter.generateFromConversations(messages);
    exporter.writeToFile(examples, outputPath);
    completeExportTrace(trace, {
      success: true,
      outputPath,
      stats: { examples: examples.length },
    });
    return examples.length;
  } catch (error) {
    completeExportTrace(trace, {
      success: false,
      error,
    });
    throw error;
  }
}

/**
 * Export only analytics
 */
export function exportAnalytics(
  checkpoints: Array<{
    id: string;
    timestamp: Date | string;
    trigger?: { type?: string; tool?: string };
    stats?: { totalFiles?: number; totalSize?: number };
  }>,
  events: Array<{ type: string; timestamp: Date | string; sessionId?: string; data: unknown }>,
  outputPath: string,
  format: 'json' | 'csv' = 'json'
): AnalyticsSummary {
  assertConsent(process.cwd(), 'export_operational', {
    source: 'export.index.exportAnalytics',
    resource: outputPath,
  });
  const trace = beginExportTrace({
    projectPath: process.cwd(),
    action: 'export_operational',
    source: 'export.index.exportAnalytics',
    resource: outputPath,
  });

  try {
    const exporter = new AnalyticsExporter();
    const summary = exporter.generateSummary(checkpoints, events);
    exporter.writeToFile(summary, outputPath, format);
    completeExportTrace(trace, {
      success: true,
      outputPath,
      stats: {
        checkpoints: checkpoints.length,
        events: events.length,
      },
    });
    return summary;
  } catch (error) {
    completeExportTrace(trace, {
      success: false,
      error,
    });
    throw error;
  }
}

/**
 * Validate export data before exporting (check for secrets)
 */
export function validateExportData(
  data: { content: string }[]
): { valid: boolean; secretsFound: number; files: string[] } {
  const redactor = createDefaultRedactor();
  let secretsFound = 0;
  const filesWithSecrets: string[] = [];

  for (let i = 0; i < data.length; i++) {
    const result = redactor.containsSecrets(data[i].content);
    if (result.hasSecrets) {
      secretsFound += result.patterns.length;
      filesWithSecrets.push(`item_${i}`);
    }
  }

  return {
    valid: secretsFound === 0,
    secretsFound,
    files: filesWithSecrets,
  };
}
