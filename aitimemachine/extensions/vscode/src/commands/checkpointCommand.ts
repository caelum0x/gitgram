/**
 * /checkpoint command - Manage and revert to checkpoints
 */

import {
  Command,
  CommandContext,
  ArgumentProviderContext,
  ArgumentSuggestion,
  generateMessage,
  formatRelativeTime,
} from './types';
import { execSync } from 'child_process';
import * as vscode from 'vscode';

/**
 * Get checkpoint suggestions for autocomplete
 */
async function provideCheckpointIds(context: ArgumentProviderContext): Promise<ArgumentSuggestion[]> {
  const checkpoints = context.commandContext?.checkpoints || [];

  if (checkpoints.length === 0) {
    return [{
      value: '',
      title: 'No checkpoints available',
      description: 'Create a checkpoint first',
      matchScore: 0,
      highlightedValue: '',
      loading: false,
    }];
  }

  return checkpoints.map((cp, index) => {
    const time = formatRelativeTime(cp.timestamp);
    const typeLabel = cp.type === 'auto' ? ' [auto]' : '';

    return {
      value: cp.id,
      title: `${cp.id} - ${time}${typeLabel}`,
      description: cp.description || 'No description',
      matchScore: 100 - index,
      highlightedValue: cp.id,
    };
  });
}

/**
 * Subcommand autocomplete
 */
async function provideSubcommands(context: ArgumentProviderContext): Promise<ArgumentSuggestion[]> {
  const subcommands = [
    { value: 'list', description: 'List all available checkpoints' },
    { value: 'restore', description: 'Revert to a checkpoint' },
    { value: 'create', description: 'Create a new checkpoint' },
    { value: 'diff', description: 'Show changes since checkpoint' },
    { value: 'preview', description: 'Preview what restore would change' },
  ];

  const query = context.partialInput.toLowerCase();

  return subcommands
    .map(cmd => {
      let matchScore = 0;
      if (!query) matchScore = 100;
      else if (cmd.value === query) matchScore = 100;
      else if (cmd.value.startsWith(query)) matchScore = 90;
      else if (cmd.value.includes(query)) matchScore = 70;

      return {
        value: cmd.value,
        title: cmd.value,
        description: cmd.description,
        matchScore,
        highlightedValue: cmd.value,
      };
    })
    .filter(s => s.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * List all checkpoints
 */
async function handleList(context: CommandContext): Promise<void> {
  const { addMessage, checkpoints } = context;

  if (checkpoints.length === 0) {
    addMessage({
      ...generateMessage(),
      type: 'system',
      content: 'No checkpoints available. Create one with `/checkpoint create <name>`',
    } as any);
    return;
  }

  const lines = ['**Available Checkpoints:**', ''];

  checkpoints.forEach((cp, index) => {
    const time = formatRelativeTime(cp.timestamp);
    const typeLabel = cp.type === 'auto' ? ' [auto]' : '';
    const statsLabel = cp.stats ? ` (${cp.stats.totalFiles} files)` : '';

    lines.push(`${index + 1}. **${cp.description || 'Unnamed'}**${typeLabel}${statsLabel}`);
    lines.push(`   ID: \`${cp.id}\` | ${time}`);
    lines.push('');
  });

  lines.push('Use `/checkpoint restore <id>` to revert to a checkpoint.');

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: lines.join('\n'),
  } as any);
}

/**
 * Create a new checkpoint
 */
