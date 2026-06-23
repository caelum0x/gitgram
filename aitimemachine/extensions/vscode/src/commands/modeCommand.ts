/**
 * /mode command - Switch between different operational modes
 */

import {
  Command,
  CommandContext,
  ArgumentProviderContext,
  ArgumentSuggestion,
  generateMessage,
  ModeConfig,
} from './types';
import * as vscode from 'vscode';

/**
 * Default built-in modes
 */
const BUILT_IN_MODES: ModeConfig[] = [
  {
    id: 'code',
    name: 'Code',
    description: 'Full coding capabilities with file editing and execution',
    icon: 'code',
    source: 'global',
  },
  {
    id: 'architect',
    name: 'Architect',
    description: 'Planning and design mode - read-only, focuses on analysis',
    icon: 'symbol-structure',
    source: 'global',
  },
  {
    id: 'debug',
    name: 'Debug',
    description: 'Debugging mode with enhanced error tracking',
    icon: 'bug',
    source: 'global',
  },
  {
    id: 'ask',
    name: 'Ask',
    description: 'Q&A mode - read-only, answers questions about the codebase',
    icon: 'question',
    source: 'global',
  },
];

/**
 * Get all available modes (built-in + custom)
 */
function getAllModes(context: CommandContext): ModeConfig[] {
  const customModes = context.config?.customModes || [];
  return [...BUILT_IN_MODES, ...customModes];
}

/**
 * Provide mode suggestions for autocomplete
 */
async function provideModes(context: ArgumentProviderContext): Promise<ArgumentSuggestion[]> {
  const modes = getAllModes(context.commandContext!);
  const query = context.partialInput.toLowerCase();
  const currentMode = context.commandContext?.config?.currentMode || 'code';

  return modes
    .map((mode, index) => {
      let matchScore = 0;
      const isCurrent = mode.id === currentMode;

      if (!query) {
        matchScore = isCurrent ? 50 : 100 - index;
      } else if (mode.id === query || mode.name.toLowerCase() === query) {
        matchScore = 100;
      } else if (mode.id.startsWith(query) || mode.name.toLowerCase().startsWith(query)) {
        matchScore = 90;
      } else if (mode.id.includes(query) || mode.name.toLowerCase().includes(query)) {
        matchScore = 70;
      }

      return {
        value: mode.id,
        title: `${mode.name}${isCurrent ? ' (current)' : ''}`,
        description: mode.description,
        matchScore,
        highlightedValue: mode.id,
      };
    })
    .filter(s => s.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Subcommand autocomplete
 */
async function provideSubcommands(context: ArgumentProviderContext): Promise<ArgumentSuggestion[]> {
  const subcommands = [
    { value: 'switch', description: 'Switch to a different mode' },
    { value: 'show', description: 'Show current mode' },
    { value: 'list', description: 'List all available modes' },
    { value: 'create', description: 'Create a custom mode' },
    { value: 'edit', description: 'Edit a custom mode' },
    { value: 'delete', description: 'Delete a custom mode' },
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
 * Show current mode
 */
async function handleShow(context: CommandContext): Promise<void> {
  const { addMessage, config } = context;
  const currentModeId = config?.currentMode || 'code';
  const modes = getAllModes(context);
  const currentMode = modes.find(m => m.id === currentModeId) || BUILT_IN_MODES[0];

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: [
      '**Current Mode:**',
      '',
      `**${currentMode.name}** (${currentMode.id})`,
      currentMode.description,
      '',
      `Source: ${currentMode.source}`,
    ].join('\n'),
  } as any);
}

/**
 * List all modes
 */
async function handleList(context: CommandContext): Promise<void> {
  const { addMessage, config } = context;
  const modes = getAllModes(context);
  const currentModeId = config?.currentMode || 'code';

  const lines = ['**Available Modes:**', ''];

  // Built-in modes
  lines.push('**Built-in:**');
  BUILT_IN_MODES.forEach(mode => {
    const current = mode.id === currentModeId ? ' **(current)**' : '';
    lines.push(`  - **${mode.name}** (\`${mode.id}\`)${current}`);
    lines.push(`    ${mode.description}`);
  });

  // Custom modes
  const customModes = config?.customModes || [];
  if (customModes.length > 0) {
    lines.push('');
    lines.push('**Custom:**');
    customModes.forEach((mode: ModeConfig) => {
      const current = mode.id === currentModeId ? ' **(current)**' : '';
      lines.push(`  - **${mode.name}** (\`${mode.id}\`)${current}`);
      lines.push(`    ${mode.description}`);
    });
  }

  lines.push('');
  lines.push('Use `/mode switch <mode>` to change modes.');

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: lines.join('\n'),
  } as any);
}

