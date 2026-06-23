/**
 * ReportBug Command - Report bugs with context
 */

import * as vscode from 'vscode';
import { Command, CommandContext, generateMessage } from './types';

export const reportbugCommand: Command = {
  name: 'reportbug',
  aliases: ['bug', 'issue'],
  description: 'Report a bug with automatic context gathering',
  usage: '/reportbug [description]',
  category: 'chat',
  priority: 60,
  arguments: [
    {
      name: 'description',
      description: 'Bug description',
      required: false,
    },
  ],
  examples: [
    '/reportbug "Login button not working"',
    '/reportbug "Auth fails silently"',
    '/reportbug "Regression after refactor"',
  ],

  handler: async (context: CommandContext): Promise<void> => {
    const { args, addMessage } = context;

    const description = args.join(' ') || 'No description provided';

    // Gather context automatically
    const bugContext = await gatherBugContext();

    // Generate bug report
    const bugId = `bug_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const lines: string[] = [
      `## Bug Report`,
      '',
      `**ID:** \`${bugId}\``,
      `**Reported:** ${new Date().toLocaleString()}`,
      '',
      '### Description',
      description,
      '',
    ];

    // Add file context
    if (bugContext.currentFile) {
      lines.push(
        '### Current File',
        `\`${bugContext.currentFile.path}\``,
        '',
        '```' + (bugContext.currentFile.language || ''),
        bugContext.currentFile.selection || '// No selection',
        '```',
        ''
      );
    }

    // Add error context
    if (bugContext.errors.length > 0) {
      lines.push(
        '### Recent Errors',
        '',
        ...bugContext.errors.map(e => `- ${e}`),
        ''
      );
    }

    // Add environment info
    lines.push(
      '### Environment',
      `- VS Code: ${vscode.version}`,
      `- Platform: ${process.platform}`,
      `- Node: ${process.version}`,
      '',
    );

    // Add suggested actions
    lines.push(
      '### Suggested Actions',
      '',
      '1. Review the error context and stack traces',
      '2. Check recent changes in related files',
      '3. Create a checkpoint to mark this bug state',
      '4. Attempt reproduction steps',
      '',
      '---',
      '',
      '*Would you like me to help investigate this bug?*'
    );

    addMessage({
      ...generateMessage(),
      id: generateMessage().id!,
      ts: generateMessage().ts!,
      type: 'system',
      content: lines.join('\n'),
    });
  },
};

interface BugContext {
  currentFile?: {
    path: string;
    language?: string;
    selection?: string;
  };
  errors: string[];
}

async function gatherBugContext(): Promise<BugContext> {
  const context: BugContext = {
    errors: [],
  };

  // Get current editor context
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const document = editor.document;
    const selection = editor.selection;

    context.currentFile = {
      path: vscode.workspace.asRelativePath(document.uri),
      language: document.languageId,
    };

    if (!selection.isEmpty) {
      context.currentFile.selection = document.getText(selection);
    } else {
      // Get a few lines around cursor
      const line = selection.active.line;
      const startLine = Math.max(0, line - 5);
      const endLine = Math.min(document.lineCount - 1, line + 5);
      const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
      context.currentFile.selection = document.getText(range);
    }
  }

  // Get diagnostics (errors/warnings)
  const diagnostics = vscode.languages.getDiagnostics();
  for (const [uri, diags] of diagnostics) {
    for (const diag of diags) {
      if (diag.severity === vscode.DiagnosticSeverity.Error) {
        const relativePath = vscode.workspace.asRelativePath(uri);
        context.errors.push(
          `${relativePath}:${diag.range.start.line + 1}: ${diag.message}`
        );
      }
    }
  }

  // Limit errors
  context.errors = context.errors.slice(0, 10);

  return context;
}
