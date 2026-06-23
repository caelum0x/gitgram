/**
 * NewTask Command - Create a new task/conversation thread
 */

import { Command, CommandContext, generateMessage } from './types';

export const newtaskCommand: Command = {
  name: 'newtask',
  aliases: ['nt', 'task'],
  description: 'Create a new task with a fresh context',
  usage: '/newtask [title]',
  category: 'chat',
  priority: 70,
  arguments: [
    {
      name: 'title',
      description: 'Task title',
      required: false,
    },
  ],
  examples: [
    '/newtask "Implement user authentication"',
    '/newtask "Fix login redirect"',
    '/newtask "Continue refactoring"',
  ],

  handler: async (context: CommandContext): Promise<void> => {
    const { args, addMessage } = context;

    const title = args.join(' ') || `Task ${new Date().toLocaleString()}`;

    // Create new task
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Build response
    const lines: string[] = [
      `## New Task Created`,
      '',
      `**Title:** ${title}`,
      `**ID:** \`${taskId}\``,
      `**Created:** ${new Date().toLocaleString()}`,
      '',
      '---',
      '',
      '*Ready to start! Describe what you want to accomplish.*',
    ];

    addMessage({
      ...generateMessage(),
      id: generateMessage().id!,
      ts: generateMessage().ts!,
      type: 'system',
      content: lines.join('\n'),
    });
  },
};
