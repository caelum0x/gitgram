/**
 * /config command - View and modify configuration
 */

import {
  Command,
  CommandContext,
  ArgumentProviderContext,
  ArgumentSuggestion,
  generateMessage,
} from './types';
import * as vscode from 'vscode';

/**
 * Configuration keys that can be modified
 */
const CONFIG_KEYS = [
  { key: 'autoCheckpoint', description: 'Auto-create checkpoints', type: 'boolean' },
  { key: 'checkpointOnSave', description: 'Create checkpoint on file save', type: 'boolean' },
  { key: 'cloudSync', description: 'Sync checkpoints to cloud', type: 'boolean' },
  { key: 'showCodeLens', description: 'Show CodeLens indicators', type: 'boolean' },
  { key: 'showFunctionLens', description: 'Show function-level tracking', type: 'boolean' },
  { key: 'showErrorTracking', description: 'Show error tracking features', type: 'boolean' },
  { key: 'maxConversationHistory', description: 'Max messages to keep', type: 'number' },
  { key: 'currentMode', description: 'Current operational mode', type: 'string' },
];

/**
 * Subcommand autocomplete
 */
async function provideSubcommands(context: ArgumentProviderContext): Promise<ArgumentSuggestion[]> {
  const subcommands = [
    { value: 'show', description: 'Show all configuration' },
    { value: 'get', description: 'Get a specific setting' },
    { value: 'set', description: 'Set a configuration value' },
    { value: 'reset', description: 'Reset to defaults' },
    { value: 'open', description: 'Open settings UI' },
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
 * Config key autocomplete
 */
async function provideConfigKeys(context: ArgumentProviderContext): Promise<ArgumentSuggestion[]> {
  const query = context.partialInput.toLowerCase();

  return CONFIG_KEYS
    .map((cfg, index) => {
      let matchScore = 0;

      if (!query) {
        matchScore = 100 - index;
      } else if (cfg.key === query) {
        matchScore = 100;
      } else if (cfg.key.toLowerCase().startsWith(query)) {
        matchScore = 90;
      } else if (cfg.key.toLowerCase().includes(query)) {
        matchScore = 70;
      }

      return {
        value: cfg.key,
        title: cfg.key,
        description: `${cfg.description} (${cfg.type})`,
        matchScore,
        highlightedValue: cfg.key,
      };
    })
    .filter(s => s.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Show all configuration
 */
async function handleShow(context: CommandContext): Promise<void> {
  const { addMessage, config } = context;

  const lines = ['**Configuration:**', ''];

  CONFIG_KEYS.forEach(cfg => {
    const value = (config as any)?.[cfg.key];
    const displayValue = value === undefined ? 'not set' : JSON.stringify(value);
    lines.push(`**${cfg.key}:** ${displayValue}`);
    lines.push(`  ${cfg.description}`);
    lines.push('');
  });

  lines.push('Use `/config set <key> <value>` to modify settings.');
  lines.push('Use `/config open` to open the settings UI.');

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: lines.join('\n'),
  } as any);
}

/**
 * Get a specific setting
 */
async function handleGet(context: CommandContext, key: string): Promise<void> {
  const { addMessage, config } = context;

  if (!key) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'Key required. Usage: /config get <key>',
    } as any);
    return;
  }

  const cfgDef = CONFIG_KEYS.find(c => c.key === key);
  if (!cfgDef) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Unknown config key "${key}". Available keys: ${CONFIG_KEYS.map(c => c.key).join(', ')}`,
    } as any);
    return;
  }

  const value = (config as any)?.[key];
  const displayValue = value === undefined ? 'not set' : JSON.stringify(value);

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: [
      `**${key}:** ${displayValue}`,
      '',
      cfgDef.description,
      `Type: ${cfgDef.type}`,
    ].join('\n'),
  } as any);
}

/**
 * Set a configuration value
 */
async function handleSet(context: CommandContext, key: string, value: string): Promise<void> {
  const { addMessage } = context;

  if (!key) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'Key and value required. Usage: /config set <key> <value>',
    } as any);
    return;
  }

  const cfgDef = CONFIG_KEYS.find(c => c.key === key);
  if (!cfgDef) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Unknown config key "${key}".`,
    } as any);
    return;
  }

  // Parse value based on type
  let parsedValue: any;
  try {
    switch (cfgDef.type) {
      case 'boolean':
        if (value === 'true' || value === '1' || value === 'yes' || value === 'on') {
          parsedValue = true;
        } else if (value === 'false' || value === '0' || value === 'no' || value === 'off') {
          parsedValue = false;
        } else {
          throw new Error(`Invalid boolean value "${value}". Use true/false.`);
        }
        break;
      case 'number':
        parsedValue = parseInt(value, 10);
        if (isNaN(parsedValue)) {
          throw new Error(`Invalid number "${value}".`);
        }
        break;
      case 'string':
        parsedValue = value;
        break;
      default:
        parsedValue = value;
    }
  } catch (error: any) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: error.message,
    } as any);
    return;
  }

  // Update configuration
  await vscode.workspace.getConfiguration('aitm').update(key, parsedValue, true);

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: `Configuration updated: **${key}** = ${JSON.stringify(parsedValue)}`,
  } as any);
}

