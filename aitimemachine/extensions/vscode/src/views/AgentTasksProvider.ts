import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaskStatus = 'pending' | 'ready' | 'running' | 'done' | 'failed';

interface AgentTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  created_at: string;
  updated_at?: string;
  depends_on?: string[];   // IDs of prerequisite tasks (DAG edges)
  agent?: string;          // Which agent/tool is executing this
  error?: string;
}

type TaskTreeItem = TaskStatusGroupItem | TaskItem;

// ---------------------------------------------------------------------------
// Status metadata
// ---------------------------------------------------------------------------

interface StatusMeta {
  icon: string;
  color: string;
  label: string;
  order: number;
}

const STATUS_META: Record<TaskStatus, StatusMeta> = {
  running: { icon: 'sync~spin', color: 'charts.yellow', label: 'Running',  order: 0 },
  ready:   { icon: 'play',      color: 'charts.green',  label: 'Ready',    order: 1 },
  pending: { icon: 'circle-outline', color: 'charts.purple', label: 'Pending', order: 2 },
  done:    { icon: 'check',     color: 'charts.green',  label: 'Done',     order: 3 },
  failed:  { icon: 'error',     color: 'charts.red',    label: 'Failed',   order: 4 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiUrl(): string {
  const configUrl = vscode.workspace
    .getConfiguration('aitm')
    .get<string>('apiUrl');
  return configUrl || process.env['AITM_API_URL'] || 'http://localhost:4000';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function groupTasksByStatus(tasks: AgentTask[]): Map<TaskStatus, AgentTask[]> {
  const order: TaskStatus[] = ['running', 'ready', 'pending', 'failed', 'done'];
  const groups = new Map<TaskStatus, AgentTask[]>(
    order.map((s) => [s, []]),
  );

  for (const task of tasks) {
    const status: TaskStatus = STATUS_META[task.status] ? task.status : 'pending';
    groups.get(status)!.push(task);
  }

  // Remove empty groups
  for (const [key, value] of groups) {
    if (value.length === 0) {
      groups.delete(key);
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Tree items
// ---------------------------------------------------------------------------

export class TaskStatusGroupItem extends vscode.TreeItem {
  readonly itemType = 'statusGroup' as const;

  constructor(
    public readonly status: TaskStatus,
    public readonly tasks: AgentTask[],
  ) {
    const meta = STATUS_META[status];
    super(meta.label, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`;
    this.iconPath = new vscode.ThemeIcon(
      meta.icon,
      new vscode.ThemeColor(meta.color),
    );
    this.contextValue = 'taskStatusGroup';
  }
}

export class TaskItem extends vscode.TreeItem {
  readonly itemType = 'task' as const;

  constructor(public readonly task: AgentTask) {
    super(task.title, vscode.TreeItemCollapsibleState.None);

    const meta = STATUS_META[task.status] ?? STATUS_META['pending'];
    const date = new Date(task.created_at);

    this.description = getTimeAgo(date);

    const tooltipLines = [
      `**${task.title}**`,
      '',
      `Status: ${meta.label}`,
      `ID: \`${task.id}\``,
      `Created: ${date.toLocaleString()}`,
    ];
    if (task.agent) {
      tooltipLines.push(`Agent: ${task.agent}`);
    }
    if (task.description) {
      tooltipLines.push('', task.description);
    }
    if (task.error) {
      tooltipLines.push('', `Error: ${task.error}`);
    }
    if (task.depends_on && task.depends_on.length > 0) {
      tooltipLines.push(`Depends on: ${task.depends_on.length} task(s)`);
    }

    this.tooltip = new vscode.MarkdownString(tooltipLines.join('\n'));
    this.iconPath = new vscode.ThemeIcon(
      meta.icon,
      new vscode.ThemeColor(meta.color),
    );
    this.contextValue = `task_${task.status}`;

    // Clicking a task opens its detail in an information message (quick access)
    this.command = {
      command: 'aitm.tasks.showDetail',
      title: 'Show Task Detail',
      arguments: [this.task],
    };
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class AgentTasksProvider
  implements vscode.TreeDataProvider<TaskTreeItem>
{
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<TaskTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _tasks: AgentTask[] = [];
  private _isLoading = false;
  private _refreshTimer: ReturnType<typeof setInterval> | undefined;
  private _disposables: vscode.Disposable[] = [];

  constructor() {
    this._registerCommands();
    this._startAutoRefresh();
    this.refresh();
  }

  // ---------------------------------------------------------------------------
  // TreeDataProvider implementation
  // ---------------------------------------------------------------------------

  getTreeItem(element: TaskTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TaskTreeItem): Thenable<TaskTreeItem[]> {
    if (!element) {
      return Promise.resolve(this._getRootItems());
    }

    if (element instanceof TaskStatusGroupItem) {
      return Promise.resolve(
        element.tasks.map((t) => new TaskItem(t)),
      );
    }

    return Promise.resolve([]);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  refresh(): void {
    this._loadTasks();
  }

  dispose(): void {
    if (this._refreshTimer !== undefined) {
      clearInterval(this._refreshTimer);
    }
    for (const d of this._disposables) {
      d.dispose();
    }
    this._onDidChangeTreeData.dispose();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _getRootItems(): TaskTreeItem[] {
    if (this._isLoading && this._tasks.length === 0) {
      const loading = new vscode.TreeItem('Loading tasks...');
      loading.iconPath = new vscode.ThemeIcon('loading~spin');
      return [loading as unknown as TaskTreeItem];
    }

    if (this._tasks.length === 0) {
      const empty = new vscode.TreeItem('No agent tasks found');
      empty.iconPath = new vscode.ThemeIcon('info');
      empty.description = 'Use "Add Task" to create one';
      return [empty as unknown as TaskTreeItem];
    }

    const groups = groupTasksByStatus(this._tasks);
    const items: TaskTreeItem[] = [];
    for (const [status, tasks] of groups) {
      items.push(new TaskStatusGroupItem(status, tasks));
    }
    return items;
  }

  private async _loadTasks(): Promise<void> {
    this._isLoading = true;
    this._onDidChangeTreeData.fire();

    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/v1/tasks`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const body = (await response.json()) as
        | AgentTask[]
        | { data?: AgentTask[] };
      this._tasks = Array.isArray(body)
        ? body
        : (body as { data?: AgentTask[] }).data ?? [];
    } catch {
      // Silently swallow on auto-refresh; user-initiated refresh shows errors
    } finally {
      this._isLoading = false;
      this._onDidChangeTreeData.fire();
    }
  }

  private _startAutoRefresh(): void {
    this._refreshTimer = setInterval(() => {
      this._loadTasks();
    }, 30_000);
  }

  private _registerCommands(): void {
    this._disposables.push(
      vscode.commands.registerCommand(
        'aitm.tasks.refresh',
        () => this.refresh(),
      ),

      vscode.commands.registerCommand(
        'aitm.tasks.showDetail',
        (task: AgentTask) => {
          this._showTaskDetail(task);
        },
      ),

      vscode.commands.registerCommand(
        'aitm.tasks.addTask',
        () => this._addTask(),
      ),

      vscode.commands.registerCommand(
        'aitm.tasks.markDone',
        async (item: TaskItem) => {
          await this._updateTaskStatus(item.task.id, 'done');
        },
      ),

      vscode.commands.registerCommand(
        'aitm.tasks.retry',
        async (item: TaskItem) => {
          await this._updateTaskStatus(item.task.id, 'ready');
        },
      ),

      vscode.commands.registerCommand(
        'aitm.tasks.delete',
        async (item: TaskItem) => {
          await this._deleteTask(item.task);
        },
      ),

      vscode.commands.registerCommand(
        'aitm.tasks.copyId',
        (item: TaskItem) => {
          vscode.env.clipboard.writeText(item.task.id);
          vscode.window.showInformationMessage(`Copied task ID: ${item.task.id}`);
        },
      ),
    );
  }

  private _showTaskDetail(task: AgentTask): void {
    const meta = STATUS_META[task.status] ?? STATUS_META['pending'];
    const date = new Date(task.created_at).toLocaleString();
    const updatedAt = task.updated_at
      ? new Date(task.updated_at).toLocaleString()
      : '—';

    const lines = [
      `**${task.title}**`,
      '',
      `Status: ${meta.label}`,
      `Created: ${date}`,
      `Updated: ${updatedAt}`,
    ];
    if (task.agent) lines.push(`Agent: ${task.agent}`);
    if (task.description) lines.push('', task.description);
    if (task.error) lines.push('', `Error: ${task.error}`);
    if (task.depends_on && task.depends_on.length > 0) {
      lines.push('', `Depends on: ${task.depends_on.join(', ')}`);
    }

    vscode.window.showInformationMessage(lines.join('\n'));
  }

  private async _addTask(): Promise<void> {
    const title = await vscode.window.showInputBox({
      prompt: 'Task title',
      placeHolder: 'e.g., Run integration tests',
      ignoreFocusOut: true,
    });
    if (!title) {
      return;
    }

    const description = await vscode.window.showInputBox({
      prompt: 'Task description (optional)',
      placeHolder: 'Optional details...',
      ignoreFocusOut: true,
    });

    const apiUrl = getApiUrl();
    try {
      const response = await fetch(`${apiUrl}/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || undefined,
          status: 'pending',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      vscode.window.showInformationMessage(`Task created: ${title}`);
      this.refresh();
    } catch (error: unknown) {
      vscode.window.showErrorMessage(
        `Failed to create task: ${getErrorMessage(error)}`,
      );
    }
  }

  private async _updateTaskStatus(
    taskId: string,
    status: TaskStatus,
  ): Promise<void> {
    const apiUrl = getApiUrl();
    try {
      const response = await fetch(`${apiUrl}/v1/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this.refresh();
    } catch (error: unknown) {
      vscode.window.showErrorMessage(
        `Failed to update task: ${getErrorMessage(error)}`,
      );
    }
  }

  private async _deleteTask(task: AgentTask): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      `Delete task "${task.title}"?`,
      { modal: true },
      'Delete',
    );
    if (confirm !== 'Delete') {
      return;
    }

    const apiUrl = getApiUrl();
    try {
      const response = await fetch(`${apiUrl}/v1/tasks/${task.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      vscode.window.showInformationMessage(`Deleted task: ${task.title}`);
      this.refresh();
    } catch (error: unknown) {
      vscode.window.showErrorMessage(
        `Failed to delete task: ${getErrorMessage(error)}`,
      );
    }
  }
}