async function handleCreate(context: CommandContext, name: string): Promise<void> {
  const { addMessage } = context;

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'No workspace folder open.',
    } as any);
    return;
  }

  try {
    const checkpointName = name || `Checkpoint ${new Date().toLocaleString()}`;
    const output = execSync(`aitm checkpoint "${checkpointName}" --json`, {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });

    const result = JSON.parse(output);

    addMessage({
      ...generateMessage(),
      type: 'system',
      content: `Checkpoint created: **${checkpointName}**\nID: \`${result.checkpointId || result.id}\``,
    } as any);
  } catch (error: any) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Failed to create checkpoint: ${error.message}`,
    } as any);
  }
}

/**
 * Restore to a checkpoint
 */
async function handleRestore(context: CommandContext, checkpointId: string): Promise<void> {
  const { addMessage, checkpoints } = context;

  const checkpoint = checkpoints.find(cp => cp.id === checkpointId || cp.id.startsWith(checkpointId));

  if (!checkpoint) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Checkpoint "${checkpointId}" not found. Use /checkpoint list to see available checkpoints.`,
    } as any);
    return;
  }

  // Confirm with user
  const confirm = await vscode.window.showWarningMessage(
    `Restore to checkpoint "${checkpoint.description || checkpoint.id}"? This will revert all files.`,
    { modal: true },
    'Restore'
  );

  if (!confirm) {
    addMessage({
      ...generateMessage(),
      type: 'system',
      content: 'Restore cancelled.',
    } as any);
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'No workspace folder open.',
    } as any);
    return;
  }

  try {
    execSync(`aitm restore ${checkpoint.id}`, {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });

    addMessage({
      ...generateMessage(),
      type: 'system',
      content: `Restored to checkpoint: **${checkpoint.description || checkpoint.id}**`,
    } as any);

    // Reload window to refresh files
    vscode.commands.executeCommand('workbench.action.reloadWindow');
  } catch (error: any) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Failed to restore: ${error.message}`,
    } as any);
  }
}

/**
 * Show diff since checkpoint
 */
async function handleDiff(context: CommandContext, checkpointId: string): Promise<void> {
  const { addMessage, checkpoints } = context;

  const checkpoint = checkpoints.find(cp => cp.id === checkpointId || cp.id.startsWith(checkpointId));

  if (!checkpoint) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Checkpoint "${checkpointId}" not found.`,
    } as any);
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  try {
    const output = execSync(`aitm diff ${checkpoint.id} --json`, {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });

    const diff = JSON.parse(output);
    const lines = [`**Changes since checkpoint ${checkpoint.id}:**`, ''];

    if (diff.added?.length) {
      lines.push(`**Added (${diff.added.length}):**`);
      diff.added.slice(0, 10).forEach((f: string) => lines.push(`  + ${f}`));
      if (diff.added.length > 10) lines.push(`  ... and ${diff.added.length - 10} more`);
      lines.push('');
    }

    if (diff.modified?.length) {
      lines.push(`**Modified (${diff.modified.length}):**`);
      diff.modified.slice(0, 10).forEach((f: string) => lines.push(`  ~ ${f}`));
      if (diff.modified.length > 10) lines.push(`  ... and ${diff.modified.length - 10} more`);
      lines.push('');
    }

    if (diff.deleted?.length) {
      lines.push(`**Deleted (${diff.deleted.length}):**`);
      diff.deleted.slice(0, 10).forEach((f: string) => lines.push(`  - ${f}`));
      if (diff.deleted.length > 10) lines.push(`  ... and ${diff.deleted.length - 10} more`);
      lines.push('');
    }

    if (!diff.added?.length && !diff.modified?.length && !diff.deleted?.length) {
      lines.push('No changes detected.');
    }

    addMessage({
      ...generateMessage(),
      type: 'system',
      content: lines.join('\n'),
    } as any);
  } catch (error: any) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Failed to get diff: ${error.message}`,
    } as any);
  }
}

/**
 * Preview what restore would change
 */
async function handlePreview(context: CommandContext, checkpointId: string): Promise<void> {
  const { addMessage, checkpoints } = context;

  const checkpoint = checkpoints.find(cp => cp.id === checkpointId || cp.id.startsWith(checkpointId));

  if (!checkpoint) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Checkpoint "${checkpointId}" not found.`,
    } as any);
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  try {
    const output = execSync(`aitm checkpoint-preview ${checkpoint.id} --json`, {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });

    const preview = JSON.parse(output);

    addMessage({
      ...generateMessage(),
      type: 'system',
      content: `**Preview restore to ${checkpoint.id}:**\n\n${preview.summary || 'Would restore files to checkpoint state.'}`,
    } as any);
  } catch {
    // Fallback to diff
    await handleDiff(context, checkpointId);
  }
}

export const checkpointCommand: Command = {
  name: 'checkpoint',
  aliases: ['cp'],
  description: 'Manage and revert to saved checkpoints',
  usage: '/checkpoint <list|create|restore|diff|preview> [args]',
  examples: [
    '/checkpoint list',
    '/checkpoint create "Before refactor"',
    '/checkpoint restore cp_abc123',
    '/checkpoint diff cp_abc123',
  ],
  category: 'chat',
  priority: 9,
  arguments: [
    {
      name: 'subcommand',
      description: 'The action to perform',
      required: false,
      provider: provideSubcommands,
    },
    {
      name: 'argument',
      description: 'Checkpoint ID or name',
      required: false,
      conditionalProviders: [
        {
          condition: (ctx) => {
            const sub = ctx.getArgument('subcommand');
            return sub === 'restore' || sub === 'diff' || sub === 'preview';
          },
          provider: provideCheckpointIds,
        },
      ],
    },
  ],
  handler: async (context) => {
    const { args, addMessage } = context;

    if (args.length === 0) {
      // Show help
      addMessage({
        ...generateMessage(),
        type: 'system',
        content: [
          '**Checkpoint Management**',
          '',
          '**Usage:** /checkpoint <command> [args]',
          '',
          '**Commands:**',
          '  list              List all available checkpoints',
          '  create <name>     Create a new checkpoint',
          '  restore <id>      Revert to a checkpoint',
          '  diff <id>         Show changes since checkpoint',
          '  preview <id>      Preview what restore would change',
          '',
          '**Examples:**',
          '  /checkpoint list',
          '  /checkpoint create "Before refactor"',
          '  /checkpoint restore cp_abc123',
        ].join('\n'),
      } as any);
      return;
    }

    const subcommand = args[0].toLowerCase();
    const arg = args.slice(1).join(' ');

    switch (subcommand) {
      case 'list':
        await handleList(context);
        break;
      case 'create':
        await handleCreate(context, arg);
        break;
      case 'restore':
        if (!arg) {
          addMessage({
            ...generateMessage(),
            type: 'error',
            content: 'Checkpoint ID required. Usage: /checkpoint restore <id>',
          } as any);
          return;
        }
        await handleRestore(context, arg);
        break;
      case 'diff':
        if (!arg) {
          addMessage({
            ...generateMessage(),
            type: 'error',
            content: 'Checkpoint ID required. Usage: /checkpoint diff <id>',
          } as any);
          return;
        }
        await handleDiff(context, arg);
        break;
      case 'preview':
        if (!arg) {
          addMessage({
            ...generateMessage(),
            type: 'error',
            content: 'Checkpoint ID required. Usage: /checkpoint preview <id>',
          } as any);
          return;
        }
        await handlePreview(context, arg);
        break;
      default:
        addMessage({
          ...generateMessage(),
          type: 'error',
          content: `Unknown command "${subcommand}". Available: list, create, restore, diff, preview`,
        } as any);
    }
  },
};
