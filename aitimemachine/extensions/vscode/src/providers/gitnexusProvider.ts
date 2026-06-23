import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GITNEXUS_URL =
  process.env.GITNEXUS_URL ?? 'http://localhost:3001';

const RECENT_QUERIES_KEY = 'gitnexus.recentQueries';
const MAX_RECENT_QUERIES = 5;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface GitNexusRepo {
  name: string;
  path: string;
  indexedAt?: string;
  lastCommit?: string;
}

export interface ImpactSummary {
  target: string;
  riskLevel: string;
  affectedCount: number;
}

// ---------------------------------------------------------------------------
// TreeItem kinds
// ---------------------------------------------------------------------------

type TreeItemKind =
  | 'section'
  | 'repo'
  | 'query'
  | 'impact'
  | 'offline'
  | 'loading';

export class GitNexusTreeItem extends vscode.TreeItem {
  constructor(
    public readonly kind: TreeItemKind,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly payload?: unknown
  ) {
    super(label, collapsibleState);
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class GitNexusProvider
  implements vscode.TreeDataProvider<GitNexusTreeItem>
{
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<GitNexusTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _repos: GitNexusRepo[] = [];
  private _impact: ImpactSummary | null = null;
  private _offline = false;
  private _loading = false;

  constructor(private readonly _context: vscode.ExtensionContext) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Called by the gitnexus.refresh command. */
  refresh(): void {
    this._loading = true;
    this._onDidChangeTreeData.fire();

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'GitNexus: refreshing…',
        cancellable: false,
      },
      async () => {
        await this._fetchData();
        this._loading = false;
        this._onDidChangeTreeData.fire();
      }
    );
  }

  /** Store a recent query string in globalState (called from command handlers). */
  addRecentQuery(query: string): void {
    const existing: string[] = this._context.globalState.get(
      RECENT_QUERIES_KEY,
      []
    );
    const updated = [
      query,
      ...existing.filter((q) => q !== query),
    ].slice(0, MAX_RECENT_QUERIES);
    this._context.globalState.update(RECENT_QUERIES_KEY, updated);
    this._onDidChangeTreeData.fire();
  }

  /** Store the latest impact result so it can be surfaced in the tree. */
  setImpactResult(summary: ImpactSummary): void {
    this._impact = summary;
    this._onDidChangeTreeData.fire();
  }

  // -------------------------------------------------------------------------
  // TreeDataProvider implementation
  // -------------------------------------------------------------------------

  getTreeItem(element: GitNexusTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: GitNexusTreeItem
  ): Promise<GitNexusTreeItem[]> {
    // Root level: return the three section headers.
    if (!element) {
      if (this._loading) {
        return [this._makeLoading()];
      }
      if (this._offline) {
        return [this._makeOffline()];
      }
      return [
        this._makeSection('Indexed Repos'),
        this._makeSection('Recent Queries'),
        this._makeSection('Impact Analysis'),
      ];
    }

    // Children of section nodes.
    if (element.kind === 'section') {
      switch (element.label as string) {
        case 'Indexed Repos':
          return this._repoItems();
        case 'Recent Queries':
          return this._queryItems();
        case 'Impact Analysis':
          return this._impactItems();
        default:
          return [];
      }
    }

    return [];
  }

  // -------------------------------------------------------------------------
  // Item factories
  // -------------------------------------------------------------------------

  private _makeSection(label: string): GitNexusTreeItem {
    return new GitNexusTreeItem(
      'section',
      label,
      vscode.TreeItemCollapsibleState.Expanded
    );
  }

  private _makeLoading(): GitNexusTreeItem {
    const item = new GitNexusTreeItem(
      'loading',
      'Loading…',
      vscode.TreeItemCollapsibleState.None
    );
    item.iconPath = new vscode.ThemeIcon('loading~spin');
    return item;
  }

  private _makeOffline(): GitNexusTreeItem {
    const item = new GitNexusTreeItem(
      'offline',
      'GitNexus offline',
      vscode.TreeItemCollapsibleState.None
    );
    item.description = `Cannot reach ${GITNEXUS_URL}`;
    item.iconPath = new vscode.ThemeIcon('error');
    item.tooltip = `GitNexus server is not reachable at ${GITNEXUS_URL}.\nStart the server with: gitnexus server`;
    return item;
  }