/**
 * Switch to a different mode
 */
async function handleSwitch(context: CommandContext, modeId: string): Promise<void> {
  const { addMessage, sendWebviewMessage, config } = context;

  if (!modeId) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'Mode ID required. Usage: /mode switch <mode>',
    } as any);
    return;
  }

  const modes = getAllModes(context);
  const targetMode = modes.find(m => m.id === modeId || m.name.toLowerCase() === modeId.toLowerCase());

  if (!targetMode) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Unknown mode "${modeId}". Use /mode list to see available modes.`,
    } as any);
    return;
  }

  if (targetMode.id === config?.currentMode) {
    addMessage({
      ...generateMessage(),
      type: 'system',
      content: `Already in ${targetMode.name} mode.`,
    } as any);
    return;
  }

  // Update configuration
  await vscode.workspace.getConfiguration('aitm').update('currentMode', targetMode.id, true);

  // Notify webview
  await sendWebviewMessage({
    type: 'modeChanged',
    mode: targetMode.id,
  });

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: [
      `Switched to **${targetMode.name}** mode.`,
      '',
      targetMode.description,
    ].join('\n'),
  } as any);
}

/**
 * Create a custom mode
 */
async function handleCreate(context: CommandContext): Promise<void> {
  const { addMessage } = context;

  // Prompt for mode details
  const name = await vscode.window.showInputBox({
    prompt: 'Enter mode name',
    placeHolder: 'e.g., Review',
  });

  if (!name) {
    addMessage({
      ...generateMessage(),
      type: 'system',
      content: 'Mode creation cancelled.',
    } as any);
    return;
  }

  const description = await vscode.window.showInputBox({
    prompt: 'Enter mode description',
    placeHolder: 'e.g., Code review mode with enhanced diff view',
  });

  if (!description) {
    addMessage({
      ...generateMessage(),
      type: 'system',
      content: 'Mode creation cancelled.',
    } as any);
    return;
  }

  // Generate ID from name
  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // Check if ID already exists
  const modes = getAllModes(context);
  if (modes.some(m => m.id === id)) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `A mode with ID "${id}" already exists.`,
    } as any);
    return;
  }

  const newMode: ModeConfig = {
    id,
    name,
    description,
    source: 'project',
  };

  // Add to configuration
  const config = vscode.workspace.getConfiguration('aitm');
  const customModes = config.get<ModeConfig[]>('customModes', []);
  customModes.push(newMode);
  await config.update('customModes', customModes, true);

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: `Custom mode **${name}** created with ID \`${id}\`.`,
  } as any);
}

/**
 * Edit a custom mode
 */
