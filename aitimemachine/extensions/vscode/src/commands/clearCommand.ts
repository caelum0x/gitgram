/**
 * /clear command - Clear the current conversation
 */

import {
  Command,
  CommandContext,
  generateMessage,
} from './types';
import * as vscode from 'vscode';

export const clearCommand: Command = {
  name: 'clear',
  aliases: ['cls', 'reset'],
  description: 'Clear the current conversation',
  usage: '/clear [--keep-context]',
  examples: [
    '/clear',
    '/clear --keep-context',
  ],
  category: 'chat',
  priority: 6,
  arguments: [
    {
      name: 'option',
      description: 'Clear option',
      required: false,
      values: [
        { value: '--keep-context', description: 'Clear messages but keep context' },
        { value: '--all', description: 'Clear everything including context' },
      ],
    },
  ],
  handler: async (context) => {
    const { args, replaceMessages, sendWebviewMessage, addMessage } = context;

    const keepContext = args.includes('--keep-context');

    // Confirm if there are messages
    if (context.chatMessages.length > 2) {
      const confirm = await vscode.window.showWarningMessage(
        `Clear ${context.chatMessages.length} messages?`,
        { modal: false },
        'Clear'
      );

      if (!confirm) {
        return;
      }
    }

    // Clear messages
    replaceMessages([]);

    // Notify webview
    await sendWebviewMessage({
      type: 'clearChat',
      keepContext,
    });

    // Show confirmation
    addMessage({
      ...generateMessage(),
      type: 'system',
      content: keepContext
        ? 'Conversation cleared. Context preserved.'
        : 'Conversation cleared.',
    } as any);
  },
};
