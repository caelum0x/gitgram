/**
 * NewRule Command - Create workflow automation rules
 */

import { Command, CommandContext, generateMessage } from './types';

export interface WorkflowRule {
  id: string;
  name: string;
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
  enabled: boolean;
  createdAt: string;
}

export interface RuleTrigger {
  type: 'file_save' | 'file_create' | 'file_delete' | 'command' | 'time' | 'error' | 'checkpoint';
  pattern?: string;
  command?: string;
  schedule?: string;
}

export interface RuleCondition {
  type: 'file_pattern' | 'file_content' | 'git_status' | 'time_range';
  value: string;
  operator?: 'equals' | 'contains' | 'matches' | 'not';
}

export interface RuleAction {
  type: 'checkpoint' | 'command' | 'notification' | 'approval_request';
  config: Record<string, any>;
}

// In-memory rule storage (would be persisted in real implementation)
const rules: WorkflowRule[] = [];

export const newruleCommand: Command = {
  name: 'newrule',
  aliases: ['rule', 'workflow'],
  description: 'Create or manage workflow automation rules',
  usage: '/newrule <create|list|enable|disable|delete> [args]',
  category: 'config',
  priority: 50,
  arguments: [
    {
      name: 'subcommand',
      description: 'Subcommand to execute',
      required: true,
      values: [
        { value: 'create', description: 'Create a new rule' },
        { value: 'list', description: 'List all rules' },
        { value: 'enable', description: 'Enable a rule' },
        { value: 'disable', description: 'Disable a rule' },
        { value: 'delete', description: 'Delete a rule' },
        { value: 'show', description: 'Show rule details' },
      ],
    },
  ],
  examples: [
    '/newrule create "Auto checkpoint on save"',
    '/newrule list',
    '/newrule enable rule_abc123',
    '/newrule delete rule_abc123',
  ],

  handler: async (context: CommandContext): Promise<void> => {
    const { args, addMessage } = context;
    const subcommand = args[0]?.toLowerCase() || 'list';

    let content: string;

    switch (subcommand) {
      case 'create':
        content = handleCreate(args.slice(1));
        break;
      case 'list':
        content = handleList();
        break;
      case 'enable':
        content = handleToggle(args[1], true);
        break;
      case 'disable':
        content = handleToggle(args[1], false);
        break;
      case 'delete':
        content = handleDelete(args[1]);
        break;
      case 'show':
        content = handleShow(args[1]);
        break;
      default:
        content = `Unknown subcommand: ${subcommand}. Use: create, list, enable, disable, delete, show`;
    }

    addMessage({
      ...generateMessage(),
      id: generateMessage().id!,
      ts: generateMessage().ts!,
      type: 'system',
      content,
    });
  },
};

function handleCreate(args: string[]): string {
  const name = args.join(' ') || `Rule ${rules.length + 1}`;

  const rule: WorkflowRule = {
    id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name,
    trigger: {
      type: 'file_save',
      pattern: '*',
    },
    conditions: [],
    actions: [
      {
        type: 'checkpoint',
        config: { description: 'Auto-checkpoint: {trigger}' },
      },
    ],
    enabled: true,
    createdAt: new Date().toISOString(),
  };

  rules.push(rule);

  return [
    `## Rule Created`,
    '',
    `**Name:** ${rule.name}`,
    `**ID:** \`${rule.id}\``,
    `**Status:** ${rule.enabled ? 'Enabled' : 'Disabled'}`,
    '',
    '### Trigger',
    `- Type: \`${rule.trigger.type}\``,
    `- Pattern: \`${rule.trigger.pattern || '*'}\``,
    '',
    '### Actions',
    ...rule.actions.map((a, i) => `${i + 1}. \`${a.type}\``),
    '',
    '---',
    '',
    `*Rule will activate when files are saved.*`,
  ].join('\n');
}

function handleList(): string {
  if (rules.length === 0) {
    return [
      '## Workflow Rules',
      '',
      '*No rules configured yet.*',
      '',
      'Create a rule with:',
      '```',
      '/newrule create "My Rule"',
      '```',
      '',
      '### Available Triggers',
      '- `file_save` - When a file is saved',
      '- `file_create` - When a file is created',
      '- `file_delete` - When a file is deleted',
      '- `command` - When a command is executed',
      '- `error` - When an error is detected',
      '- `checkpoint` - When a checkpoint is created',
    ].join('\n');
  }

  const lines: string[] = [
    '## Workflow Rules',
    '',
    `*${rules.length} rule(s) configured*`,
    '',
  ];

  for (const rule of rules) {
    const status = rule.enabled ? 'Enabled' : 'Disabled';
    lines.push(
      `### ${rule.name}`,
      `ID: \`${rule.id}\``,
      `Status: ${status}`,
      `Trigger: \`${rule.trigger.type}\` (${rule.trigger.pattern || '*'})`,
      `Actions: ${rule.actions.map(a => a.type).join(', ')}`,
      ''
    );
  }

  lines.push(
    '---',
    '',
    'Commands: `/newrule enable <id>`, `/newrule disable <id>`, `/newrule delete <id>`'
  );

  return lines.join('\n');
}

function handleToggle(ruleId: string | undefined, enabled: boolean): string {
  if (!ruleId) {
    return `Please specify a rule ID. Usage: /newrule ${enabled ? 'enable' : 'disable'} <rule_id>`;
  }

  const rule = rules.find(r => r.id === ruleId || r.id.startsWith(ruleId));
  if (!rule) {
    return `Rule not found: ${ruleId}`;
  }

  rule.enabled = enabled;
  return `Rule "${rule.name}" ${enabled ? 'enabled' : 'disabled'}`;
}

function handleDelete(ruleId: string | undefined): string {
  if (!ruleId) {
    return 'Please specify a rule ID. Usage: /newrule delete <rule_id>';
  }

  const index = rules.findIndex(r => r.id === ruleId || r.id.startsWith(ruleId));
  if (index === -1) {
    return `Rule not found: ${ruleId}`;
  }

  const [deleted] = rules.splice(index, 1);
  return `Rule "${deleted.name}" deleted.`;
}

function handleShow(ruleId: string | undefined): string {
  if (!ruleId) {
    return 'Please specify a rule ID. Usage: /newrule show <rule_id>';
  }

  const rule = rules.find(r => r.id === ruleId || r.id.startsWith(ruleId));
  if (!rule) {
    return `Rule not found: ${ruleId}`;
  }

  return [
    `## Rule: ${rule.name}`,
    '',
    `**ID:** \`${rule.id}\``,
    `**Status:** ${rule.enabled ? 'Enabled' : 'Disabled'}`,
    `**Created:** ${new Date(rule.createdAt).toLocaleString()}`,
    '',
    '### Trigger',
    '```json',
    JSON.stringify(rule.trigger, null, 2),
    '```',
    '',
    '### Conditions',
    rule.conditions.length > 0
      ? '```json\n' + JSON.stringify(rule.conditions, null, 2) + '\n```'
      : '*No conditions*',
    '',
    '### Actions',
    '```json',
    JSON.stringify(rule.actions, null, 2),
    '```',
  ].join('\n');
}

// Export rules for use by other modules
export function getWorkflowRules(): WorkflowRule[] {
  return [...rules];
}

export function addWorkflowRule(rule: WorkflowRule): void {
  rules.push(rule);
}
