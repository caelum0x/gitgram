/**
 * /help command - Show available commands and usage information
 */

import {
  Command,
  CommandContext,
  ArgumentProviderContext,
  ArgumentSuggestion,
  generateMessage,
} from './types';
import { commandRegistry } from './CommandRegistry';

/**
 * Provide command names for autocomplete
 */
async function provideCommandNames(context: ArgumentProviderContext): Promise<ArgumentSuggestion[]> {
  const commands = commandRegistry.getAll();
  const query = context.partialInput.toLowerCase();

  return commands
    .map(cmd => {
      let matchScore = 0;

      if (!query) {
        matchScore = cmd.priority;
      } else if (cmd.name === query) {
        matchScore = 100;
      } else if (cmd.name.startsWith(query)) {
        matchScore = 90;
      } else if (cmd.name.includes(query)) {
        matchScore = 70;
      } else {
        // Check aliases
        for (const alias of cmd.aliases) {
          if (alias === query) {
            matchScore = 100;
            break;
          } else if (alias.startsWith(query)) {
            matchScore = 85;
            break;
          }
        }
      }

      return {
        value: cmd.name,
        title: `/${cmd.name}`,
        description: cmd.description,
        matchScore,
        highlightedValue: cmd.name,
      };
    })
    .filter(s => s.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);
}

export const helpCommand: Command = {
  name: 'help',
  aliases: ['h', '?'],
  description: 'Show available commands and usage information',
  usage: '/help [command]',
  examples: [
    '/help',
    '/help checkpoint',
    '/help session',
  ],
  category: 'system',
  priority: 10,
  arguments: [
    {
      name: 'command',
      description: 'Command to get help for',
      required: false,
      provider: provideCommandNames,
    },
  ],
  handler: async (context) => {
    const { args, addMessage } = context;

    if (args.length === 0) {
      // Show all commands
      addMessage({
        ...generateMessage(),
        type: 'system',
        content: commandRegistry.getHelpText(),
      } as any);
      return;
    }

    // Show help for specific command
    const commandName = args[0].toLowerCase().replace(/^\//, '');
    const helpText = commandRegistry.getCommandHelp(commandName);

    if (!helpText) {
      addMessage({
        ...generateMessage(),
        type: 'error',
        content: `Unknown command "/${commandName}". Type /help to see available commands.`,
      } as any);
      return;
    }

    addMessage({
      ...generateMessage(),
      type: 'system',
      content: helpText,
    } as any);
  },
};
