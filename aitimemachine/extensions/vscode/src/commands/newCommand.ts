/**
 * /new command - Start a new session/conversation
 */

import {
  Command,
  CommandContext,
  generateMessage,
} from './types';
import { execSync } from 'child_process';
import * as vscode from 'vscode';

export const newCommand: Command = {
  name: 'new',
  aliases: ['n'],
  description: 'Start a new session/conversation',
  usage: '/new [title]',
  examples: [
    '/new',
    '/new "Feature Implementation"',
    '/new Bug Fix Session',
  ],
  category: 'chat',
  priority: 9,
  arguments: [
    {
      name: 'title',
      description: 'Optional title for the new session',
      required: false,
    },
  ],
  handler: async (context) => {
    const { args, addMessage, replaceMessages, sendWebviewMessage } = context;

    const title = args.join(' ') || undefined;

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
      // Create new session via CLI
      const titleArg = title ? `--title "${title}"` : '';
      const output = execSync(`aitm session new ${titleArg} --json`, {
        cwd: workspaceRoot,
        encoding: 'utf-8',
      });

      const session = JSON.parse(output);

      // Clear current messages
      replaceMessages([]);

      // Notify webview of new session
      await sendWebviewMessage({
        type: 'newSession',
        sessionId: session.session_id,
        title: title || session.title,
      });

      // Show welcome message
      addMessage({
        ...generateMessage(),
        type: 'system',
        content: [
          `**New Session Started**`,
          '',
          title ? `**Title:** ${title}` : '',
          `**ID:** \`${session.session_id}\``,
          '',
          'How can I help you today?',
        ].filter(Boolean).join('\n'),
      } as any);
    } catch (error: any) {
      addMessage({
        ...generateMessage(),
        type: 'error',
        content: `Failed to create new session: ${error.message}`,
      } as any);
    }
  },
};
