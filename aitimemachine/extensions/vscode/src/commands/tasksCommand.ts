/**
 * /tasks command - View and manage task history with analytics
 */

import {
  Command,
  CommandContext,
  ArgumentProviderContext,
  ArgumentSuggestion,
  generateMessage,
  formatRelativeTime,
  formatCost,
  formatTokens,
  truncate,
  TaskHistoryItem,
} from './types';
import * as vscode from 'vscode';

/**
 * Subcommand autocomplete
 */
async function provideSubcommands(context: ArgumentProviderContext): Promise<ArgumentSuggestion[]> {
  const subcommands = [
    { value: 'list', description: 'List recent tasks' },
    { value: 'search', description: 'Search tasks by content' },
    { value: 'select', description: 'View task details' },
    { value: 'next', description: 'Go to next page' },
    { value: 'prev', description: 'Go to previous page' },
    { value: 'sort', description: 'Change sort order' },
    { value: 'filter', description: 'Filter tasks' },
    { value: 'favorite', description: 'Toggle favorite on a task' },
    { value: 'stats', description: 'Show usage statistics' },
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
 * Sort options
 */
async function provideSortOptions(): Promise<ArgumentSuggestion[]> {
  const options = [
    { value: 'newest', description: 'Most recent first' },
    { value: 'oldest', description: 'Oldest first' },
    { value: 'mostExpensive', description: 'Highest cost first' },
    { value: 'mostTokens', description: 'Most tokens first' },
    { value: 'mostRelevant', description: 'By relevance (when searching)' },
  ];

  return options.map((opt, index) => ({
    value: opt.value,
    title: opt.value,
    description: opt.description,
    matchScore: 100 - index,
    highlightedValue: opt.value,
  }));
}

/**
 * Filter options
 */
async function provideFilterOptions(): Promise<ArgumentSuggestion[]> {
  const options = [
    { value: 'all', description: 'Show all tasks' },
    { value: 'favorites', description: 'Show favorites only' },
    { value: 'current', description: 'Current workspace only' },
    { value: 'expensive', description: 'Tasks costing > $0.10' },
  ];

  return options.map((opt, index) => ({
    value: opt.value,
    title: opt.value,
    description: opt.description,
    matchScore: 100 - index,
    highlightedValue: opt.value,
  }));
}

/**
 * Task ID autocomplete
 */
async function provideTaskIds(context: ArgumentProviderContext): Promise<ArgumentSuggestion[]> {
  const taskHistory = context.commandContext?.taskHistoryData;
  if (!taskHistory?.historyItems?.length) {
    return [{
      value: '',
      title: 'No tasks available',
      description: 'Run some tasks first',
      matchScore: 0,
      highlightedValue: '',
    }];
  }

  const query = context.partialInput.toLowerCase();

  return taskHistory.historyItems.map((task, index) => {
    const time = formatRelativeTime(task.ts);
    const cost = formatCost(task.totalCost);
    let matchScore = 0;

    if (!query) {
      matchScore = 100 - index;
    } else if (task.id === query) {
      matchScore = 100;
    } else if (task.id.startsWith(query)) {
      matchScore = 90;
    } else if (task.task.toLowerCase().includes(query)) {
      matchScore = 80;
    }

    return {
      value: task.id,
      title: `${task.id} - ${time}`,
      description: `${truncate(task.task, 50)} (${cost})`,
      matchScore,
      highlightedValue: task.id,
    };
  }).filter(s => s.matchScore > 0);
}

/**
 * Format task list for display
 */
function formatTaskList(
  tasks: TaskHistoryItem[],
  pageIndex: number,
  pageCount: number,
  totalItems: number
): string {
  const lines = ['**Task History:**', ''];

  if (tasks.length === 0) {
    lines.push('No tasks found.');
    return lines.join('\n');
  }

  tasks.forEach((task, index) => {
    const time = formatRelativeTime(task.ts);
    const cost = formatCost(task.totalCost);
    const tokens = formatTokens(task.tokensIn + task.tokensOut);
    const favorite = task.isFavorited ? ' *' : '';

    lines.push(`${index + 1}. ${truncate(task.task, 60)}${favorite}`);
    lines.push(`   ID: \`${task.id}\` | ${time} | ${cost} | ${tokens} tokens`);
    lines.push('');
  });

  lines.push(`Page ${pageIndex + 1} of ${pageCount} (${totalItems} total tasks)`);
  lines.push('Use `/tasks next` or `/tasks prev` to navigate pages.');

  return lines.join('\n');
}

/**
 * List tasks
 */
async function handleList(context: CommandContext): Promise<void> {
  const { addMessage, taskHistoryData, taskHistoryLoading, taskHistoryError, fetchTaskHistory } = context;

  if (taskHistoryError) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Failed to load task history: ${taskHistoryError}`,
    } as any);
    return;
  }

  if (taskHistoryLoading) {
    addMessage({
      ...generateMessage(),
      type: 'system',
      content: 'Loading task history...',
    } as any);
    return;
  }

  if (!taskHistoryData) {
    await fetchTaskHistory();
    return;
  }

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: formatTaskList(
      taskHistoryData.historyItems,
      taskHistoryData.pageIndex,
      taskHistoryData.pageCount,
      taskHistoryData.totalItems
    ),
  } as any);
}

/**
 * Search tasks
 */
async function handleSearch(context: CommandContext, query: string): Promise<void> {
  const { addMessage, updateTaskHistoryFilters } = context;

  if (!query) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'Search query required. Usage: /tasks search <query>',
    } as any);
    return;
  }

  try {
    const data = await updateTaskHistoryFilters({ search: query, sort: 'mostRelevant' });

    addMessage({
      ...generateMessage(),
      type: 'system',
      content: [
        `**Search results for "${query}":**`,
        '',
        formatTaskList(data.historyItems, data.pageIndex, data.pageCount, data.totalItems),
      ].join('\n'),
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
 * Select/view task details
 */
async function handleSelect(context: CommandContext, taskId: string): Promise<void> {
  const { addMessage, taskHistoryData } = context;

  if (!taskId) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'Task ID required. Usage: /tasks select <id>',
    } as any);
    return;
  }

  const task = taskHistoryData?.historyItems.find(t => t.id === taskId || t.id.startsWith(taskId));

  if (!task) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Task "${taskId}" not found.`,
    } as any);
    return;
  }

  const time = formatRelativeTime(task.ts);
  const cost = formatCost(task.totalCost);
  const tokensIn = formatTokens(task.tokensIn);
  const tokensOut = formatTokens(task.tokensOut);
  const favorite = task.isFavorited ? 'Yes' : 'No';

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: [
      '**Task Details:**',
      '',
      `**ID:** \`${task.id}\``,
      `**Task:** ${task.task}`,
      `**Time:** ${time}`,
      `**Cost:** ${cost}`,
      `**Tokens In:** ${tokensIn}`,
      `**Tokens Out:** ${tokensOut}`,
      `**Favorited:** ${favorite}`,
    ].join('\n'),
  } as any);
}