  private _repoItems(): GitNexusTreeItem[] {
    if (this._repos.length === 0) {
      const empty = new GitNexusTreeItem(
        'repo',
        'No indexed repositories',
        vscode.TreeItemCollapsibleState.None
      );
      empty.iconPath = new vscode.ThemeIcon('info');
      return [empty];
    }

    return this._repos.map((repo) => {
      const item = new GitNexusTreeItem(
        'repo',
        repo.name,
        vscode.TreeItemCollapsibleState.None,
        repo
      );
      item.description = repo.indexedAt
        ? new Date(repo.indexedAt).toLocaleDateString()
        : undefined;
      item.tooltip = [
        `Path: ${repo.path}`,
        repo.indexedAt ? `Indexed: ${new Date(repo.indexedAt).toLocaleString()}` : undefined,
        repo.lastCommit ? `Last commit: ${repo.lastCommit}` : undefined,
      ]
        .filter(Boolean)
        .join('\n');
      item.iconPath = new vscode.ThemeIcon('repo');
      item.command = {
        command: 'gitnexus.showRepoInfo',
        title: 'Show Repo Info',
        arguments: [repo],
      };
      return item;
    });
  }

  private _queryItems(): GitNexusTreeItem[] {
    const queries: string[] = this._context.globalState.get(
      RECENT_QUERIES_KEY,
      []
    );

    if (queries.length === 0) {
      const empty = new GitNexusTreeItem(
        'query',
        'No recent queries',
        vscode.TreeItemCollapsibleState.None
      );
      empty.iconPath = new vscode.ThemeIcon('info');
      return [empty];
    }

    return queries.map((q) => {
      const item = new GitNexusTreeItem(
        'query',
        q,
        vscode.TreeItemCollapsibleState.None,
        q
      );
      item.iconPath = new vscode.ThemeIcon('search');
      item.tooltip = `Re-run query: ${q}`;
      item.command = {
        command: 'gitnexus.query',
        title: 'Run Query',
        arguments: [q],
      };
      return item;
    });
  }

  private _impactItems(): GitNexusTreeItem[] {
    if (!this._impact) {
      const empty = new GitNexusTreeItem(
        'impact',
        'No impact analysis yet',
        vscode.TreeItemCollapsibleState.None
      );
      empty.iconPath = new vscode.ThemeIcon('info');
      return [empty];
    }

    const { target, riskLevel, affectedCount } = this._impact;

    const item = new GitNexusTreeItem(
      'impact',
      target,
      vscode.TreeItemCollapsibleState.None,
      this._impact
    );
    item.description = `${riskLevel} — ${affectedCount} affected`;
    item.tooltip = [
      `Target: ${target}`,
      `Risk: ${riskLevel}`,
      `Affected files: ${affectedCount}`,
    ].join('\n');
    item.iconPath = this._iconForRisk(riskLevel);
    return [item];
  }

  private _iconForRisk(riskLevel: string): vscode.ThemeIcon {
    const lower = riskLevel.toLowerCase();
    if (lower === 'high' || lower === 'critical') {
      return new vscode.ThemeIcon('warning');
    }
    if (lower === 'medium') {
      return new vscode.ThemeIcon('info');
    }
    return new vscode.ThemeIcon('pass');
  }

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  private async _fetchData(): Promise<void> {
    try {
      const repos = await this._fetchRepos();
      this._repos = repos;
      this._offline = false;
    } catch {
      this._offline = true;
      this._repos = [];
    }
  }

  private async _fetchRepos(): Promise<GitNexusRepo[]> {
    const url = `${GITNEXUS_URL}/message`;

    const body = JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'list_repos',
        arguments: { limit: 50 },
      },
      id: 1,
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(8_000),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`GitNexus not reachable: ${message}`);
    }

    if (!response.ok) {
      throw new Error(`GitNexus HTTP ${response.status} ${response.statusText}`);
    }

    const rpc = (await response.json()) as {
      jsonrpc: '2.0';
      id: number;
      result?: { content?: Array<{ type: string; text?: string }> };
      error?: { code: number; message: string };
    };

    if (rpc.error) {
      throw new Error(`GitNexus error ${rpc.error.code}: ${rpc.error.message}`);
    }

    const content = rpc.result?.content ?? [];
    const text = content
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('');

    if (!text) {
      return [];
    }

    // The response is a JSON array of repo objects.
    const parsed: unknown = JSON.parse(text);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return (parsed as Array<Record<string, unknown>>).map((r) => ({
      name: String(r['name'] ?? r['path'] ?? 'unknown'),
      path: String(r['path'] ?? ''),
      indexedAt: typeof r['indexedAt'] === 'string' ? r['indexedAt'] : undefined,
      lastCommit:
        typeof r['lastCommit'] === 'string' ? r['lastCommit'] : undefined,
    }));
  }
}
