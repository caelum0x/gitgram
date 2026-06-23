/**
 * Command Registry - Manages all slash commands
 */

import {
  Command,
  CommandContext,
  ArgumentSuggestion,
  ArgumentProviderContext,
} from './types';

export class CommandRegistry {
  private static instance: CommandRegistry;
  private commands: Map<string, Command> = new Map();
  private aliases: Map<string, string> = new Map();

  private constructor() {}

  public static getInstance(): CommandRegistry {
    if (!CommandRegistry.instance) {
      CommandRegistry.instance = new CommandRegistry();
    }
    return CommandRegistry.instance;
  }

  /**
   * Register a command
   */
  public register(command: Command): void {
    this.commands.set(command.name, command);

    // Register aliases
    for (const alias of command.aliases) {
      this.aliases.set(alias, command.name);
    }
  }

  /**
   * Get a command by name or alias
   */
  public get(nameOrAlias: string): Command | undefined {
    const name = this.aliases.get(nameOrAlias) || nameOrAlias;
    return this.commands.get(name);
  }

  /**
   * Get all commands
   */
  public getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get commands by category
   */
  public getByCategory(category: Command['category']): Command[] {
    return this.getAll().filter(cmd => cmd.category === category);
  }

  /**
   * Get command suggestions for autocomplete
   */
  public getCommandSuggestions(partialInput: string): ArgumentSuggestion[] {
    const query = partialInput.toLowerCase().replace(/^\//, '');
    const suggestions: ArgumentSuggestion[] = [];

    for (const command of this.commands.values()) {
      let matchScore = 0;

      if (!query) {
        matchScore = command.priority;
      } else if (command.name === query) {
        matchScore = 100;
      } else if (command.name.startsWith(query)) {
        matchScore = 90;
      } else if (command.name.includes(query)) {
        matchScore = 70;
      } else {
        // Check aliases
        for (const alias of command.aliases) {
          if (alias === query) {
            matchScore = 100;
            break;
          } else if (alias.startsWith(query)) {
            matchScore = 85;
            break;
          } else if (alias.includes(query)) {
            matchScore = 65;
            break;
          }
        }
      }

      if (matchScore > 0) {
        suggestions.push({
          value: `/${command.name}`,
          title: `/${command.name}`,
          description: command.description,
          matchScore,
          highlightedValue: `/${command.name}`,
        });
      }
    }

    return suggestions.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Get argument suggestions for a command
   */
  public async getArgumentSuggestions(
    commandName: string,
    argIndex: number,
    partialInput: string,
    context: CommandContext
  ): Promise<ArgumentSuggestion[]> {
    const command = this.get(commandName);
    if (!command || !command.arguments[argIndex]) {
      return [];
    }

    const argDef = command.arguments[argIndex];
    const providerContext: ArgumentProviderContext = {
      partialInput,
      commandContext: context,
      getArgument: (name: string) => {
        const idx = command.arguments.findIndex(a => a.name === name);
        return idx >= 0 && idx < context.args.length ? context.args[idx] : undefined;
      },
    };

    // Check conditional providers first
    if (argDef.conditionalProviders) {
      for (const cp of argDef.conditionalProviders) {
        if (cp.condition(providerContext)) {
          return await cp.provider(providerContext);
        }
      }
    }

    // Use main provider if available
    if (argDef.provider) {
      return await argDef.provider(providerContext);
    }

    // Use static values if available
    if (argDef.values) {
      const query = partialInput.toLowerCase();
      return argDef.values
        .map(v => {
          let matchScore = 0;
          if (!query) {
            matchScore = 100;
          } else if (v.value === query) {
            matchScore = 100;
          } else if (v.value.startsWith(query)) {
            matchScore = 90;
          } else if (v.value.includes(query)) {
            matchScore = 70;
          }

          return {
            value: v.value,
            title: v.value,
            description: v.description,
            matchScore,
            highlightedValue: v.value,
          };
        })
        .filter(s => s.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore);
    }

    return [];
  }

  /**
   * Parse and execute a command
   */
  public async execute(input: string, context: CommandContext): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) {
      return;
    }

    const parts = this.parseInput(trimmed);
    if (parts.length === 0) {
      return;
    }

    const commandName = parts[0].substring(1).toLowerCase();
    const args = parts.slice(1);

    const command = this.get(commandName);
    if (!command) {
      context.addMessage({
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Unknown command "/${commandName}". Type /help to see available commands.`,
        ts: Date.now(),
      });
      return;
    }

    // Execute the command
    await command.handler({
      ...context,
      args,
    });
  }

  /**
   * Parse input into command and arguments
   * Handles quoted strings
   */
  private parseInput(input: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (current) {
          parts.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push(current);
    }

    return parts;
  }

  /**
   * Check if input is a command
   */
  public isCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }

  /**
   * Get help text for all commands
   */
  public getHelpText(): string {
    const categories: Record<string, Command[]> = {};

    for (const command of this.commands.values()) {
      if (!categories[command.category]) {
        categories[command.category] = [];
      }
      categories[command.category].push(command);
    }

    const lines: string[] = ['**Available Commands:**', ''];

    const categoryNames: Record<string, string> = {
      chat: 'Chat & Conversation',
      system: 'System',
      navigation: 'Navigation',
      config: 'Configuration',
      admin: 'Administration',
    };

    for (const [category, commands] of Object.entries(categories)) {
      lines.push(`**${categoryNames[category] || category}:**`);
      for (const cmd of commands.sort((a, b) => b.priority - a.priority)) {
        const aliasStr = cmd.aliases.length > 0 ? ` (${cmd.aliases.map(a => `/${a}`).join(', ')})` : '';
        lines.push(`  /${cmd.name}${aliasStr} - ${cmd.description}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get detailed help for a specific command
   */
  public getCommandHelp(commandName: string): string | null {
    const command = this.get(commandName);
    if (!command) {
      return null;
    }

    const lines: string[] = [
      `**/${command.name}**`,
      '',
      command.description,
      '',
      `**Usage:** ${command.usage}`,
      '',
    ];

    if (command.aliases.length > 0) {
      lines.push(`**Aliases:** ${command.aliases.map(a => `/${a}`).join(', ')}`);
      lines.push('');
    }

    if (command.arguments.length > 0) {
      lines.push('**Arguments:**');
      for (const arg of command.arguments) {
        const required = arg.required ? ' (required)' : ' (optional)';
        lines.push(`  ${arg.name}${required} - ${arg.description}`);
        if (arg.values) {
          lines.push(`    Values: ${arg.values.map(v => v.value).join(', ')}`);
        }
      }
      lines.push('');
    }

    if (command.examples.length > 0) {
      lines.push('**Examples:**');
      for (const example of command.examples) {
        lines.push(`  ${example}`);
      }
    }

    return lines.join('\n');
  }
}

// Export singleton
export const commandRegistry = CommandRegistry.getInstance();