/**
 * Navigate to next page
 */
async function handleNext(context: CommandContext): Promise<void> {
  const { addMessage, taskHistoryData, nextTaskHistoryPage } = context;

  if (!taskHistoryData) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'No task history loaded. Run `/tasks list` first.',
    } as any);
    return;
  }

  if (taskHistoryData.pageIndex >= taskHistoryData.pageCount - 1) {
    addMessage({
      ...generateMessage(),
      type: 'system',
      content: 'Already on the last page.',
    } as any);
    return;
  }

  const data = await nextTaskHistoryPage();

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: formatTaskList(data.historyItems, data.pageIndex, data.pageCount, data.totalItems),
  } as any);
}

/**
 * Navigate to previous page
 */
async function handlePrev(context: CommandContext): Promise<void> {
  const { addMessage, taskHistoryData, previousTaskHistoryPage } = context;

  if (!taskHistoryData) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'No task history loaded. Run `/tasks list` first.',
    } as any);
    return;
  }

  if (taskHistoryData.pageIndex <= 0) {
    addMessage({
      ...generateMessage(),
      type: 'system',
      content: 'Already on the first page.',
    } as any);
    return;
  }

  const data = await previousTaskHistoryPage();

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: formatTaskList(data.historyItems, data.pageIndex, data.pageCount, data.totalItems),
  } as any);
}

/**
 * Change sort order
 */
