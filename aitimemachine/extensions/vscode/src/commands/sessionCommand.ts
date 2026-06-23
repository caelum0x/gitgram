/**
 * /session command - Manage sessions and conversation history
 */

import {
  Command,
  CommandContext,
  ArgumentProviderContext,
  ArgumentSuggestion,
  generateMessage,
  formatRelativeTime,
  SessionInfo,
} from './types';
import { execSync } from 'child_process';
import * as vscode from 'vscode';

/**
 * Get session suggestions for autocomplete
 */
async function provideSessionIds(context: ArgumentProviderContext): Promise<ArgumentSuggestion[]> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return [];
  }

  try {
    const output = execSync('aitm sessions --json', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });

    const sessions: SessionInfo[] = JSON.parse(output);
    const query = context.partialInput.toLowerCase();

    return sessions
      .map((session, index) => {
        const time = formatRelativeTime(new Date(session.created_at).getTime());
        let matchScore = 0;

        if (!query) {
          matchScore = 100 - index;
        } else if (session.session_id === query) {
          matchScore = 100;
        } else if (session.session_id.startsWith(query)) {
          matchScore = 90;
        } else if (session.title.toLowerCase().includes(query)) {
          matchScore = 80;
        } else if (session.session_id.includes(query)) {
          matchScore = 70;
        }

        return {
          value: session.session_id,
          title: `${session.session_id} - ${time}`,
          description: session.title || 'No title',
          matchScore,
          highlightedValue: session.session_id,
        };
      })
      .filter(s => s.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore);
  } catch {
    return [];
  }
}

/**
 * Subcommand autocomplete
 */
async function provideSubcommands(context: ArgumentProviderContext): Promise<ArgumentSuggestion[]> {
  const subcommands = [
    { value: 'show', description: 'Show current session info' },
    { value: 'list', description: 'List all sessions' },
    { value: 'search', description: 'Search sessions by content' },
    { value: 'select', description: 'Switch to a different session' },
    { value: 'new', description: 'Start a new session' },
    { value: 'rename', description: 'Rename current session' },
    { value: 'delete', description: 'Delete a session' },
    { value: 'export', description: 'Export session to file' },
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
 * Show current session info
 */
async function handleShow(context: CommandContext): Promise<void> {
  const { addMessage, currentSessionId } = context;

  if (!currentSessionId) {
    addMessage({
      ...generateMessage(),
      type: 'system',
      content: 'No active session. Start a new one with `/session new`',
    } as any);
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  try {
    const output = execSync(`aitm session ${currentSessionId} --json`, {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });

    const session = JSON.parse(output);
    const created = formatRelativeTime(new Date(session.created_at).getTime());
    const updated = formatRelativeTime(new Date(session.updated_at).getTime());

    addMessage({
      ...generateMessage(),
      type: 'system',
      content: [
        '**Current Session**',
        '',
        `**ID:** \`${session.session_id}\``,
        `**Title:** ${session.title || 'Untitled'}`,
        `**Created:** ${created}`,
        `**Last Updated:** ${updated}`,
        session.message_count ? `**Messages:** ${session.message_count}` : '',
      ].filter(Boolean).join('\n'),
    } as any);
  } catch (error: any) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Failed to get session info: ${error.message}`,
    } as any);
  }
}

/**
 * List all sessions
 */
async function handleList(context: CommandContext): Promise<void> {
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
    const output = execSync('aitm sessions --json', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });

    const sessions: SessionInfo[] = JSON.parse(output);

    if (sessions.length === 0) {
      addMessage({
        ...generateMessage(),
        type: 'system',
        content: 'No sessions found. Start a new one with `/session new`',
      } as any);
      return;
    }

    const lines = ['**Sessions:**', ''];

    sessions.slice(0, 10).forEach((session, index) => {
      const time = formatRelativeTime(new Date(session.created_at).getTime());
      lines.push(`${index + 1}. **${session.title || 'Untitled'}**`);
      lines.push(`   ID: \`${session.session_id}\` | ${time}`);
      lines.push('');
    });

    if (sessions.length > 10) {
      lines.push(`... and ${sessions.length - 10} more sessions`);
    }

    lines.push('Use `/session select <id>` to switch sessions.');

    addMessage({
      ...generateMessage(),
      type: 'system',
      content: lines.join('\n'),
    } as any);
  } catch (error: any) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Failed to list sessions: ${error.message}`,
    } as any);
  }
}

/**
 * Search sessions
 */
async function handleSearch(context: CommandContext, query: string): Promise<void> {
  const { addMessage } = context;

  if (!query) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'Search query required. Usage: /session search <query>',
    } as any);
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  try {
    const output = execSync(`aitm sessions --search "${query}" --json`, {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });

    const sessions: SessionInfo[] = JSON.parse(output);

    if (sessions.length === 0) {
      addMessage({
        ...generateMessage(),
        type: 'system',
        content: `No sessions found matching "${query}"`,
      } as any);
      return;
    }

    const lines = [`**Sessions matching "${query}":**`, ''];

    sessions.slice(0, 10).forEach((session, index) => {
      const time = formatRelativeTime(new Date(session.created_at).getTime());
      lines.push(`${index + 1}. **${session.title || 'Untitled'}**`);
      lines.push(`   ID: \`${session.session_id}\` | ${time}`);
      lines.push('');
    });

    addMessage({
      ...generateMessage(),
      type: 'system',
      content: lines.join('\n'),
    } as any);
  } catch (error: any) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Search failed: ${error.message}`,
    } as any);
  }
}

/**
 * Select/switch to a session
 */
async function handleSelect(context: CommandContext, sessionId: string): Promise<void> {
  const { addMessage, sendWebviewMessage } = context;

  if (!sessionId) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'Session ID required. Usage: /session select <id>',
    } as any);
    return;
  }

  try {
    // Notify webview to switch session
    await sendWebviewMessage({
      type: 'switchSession',
      sessionId,
    });

    addMessage({
      ...generateMessage(),
      type: 'system',
      content: `Switched to session \`${sessionId}\``,
    } as any);
  } catch (error: any) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Failed to switch session: ${error.message}`,
    } as any);
  }
}

/**
 * Create new session
 */
async function handleNew(context: CommandContext, title?: string): Promise<void> {
  const { addMessage, sendWebviewMessage } = context;

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
    const titleArg = title ? `--title "${title}"` : '';
    const output = execSync(`aitm session new ${titleArg} --json`, {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });

    const session = JSON.parse(output);

    // Notify webview
    await sendWebviewMessage({
      type: 'newSession',
      sessionId: session.session_id,
    });

    addMessage({
      ...generateMessage(),
      type: 'system',
      content: `New session created: \`${session.session_id}\``,
    } as any);
  } catch (error: any) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Failed to create session: ${error.message}`,
    } as any);
  }
}

/**
 * Rename session
 */
async function handleRename(context: CommandContext, newTitle: string): Promise<void> {
  const { addMessage, currentSessionId } = context;

  if (!currentSessionId) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'No active session to rename.',
    } as any);
    return;
  }

  if (!newTitle) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'New title required. Usage: /session rename <title>',
    } as any);
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  try {
    execSync(`aitm session rename ${currentSessionId} "${newTitle}"`, {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });

    addMessage({
      ...generateMessage(),
      type: 'system',
      content: `Session renamed to "${newTitle}"`,
    } as any);
  } catch (error: any) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Failed to rename session: ${error.message}`,
    } as any);
  }
}