/**
 * Reset configuration to defaults
 */
async function handleReset(context: CommandContext, key?: string): Promise<void> {
  const { addMessage } = context;

  const config = vscode.workspace.getConfiguration('aitm');

  if (key) {
    const cfgDef = CONFIG_KEYS.find(c => c.key === key);
    if (!cfgDef) {
      addMessage({
        ...generateMessage(),
        type: 'error',
        content: `Unknown config key "${key}".`,
      } as any);
      return;
    }

    await config.update(key, undefined, true);

    addMessage({
      ...generateMessage(),
      type: 'system',
      content: `Configuration **${key}** reset to default.`,
    } as any);
  } else {
    const confirm = await vscode.window.showWarningMessage(
      'Reset all AI Time Machine settings to defaults?',
      { modal: true },
      'Reset'
    );

    if (!confirm) {
      return;
    }

    for (const cfg of CONFIG_KEYS) {
      await config.update(cfg.key, undefined, true);
    }

    addMessage({
      ...generateMessage(),
      type: 'system',
      content: 'All configuration reset to defaults.',
    } as any);
  }
}

/**
 * Open settings UI
 */
async function handleOpen(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:aitm');
}

export const configCommand: Command = {
  name: 'config',
  aliases: ['cfg', 'settings'],
  description: 'View and modify configuration',
  usage: '/config <show|get|set|reset|open> [key] [value]',
  examples: [
    '/config show',
    '/config get autoCheckpoint',
    '/config set autoCheckpoint true',
    '/config reset autoCheckpoint',
    '/config open',
  ],
  category: 'config',
  priority: 5,
  arguments: [
    {
      name: 'subcommand',
      description: 'The action to perform',
      required: false,
      provider: provideSubcommands,
    },
    {
      name: 'key',
      description: 'Configuration key',
      required: false,
      conditionalProviders: [
        {
          condition: (ctx) => {
            const sub = ctx.getArgument('subcommand');
            return sub === 'get' || sub === 'set' || sub === 'reset';
          },
          provider: provideConfigKeys,
        },
      ],
    },
    {
      name: 'value',
      description: 'Value to set',
      required: false,
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
    const key = args[1];
    const value = args.slice(2).join(' ');

    switch (subcommand) {
      case 'show':
        await handleShow(context);
        break;
      case 'get':
        await handleGet(context, key);
        break;
      case 'set':
        if (!value) {
          addMessage({
            ...generateMessage(),
            type: 'error',
            content: 'Value required. Usage: /config set <key> <value>',
          } as any);
          return;
        }
        await handleSet(context, key, value);
        break;
      case 'reset':
        await handleReset(context, key);
        break;
      case 'open':
        await handleOpen();
        addMessage({
          ...generateMessage(),
          type: 'system',
          content: 'Opening settings...',
        } as any);
        break;
      default:
        addMessage({
          ...generateMessage(),
          type: 'error',
          content: `Unknown command "${subcommand}". Available: show, get, set, reset, open`,
        } as any);
    }
  },
};
