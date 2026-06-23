/**
 * Command System Types - Kilocode-inspired command architecture
 */

import * as vscode from 'vscode';

export interface CommandMessage {
  id: string;
  type: 'system' | 'error' | 'user' | 'assistant' | 'empty';
  content: string;
  ts: number;
}

export interface ArgumentSuggestion {
  value: string;
  title?: string;
  description?: string;
  matchScore: number;
  highlightedValue?: string;
  loading?: boolean;
}

export interface ArgumentProviderContext {
  partialInput: string;
  commandContext?: CommandContext;
  getArgument: (name: string) => string | undefined;
}

export interface ArgumentDefinition {
  name: string;
  description: string;
  required: boolean;
  values?: { value: string; description: string }[];
  provider?: (context: ArgumentProviderContext) => Promise<ArgumentSuggestion[]>;
  conditionalProviders?: {
    condition: (context: ArgumentProviderContext) => boolean;
    provider: (context: ArgumentProviderContext) => Promise<ArgumentSuggestion[]>;
  }[];
}

export interface CommandContext {
  args: string[];
  chatMessages: CommandMessage[];
  addMessage: (message: CommandMessage) => void;
  replaceMessages: (messages: CommandMessage[]) => void;
  refreshTerminal: () => Promise<void>;
  sendWebviewMessage: (message: any) => Promise<void>;

  // Session data
  currentSessionId?: string;

  // Task history data
  taskHistoryData?: TaskHistoryData;
  taskHistoryLoading?: boolean;
  taskHistoryError?: string;
  fetchTaskHistory: () => Promise<void>;
  updateTaskHistoryFilters: (filters: Partial<TaskHistoryFilters>) => Promise<TaskHistoryData>;
  changeTaskHistoryPage: (page: number) => Promise<TaskHistoryData>;
  nextTaskHistoryPage: () => Promise<TaskHistoryData>;
  previousTaskHistoryPage: () => Promise<TaskHistoryData>;

  // Checkpoints
  checkpoints: CheckpointInfo[];

  // Configuration
  config: AitmConfig;
}

export interface Command {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  examples: string[];
  category: 'chat' | 'system' | 'navigation' | 'config' | 'admin';
  priority: number;
  arguments: ArgumentDefinition[];
  handler: (context: CommandContext) => Promise<void>;
}

export interface CheckpointInfo {
  id: string;
  hash?: string;
  description: string;
  timestamp: number;
  type?: 'manual' | 'auto' | 'before' | 'after';
  stats?: {
    totalFiles: number;
    totalSize: number;
  };
}

export interface TaskHistoryItem {
  id: string;
  task: string;
  ts: number;
  totalCost: number;
  tokensIn: number;
  tokensOut: number;
  isFavorited: boolean;
}

export interface TaskHistoryData {
  historyItems: TaskHistoryItem[];
  pageIndex: number;
  pageCount: number;
  totalItems: number;
}

export interface TaskHistoryFilters {
  search?: string;
  sort?: 'newest' | 'oldest' | 'mostExpensive' | 'mostTokens' | 'mostRelevant';
  workspace?: 'current' | 'all';
  favoritesOnly?: boolean;
}

export interface SessionInfo {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AitmConfig {
  autoCheckpoint: boolean;
  checkpointOnSave: boolean;
  cloudSync: boolean;
  showCodeLens: boolean;
  showFunctionLens: boolean;
  showErrorTracking: boolean;
  maxConversationHistory: number;

  // Auto-approval settings
  autoApproval: AutoApprovalConfig;

  // Mode settings
  currentMode: string;
  customModes: ModeConfig[];
}

export interface AutoApprovalConfig {
  read: { enabled: boolean; outside: boolean };
  write: { enabled: boolean; outside: boolean; protected: boolean };
  execute: { allowed: string[]; denied: string[] };
  browser: { enabled: boolean };
  mcp: { enabled: boolean };
  mode: { enabled: boolean };
  subtasks: { enabled: boolean };
  retry: { enabled: boolean; delay: number };
}

export interface ModeConfig {
  id: string;
  name: string;
  description: string;
  icon?: string;
  source: 'global' | 'project';
}

// Generate a unique message
export function generateMessage(): Partial<CommandMessage> {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    ts: Date.now(),
  };
}

// Format relative time
export function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diffMs = now - ts;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  const date = new Date(ts);
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Format cost
export function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return '<$0.01';
  return `$${cost.toFixed(2)}`;
}

// Format tokens
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
}

// Truncate text
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
