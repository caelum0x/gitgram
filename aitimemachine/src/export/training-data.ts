/**
 * Training Data Export Utilities
 * Generates JSONL format data for AI fine-tuning
 */

import * as fs from 'fs';
import * as path from 'path';
import { Redactor, createDefaultRedactor } from './privacy.js';
import { assertConsent } from '../auth/consent-policy.js';
import { beginExportTrace, completeExportTrace } from './traceability.js';
import { assertLicenseCompliance } from '../compliance/license-policy.js';

/**
 * Training data format types
 */
export type TrainingFormat = 'openai' | 'anthropic' | 'generic';

/**
 * A single training example (prompt/completion pair)
 */
export interface TrainingExample {
  id: string;
  timestamp: string;

  // Core training data
  prompt: string;
  completion: string;

  // Optional system context
  system?: string;

  // Metadata for filtering/categorization
  metadata: {
    source: 'conversation' | 'tool_use' | 'error_recovery' | 'file_change';
    tool?: string;
    action?: string;
    files?: string[];
    success?: boolean;
    tags?: string[];
  };
}

/**
 * Tool use example
 */
export interface ToolUseExample {
  id: string;
  timestamp: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput: string;
  context: string;
  success: boolean;
}

/**
 * Error recovery example
 */
export interface ErrorRecoveryExample {
  id: string;
  timestamp: string;
  errorType: string;
  errorMessage: string;
  recoveryAction: string;
  recoverySuccess: boolean;
  context: string;
  resolution?: string;
}

/**
 * File change example with before/after states
 */
export interface FileChangeExample {
  id: string;
  timestamp: string;
  filePath: string;
  action: 'create' | 'modify' | 'delete';
  beforeContent?: string;
  afterContent?: string;
  prompt: string;
  explanation?: string;
}

/**
 * Export configuration
 */
export interface TrainingExportConfig {
  format: TrainingFormat;
  includeSystemPrompt: boolean;
  maxPromptLength: number;
  maxCompletionLength: number;
  redactor?: Redactor;
  includeMetadata: boolean;
  filterBySuccess?: boolean;
  filterByTool?: string[];
  filterBySource?: TrainingExample['metadata']['source'][];
}

/**
 * Default export configuration
 */
export const DEFAULT_EXPORT_CONFIG: TrainingExportConfig = {
  format: 'generic',
  includeSystemPrompt: true,
  maxPromptLength: 8000,
  maxCompletionLength: 4000,
  includeMetadata: true,
};

/**
 * Training Data Exporter
 */
export class TrainingDataExporter {
  private config: TrainingExportConfig;
  private redactor: Redactor;

  constructor(config: Partial<TrainingExportConfig> = {}) {
    this.config = { ...DEFAULT_EXPORT_CONFIG, ...config };
    this.redactor = this.config.redactor || createDefaultRedactor();
  }