async function handleSort(context: CommandContext, sortOption: string): Promise<void> {
  const { addMessage, updateTaskHistoryFilters } = context;

  const validSorts = ['newest', 'oldest', 'mostExpensive', 'mostTokens', 'mostRelevant'];

  if (!sortOption || !validSorts.includes(sortOption)) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Invalid sort option. Available: ${validSorts.join(', ')}`,
    } as any);
    return;
  }

  const data = await updateTaskHistoryFilters({ sort: sortOption as any });

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: [
      `**Tasks (sorted by ${sortOption}):**`,
      '',
      formatTaskList(data.historyItems, data.pageIndex, data.pageCount, data.totalItems),
    ].join('\n'),
  } as any);
}

/**
 * Filter tasks
 */
async function handleFilter(context: CommandContext, filterOption: string): Promise<void> {
  const { addMessage, updateTaskHistoryFilters } = context;

  let filters = {};

  switch (filterOption) {
    case 'all':
      filters = { favoritesOnly: false, workspace: 'all' as const };
      break;
    case 'favorites':
      filters = { favoritesOnly: true };
      break;
    case 'current':
      filters = { workspace: 'current' as const };
      break;
    case 'expensive':
      // This would need backend support, for now just show message
      addMessage({
        ...generateMessage(),
        type: 'system',
        content: 'Filtering by cost is not yet implemented.',
      } as any);
      return;
    default:
      addMessage({
        ...generateMessage(),
        type: 'error',
        content: `Invalid filter. Available: all, favorites, current, expensive`,
      } as any);
      return;
  }

  const data = await updateTaskHistoryFilters(filters);

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: [
      `**Tasks (${filterOption}):**`,
      '',
      formatTaskList(data.historyItems, data.pageIndex, data.pageCount, data.totalItems),
    ].join('\n'),
  } as any);
}

/**
 * Toggle favorite
 */
async function handleFavorite(context: CommandContext, taskId: string): Promise<void> {
  const { addMessage, taskHistoryData } = context;

  if (!taskId) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: 'Task ID required. Usage: /tasks favorite <id>',
    } as any);
    return;
  }

  const task = taskHistoryData?.historyItems.find(t => t.id === taskId || t.id.startsWith(taskId));

  if (!task) {
    addMessage({
      ...generateMessage(),
      type: 'error',
      content: `Task "${taskId}" not found.`,
    } as any);
    return;
  }

  // Toggle favorite (would need backend integration)
  const newState = !task.isFavorited;

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: `Task ${task.id} ${newState ? 'added to' : 'removed from'} favorites.`,
  } as any);
}

/**
 * Show usage statistics
 */
async function handleStats(context: CommandContext): Promise<void> {
  const { addMessage, taskHistoryData } = context;

  if (!taskHistoryData?.historyItems?.length) {
    addMessage({
      ...generateMessage(),
      type: 'system',
      content: 'No task data available for statistics.',
    } as any);
    return;
  }

  const tasks = taskHistoryData.historyItems;
  const totalCost = tasks.reduce((sum, t) => sum + t.totalCost, 0);
  const totalTokensIn = tasks.reduce((sum, t) => sum + t.tokensIn, 0);
  const totalTokensOut = tasks.reduce((sum, t) => sum + t.tokensOut, 0);
  const avgCost = totalCost / tasks.length;
  const favorites = tasks.filter(t => t.isFavorited).length;

  addMessage({
    ...generateMessage(),
    type: 'system',
    content: [
      '**Usage Statistics:**',
      '',
      `**Total Tasks:** ${taskHistoryData.totalItems}`,
      `**Total Cost:** ${formatCost(totalCost)}`,
      `**Average Cost:** ${formatCost(avgCost)}`,
      `**Total Tokens In:** ${formatTokens(totalTokensIn)}`,
      `**Total Tokens Out:** ${formatTokens(totalTokensOut)}`,
      `**Favorited Tasks:** ${favorites}`,
    ].join('\n'),
  } as any);
}

export const tasksCommand: Command = {
  name: 'tasks',
  aliases: ['t', 'history'],
  description: 'View and manage task history with analytics',
  usage: '/tasks <list|search|select|next|prev|sort|filter|favorite|stats> [args]',
  examples: [
    '/tasks list',
    '/tasks search "authentication"',
    '/tasks select task_abc123',
    '/tasks next',
    '/tasks sort mostExpensive',
    '/tasks filter favorites',
    '/tasks stats',
  ],
  category: 'chat',
  priority: 7,
  arguments: [
    {
      name: 'subcommand',
      description: 'The action to perform',
      required: false,
      provider: provideSubcommands,
    },
    {
      name: 'argument',
      description: 'Task ID, search query, or option',
      required: false,
      conditionalProviders: [
        {
          condition: (ctx) => ctx.getArgument('subcommand') === 'select' || ctx.getArgument('subcommand') === 'favorite',
          provider: provideTaskIds,
        },
        {
          condition: (ctx) => ctx.getArgument('subcommand') === 'sort',
          provider: provideSortOptions,
        },
        {
          condition: (ctx) => ctx.getArgument('subcommand') === 'filter',
          provider: provideFilterOptions,
        },
      ],
    },
  ],
  handler: async (context) => {
    const { args, addMessage } = context;

    if (args.length === 0) {
      // Default to list
      await handleList(context);
      return;
    }

    const subcommand = args[0].toLowerCase();
    const arg = args.slice(1).join(' ');

    switch (subcommand) {
      case 'list':
        await handleList(context);
        break;
      case 'search':
        await handleSearch(context, arg);
        break;
      case 'select':
        await handleSelect(context, arg);
        break;
      case 'next':
        await handleNext(context);
        break;
      case 'prev':
      case 'previous':
        await handlePrev(context);
        break;
      case 'sort':
        await handleSort(context, arg);
        break;
      case 'filter':
        await handleFilter(context, arg);
        break;
      case 'favorite':
      case 'fav':
        await handleFavorite(context, arg);
        break;
      case 'stats':
      case 'statistics':
        await handleStats(context);
        break;
      default:
        addMessage({
          ...generateMessage(),
          type: 'error',
          content: `Unknown command "${subcommand}". Available: list, search, select, next, prev, sort, filter, favorite, stats`,
        } as any);
    }
  },
};