async function handleEdit(context: CommandContext, modeId: string): Promise<void> {
  const { addMessage, config } = context;

  const customModes = config?.customModes || [];
  const modeIndex = customModes.findIndex((m: ModeConfig) => m.id === modeId);

  if (modeIndex === -1) {
    // Check if it's a built-in mode
    if (BUILT_IN_MODES.some(m => m.id === modeId)) {
      addMessage({
        ...generateMessage(),
        type: 'error',
        content: 'Built-in modes cannot be edited.',
      } as any);
      return;
    }

    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Custom mode "${modeId}" not found.`,
    } as any);
    return;
  }

  const mode = customModes[modeIndex];

  const newName = await vscode.window.showInputBox({
    prompt: 'Enter new mode name',
    value: mode.name,
  });

  if (!newName) {
    return;
  }

  const newDescription = await vscode.window.showInputBox({
    prompt: 'Enter new description',
    value: mode.description,
  });

  if (!newDescription) {
    return;
  }

  customModes[modeIndex] = {
    ...mode,
    name: newName,
    description: newDescription,
  };

  await vscode.workspace.getConfiguration('aitm').update('customModes', customModes, true);

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: `Mode **${newName}** updated.`,
  } as any);
}

/**
 * Delete a custom mode
 */
async function handleDelete(context: CommandContext, modeId: string): Promise<void> {
  const { addMessage, config } = context;

  // Check if it's a built-in mode
  if (BUILT_IN_MODES.some(m => m.id === modeId)) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'Built-in modes cannot be deleted.',
    } as any);
    return;
  }

  const customModes = config?.customModes || [];
  const modeIndex = customModes.findIndex((m: ModeConfig) => m.id === modeId);

  if (modeIndex === -1) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Custom mode "${modeId}" not found.`,
    } as any);
    return;
  }

  const mode = customModes[modeIndex];

  const confirm = await vscode.window.showWarningMessage(
    `Delete custom mode "${mode.name}"?`,
    { modal: true },
    'Delete'
  );

  if (!confirm) {
    return;
  }

  customModes.splice(modeIndex, 1);
  await vscode.workspace.getConfiguration('aitm').update('customModes', customModes, true);

  // If currently using this mode, switch to code
  if (config?.currentMode === modeId) {
    await vscode.workspace.getConfiguration('aitm').update('currentMode', 'code', true);
  }

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: `Mode **${mode.name}** deleted.`,
  } as any);
}

export const modeCommand: Command = {
  name: 'mode',
  aliases: ['m'],
  description: 'Switch between different operational modes',
  usage: '/mode <show|list|switch|create|edit|delete> [mode]',
  examples: [
    '/mode show',
    '/mode list',
    '/mode switch architect',
    '/mode switch debug',
    '/mode create',
  ],
  category: 'config',
  priority: 8,
  arguments: [
    {
      name: 'subcommand',
      description: 'The action to perform',
      required: false,
      provider: provideSubcommands,
    },
    {
      name: 'mode',
      description: 'Mode ID or name',
      required: false,
      conditionalProviders: [
        {
          condition: (ctx) => {
            const sub = ctx.getArgument('subcommand');
            return sub === 'switch' || sub === 'edit' || sub === 'delete';
          },
          provider: provideModes,
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

    // Handle direct mode switch (e.g., /mode code, /mode architect)
    const modes = getAllModes(context);
    const directMode = modes.find(m => m.id === subcommand || m.name.toLowerCase() === subcommand);
    if (directMode) {
      await handleSwitch(context, directMode.id);
      return;
    }

    switch (subcommand) {
      case 'show':
        await handleShow(context);
        break;
      case 'list':
        await handleList(context);
        break;
      case 'switch':
        await handleSwitch(context, arg);
        break;
      case 'create':
        await handleCreate(context);
        break;
      case 'edit':
        if (!arg) {
          addMessage({
            ...generateMessage(),
            type: 'error',
            content: 'Mode ID required. Usage: /mode edit <mode>',
          } as any);
          return;
        }
        await handleEdit(context, arg);
        break;
      case 'delete':
        if (!arg) {
          addMessage({
            ...generateMessage(),
            type: 'error',
            content: 'Mode ID required. Usage: /mode delete <mode>',
          } as any);
          return;
        }
        await handleDelete(context, arg);
        break;
      default:
        addMessage({
          ...generateMessage(),
          type: 'error',
          content: `Unknown command "${subcommand}". Available: show, list, switch, create, edit, delete`,
        } as any);
    }
  },
};