/**
 * Delete a session
 */
async function handleDelete(context: CommandContext, sessionId: string): Promise<void> {
  const { addMessage, currentSessionId } = context;

  const targetId = sessionId || currentSessionId;

  if (!targetId) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'Session ID required. Usage: /session delete <id>',
    } as any);
    return;
  }

  // Confirm deletion
  const confirm = await vscode.window.showWarningMessage(
    `Delete session ${targetId}? This cannot be undone.`,
    { modal: true },
    'Delete'
  );

  if (!confirm) {
    addMessage({
      ...generateMessage(),
      type: 'system',
      content: 'Deletion cancelled.',
    } as any);
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  try {
    execSync(`aitm session delete ${targetId}`, {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });

    addMessage({
      ...generateMessage(),
      type: 'system',
      content: `Session \`${targetId}\` deleted.`,
    } as any);
  } catch (error: any) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Failed to delete session: ${error.message}`,
    } as any);
  }
}

/**
 * Export session
 */
async function handleExport(context: CommandContext, sessionId: string): Promise<void> {
  const { addMessage, currentSessionId } = context;

  const targetId = sessionId || currentSessionId;

  if (!targetId) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'Session ID required. Usage: /session export <id>',
    } as any);
    return;
  }

  const saveUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`session-${targetId}.json`),
    filters: {
      'JSON': ['json'],
      'Markdown': ['md'],
    },
  });

  if (!saveUri) {
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  try {
    const format = saveUri.fsPath.endsWith('.md') ? 'markdown' : 'json';
    const output = execSync(`aitm session export ${targetId} --format ${format}`, {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });

    const fs = require('fs');
    fs.writeFileSync(saveUri.fsPath, output);

    addMessage({
      ...generateMessage(),
      type: 'system',
      content: `Session exported to ${saveUri.fsPath}`,
    } as any);

    // Open the file
    vscode.window.showTextDocument(saveUri);
  } catch (error: any) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Export failed: ${error.message}`,
    } as any);
  }
}

export const sessionCommand: Command = {
  name: 'session',
  aliases: ['s'],
  description: 'Manage sessions and conversation history',
  usage: '/session <show|list|search|select|new|rename|delete|export> [args]',
  examples: [
    '/session show',
    '/session list',
    '/session search "authentication"',
    '/session select sess_abc123',
    '/session new "Feature Implementation"',
    '/session rename "Bug Fix Session"',
    '/session export sess_abc123',
  ],
  category: 'chat',
  priority: 8,
  arguments: [
    {
      name: 'subcommand',
      description: 'The action to perform',
      required: false,
      provider: provideSubcommands,
    },
    {
      name: 'argument',
      description: 'Session ID, title, or search query',
      required: false,
      conditionalProviders: [
        {
          condition: (ctx) => {
            const sub = ctx.getArgument('subcommand');
            return sub === 'select' || sub === 'delete' || sub === 'export';
          },
          provider: provideSessionIds,
        },
      ],
    },
  ],
  handler: async (context) => {
    const { args, addMessage } = context;

    if (args.length === 0) {
      // Default to show
      await handleShow(context);
      return;
    }

    const subcommand = args[0].toLowerCase();
    const arg = args.slice(1).join(' ');

    switch (subcommand) {
      case 'show':
        await handleShow(context);
        break;
      case 'list':
        await handleList(context);
        break;
      case 'search':
        await handleSearch(context, arg);
        break;
      case 'select':
        await handleSelect(context, arg);
        break;
      case 'new':
        await handleNew(context, arg);
        break;
      case 'rename':
        await handleRename(context, arg);
        break;
      case 'delete':
        await handleDelete(context, arg);
        break;
      case 'export':
        await handleExport(context, arg);
        break;
      default:
        addMessage({
          ...generateMessage(),
          type: 'error',
          content: `Unknown command "${subcommand}". Available: show, list, search, select, new, rename, delete, export`,
        } as any);
    }
  },
};