  /**
   * Generate prompt/completion pairs from conversation history
   */
  generateFromConversations(
    messages: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
      timestamp?: Date | string;
      metadata?: Record<string, unknown>;
    }>
  ): TrainingExample[] {
    const examples: TrainingExample[] = [];
    let currentSystem = '';
    let currentPrompt = '';
    let promptMessages: typeof messages = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === 'system') {
        currentSystem = this.redactor.redact(msg.content).redacted;
        continue;
      }

      if (msg.role === 'user') {
        // Start accumulating prompt
        promptMessages.push(msg);
        currentPrompt = this.buildPrompt(promptMessages);
      } else if (msg.role === 'assistant' && currentPrompt) {
        // Create training example
        const completion = this.truncate(
          this.redactor.redact(msg.content).redacted,
          this.config.maxCompletionLength
        );

        const example: TrainingExample = {
          id: `conv_${Date.now()}_${i}`,
          timestamp: (msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp || Date.now())).toISOString(),
          prompt: this.truncate(currentPrompt, this.config.maxPromptLength),
          completion,
          metadata: {
            source: 'conversation',
            ...this.extractMetadata(msg.metadata),
          },
        };

        if (this.config.includeSystemPrompt && currentSystem) {
          example.system = currentSystem;
        }

        examples.push(example);

        // Reset for next pair
        promptMessages = [];
        currentPrompt = '';
      }
    }

    return this.filterExamples(examples);
  }

  /**
   * Extract tool use examples from events
   */
  extractToolUseExamples(
    events: Array<{
      type: string;
      timestamp?: Date | string;
      data: unknown;
      sessionId?: string;
    }>
  ): ToolUseExample[] {
    const examples: ToolUseExample[] = [];
    const toolCalls = new Map<string, Record<string, unknown> & { timestamp?: Date | string }>();

    for (const event of events) {
      if (event.type === 'tool_call') {
        const eventData = this.asRecord(event.data) || {};
        const key = String(eventData.callId || eventData.id);
        toolCalls.set(key, {
          ...eventData,
          timestamp: event.timestamp,
        });
      } else if (event.type === 'tool_result') {
        const eventData = this.asRecord(event.data) || {};
        const callId = String(eventData.callId || eventData.id);
        const call = toolCalls.get(callId);

        if (call) {
          examples.push({
            id: `tool_${Date.now()}_${examples.length}`,
            timestamp: (event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp || Date.now())).toISOString(),
            toolName: this.redactor.redact(String(call.toolName || call.name || 'unknown')).redacted,
            toolInput: this.redactor.redactObject((this.asRecord(call.input) || this.asRecord(call.args) || {})),
            toolOutput: this.redactor.redact(String(eventData.output || eventData.result || '')).redacted,
            context: this.redactor.redact(String(call.context || '')).redacted,
            success: eventData.success !== false && !eventData.error,
          });

          toolCalls.delete(callId);
        }
      }
    }

    return examples;
  }

  /**
   * Extract error recovery patterns
   */
  extractErrorRecoveryPatterns(
    events: Array<{
      type: string;
      timestamp?: Date | string;
      data: unknown;
      sessionId?: string;
    }>
  ): ErrorRecoveryExample[] {
    const examples: ErrorRecoveryExample[] = [];
    let currentError: { event: typeof events[0]; index: number } | null = null;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      if (event.type === 'tool_error' || event.type === 'error_occurred') {
        currentError = { event, index: i };
      } else if (currentError && (
        event.type === 'tool_call' ||
        event.type === 'assistant_message' ||
        event.type === 'checkpoint_created'
      )) {
        // Found a recovery action
        const errorEvent = currentError.event;
        const errorData = this.asRecord(errorEvent.data) || {};
        const eventData = this.asRecord(event.data) || {};

        examples.push({
          id: `recovery_${Date.now()}_${examples.length}`,
          timestamp: (event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp || Date.now())).toISOString(),
          errorType: String(errorData.type || errorData.errorType || 'unknown'),
          errorMessage: this.redactor.redact(String(errorData.message || errorData.error || '')).redacted,
          recoveryAction: event.type,
          recoverySuccess: this.checkRecoverySuccess(events.slice(i, i + 5)),
          context: this.redactor.redact(this.buildErrorContext(events, currentError.index)).redacted,
          resolution: event.type === 'assistant_message'
            ? this.redactor.redact(String(eventData.content || '')).redacted
            : undefined,
        });

        currentError = null;
      }
    }

    return examples;
  }

  /**
   * Extract file change examples with before/after states
   */
  extractFileChangeExamples(
    checkpoints: Array<{
      id: string;
      timestamp?: Date | string;
      description: string;
      files: Array<{
        path: string;
        hash: string;
        content?: string;
      }>;
      trigger?: {
        action?: string;
      };
    }>,
    getFileContent?: (checkpointId: string, filePath: string) => string | null
  ): FileChangeExample[] {
    const examples: FileChangeExample[] = [];

    for (let i = 1; i < checkpoints.length; i++) {
      const before = checkpoints[i - 1];
      const after = checkpoints[i];

      const beforeFiles = new Map(before.files.map(f => [f.path, f]));
      const afterFiles = new Map(after.files.map(f => [f.path, f]));

      // Find modified files
      for (const [filePath, afterFile] of afterFiles) {
        const beforeFile = beforeFiles.get(filePath);

        if (!beforeFile) {
          // New file
          examples.push({
            id: `file_${Date.now()}_${examples.length}`,
            timestamp: (after.timestamp instanceof Date ? after.timestamp : new Date(after.timestamp || Date.now())).toISOString(),
            filePath: this.redactor.redactPath(filePath),
            action: 'create',
            afterContent: this.getAndRedactContent(getFileContent, after.id, filePath, afterFile.content),
            prompt: this.redactor.redact(after.description).redacted,
          });
        } else if (beforeFile.hash !== afterFile.hash) {
          // Modified file
          examples.push({
            id: `file_${Date.now()}_${examples.length}`,
            timestamp: (after.timestamp instanceof Date ? after.timestamp : new Date(after.timestamp || Date.now())).toISOString(),
            filePath: this.redactor.redactPath(filePath),
            action: 'modify',
            beforeContent: this.getAndRedactContent(getFileContent, before.id, filePath, beforeFile.content),
            afterContent: this.getAndRedactContent(getFileContent, after.id, filePath, afterFile.content),
            prompt: this.redactor.redact(after.description).redacted,
          });
        }
      }

      // Find deleted files
      for (const [filePath, beforeFile] of beforeFiles) {
        if (!afterFiles.has(filePath)) {
          examples.push({
            id: `file_${Date.now()}_${examples.length}`,
            timestamp: (after.timestamp instanceof Date ? after.timestamp : new Date(after.timestamp || Date.now())).toISOString(),
            filePath: this.redactor.redactPath(filePath),
            action: 'delete',
            beforeContent: this.getAndRedactContent(getFileContent, before.id, filePath, beforeFile.content),
            prompt: this.redactor.redact(after.description).redacted,
          });
        }
      }
    }

    return examples;
  }

  /**
   * Convert training examples to JSONL format
   */
  toJSONL(examples: TrainingExample[]): string {
    return examples.map(ex => {
      const formatted = this.formatForOutput(ex);
      return JSON.stringify(formatted);
    }).join('\n');
  }

  /**
   * Write training data to file
   */
  writeToFile(examples: TrainingExample[], outputPath: string): void {
    const jsonl = this.toJSONL(examples);
    fs.writeFileSync(outputPath, jsonl, 'utf-8');
  }

  /**
   * Write tool use examples to file
   */
  writeToolExamples(examples: ToolUseExample[], outputPath: string): void {
    const jsonl = examples.map(ex => JSON.stringify(ex)).join('\n');
    fs.writeFileSync(outputPath, jsonl, 'utf-8');
  }

  /**
   * Write error recovery examples to file
   */
  writeErrorRecoveryExamples(examples: ErrorRecoveryExample[], outputPath: string): void {
    const jsonl = examples.map(ex => JSON.stringify(ex)).join('\n');
    fs.writeFileSync(outputPath, jsonl, 'utf-8');
  }

  /**
   * Write file change examples to file
   */
  writeFileChangeExamples(examples: FileChangeExample[], outputPath: string): void {
    const jsonl = examples.map(ex => JSON.stringify(ex)).join('\n');
    fs.writeFileSync(outputPath, jsonl, 'utf-8');
  }

  // Private helper methods

  private buildPrompt(messages: Array<{ role: string; content: string }>): string {
    return messages
      .map(m => this.redactor.redact(m.content).redacted)
      .join('\n\n');
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  }

  private extractMetadata(metadata?: Record<string, unknown>): Partial<TrainingExample['metadata']> {
    if (!metadata) return {};

    return {
      tool: typeof metadata.tool === 'string' ? metadata.tool : undefined,
      action: typeof metadata.action === 'string' ? metadata.action : undefined,
      files: Array.isArray(metadata.files) ? metadata.files.filter((v): v is string => typeof v === 'string') : undefined,
      success: typeof metadata.success === 'boolean' ? metadata.success : undefined,
      tags: Array.isArray(metadata.tags) ? metadata.tags.filter((v): v is string => typeof v === 'string') : undefined,
    };
  }

  private filterExamples(examples: TrainingExample[]): TrainingExample[] {
    let filtered = examples;

    if (this.config.filterBySuccess !== undefined) {
      filtered = filtered.filter(ex => ex.metadata.success === this.config.filterBySuccess);
    }

    if (this.config.filterByTool?.length) {
      filtered = filtered.filter(ex =>
        ex.metadata.tool && this.config.filterByTool!.includes(ex.metadata.tool)
      );
    }

    if (this.config.filterBySource?.length) {
      filtered = filtered.filter(ex =>
        this.config.filterBySource!.includes(ex.metadata.source)
      );
    }

    return filtered;
  }

  private formatForOutput(example: TrainingExample): Record<string, unknown> {
    switch (this.config.format) {
      case 'openai':
        return this.formatOpenAI(example);
      case 'anthropic':
        return this.formatAnthropic(example);
      default:
        return this.formatGeneric(example);
    }
  }

  private formatOpenAI(example: TrainingExample): Record<string, unknown> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    if (example.system) {
      messages.push({ role: 'system', content: example.system });
    }

    messages.push({ role: 'user', content: example.prompt });
    messages.push({ role: 'assistant', content: example.completion });

    return { messages };
  }

  private formatAnthropic(example: TrainingExample): Record<string, unknown> {
    return {
      prompt: `${example.system ? example.system + '\n\n' : ''}Human: ${example.prompt}\n\nAssistant:`,
      completion: ` ${example.completion}`,
    };
  }

  private formatGeneric(example: TrainingExample): Record<string, unknown> {
    const output: Record<string, unknown> = {
      prompt: example.prompt,
      completion: example.completion,
    };

    if (example.system) {
      output.system = example.system;
    }

    if (this.config.includeMetadata) {
      output.metadata = example.metadata;
      output.id = example.id;
      output.timestamp = example.timestamp;
    }

    return output;
  }

  private checkRecoverySuccess(events: Array<{ type: string; data: unknown }>): boolean {
    // Check if any of the following events indicate success
    for (const event of events) {
      if (event.type === 'tool_error' || event.type === 'error_occurred') {
        return false; // Another error occurred
      }
      const data = this.asRecord(event.data);
      const trigger = this.asRecord(data?.trigger);
      if (event.type === 'checkpoint_created' && trigger?.status === 'after_success') {
        return true;
      }
    }
    return true; // Assume success if no more errors
  }

  private buildErrorContext(events: Array<{ type: string; data: unknown }>, errorIndex: number): string {
    const contextStart = Math.max(0, errorIndex - 3);
    const contextEnd = errorIndex;

    return events.slice(contextStart, contextEnd)
      .map(e => `${e.type}: ${JSON.stringify(e.data).slice(0, 200)}`)
      .join('\n');
  }

  private getAndRedactContent(
    getFileContent: ((checkpointId: string, filePath: string) => string | null) | undefined,
    checkpointId: string,
    filePath: string,
    inlineContent?: string
  ): string | undefined {
    let content = inlineContent;

    if (!content && getFileContent) {
      content = getFileContent(checkpointId, filePath) || undefined;
    }

    if (content) {
      return this.redactor.redact(content).redacted;
    }

    return undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null;
    return value as Record<string, unknown>;
  }
}

/**
 * Create a training data exporter with default settings
 */
export function createTrainingExporter(config?: Partial<TrainingExportConfig>): TrainingDataExporter {
  return new TrainingDataExporter(config);
}

/**
 * Quick utility to export conversations to JSONL
 */
export function exportConversationsToJSONL(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  outputPath: string,
  format: TrainingFormat = 'generic'
): void {
  assertLicenseCompliance(process.cwd(), 'dataset_export');
  assertConsent(process.cwd(), 'export_training', {
    source: 'export.training-data.exportConversationsToJSONL',
    resource: outputPath,
  });
  const trace = beginExportTrace({
    projectPath: process.cwd(),
    action: 'export_training',
    source: 'export.training-data.exportConversationsToJSONL',
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
  } catch (error) {
    completeExportTrace(trace, {
      success: false,
      error,
    });
    throw error;
  }
}
