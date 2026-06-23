import * as vscode from 'vscode';
import { execSync } from 'child_process';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  checkpointId?: string;
}

interface Conversation {
  sessionId: string;
  projectId: string;
  messages: Message[];
  startTime: string;
  endTime?: string;
}

export class ConversationViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aitm.conversationView';
  private _view?: vscode.WebviewView;
  private _conversations: Conversation[] = [];
  private _selectedConversation?: Conversation;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          this._loadConversations();
          break;
        case 'selectConversation':
          this._selectConversation(message.sessionId);
          break;
        case 'goToCheckpoint':
          this._goToCheckpoint(message.checkpointId);
          break;
        case 'exportConversation':
          this._exportConversation(message.sessionId);
          break;
        case 'search':
          this._searchConversations(message.query);
          break;
        case 'refresh':
          this._loadConversations();
          break;
      }
    });
  }

  private _loadConversations() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;

    try {
      const output = execSync('aitm conversations --json 2>/dev/null || echo "[]"', {
        cwd: workspaceRoot,
        encoding: 'utf-8'
      });

      this._conversations = JSON.parse(output);
      this._sendToWebview('conversations', this._conversations);
    } catch {
      this._sendToWebview('conversations', []);
    }
  }

  private _selectConversation(sessionId: string) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;

    try {
      const output = execSync(`aitm conversation ${sessionId} --json 2>/dev/null || echo "{}"`, {
        cwd: workspaceRoot,
        encoding: 'utf-8'
      });

      this._selectedConversation = JSON.parse(output);
      this._sendToWebview('conversation', this._selectedConversation);
    } catch {
      this._sendToWebview('error', 'Failed to load conversation');
    }
  }

  private async _goToCheckpoint(checkpointId: string) {
    const confirm = await vscode.window.showWarningMessage(
      'Go to this checkpoint? Current changes will be saved first.',
      { modal: true },
      'Go'
    );

    if (confirm) {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      try {
        execSync(`aitm restore ${checkpointId}`, {
          cwd: workspaceRoot,
          encoding: 'utf-8'
        });
        vscode.window.showInformationMessage('Restored to checkpoint');
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to restore: ${error}`);
      }
    }
  }

  private async _exportConversation(sessionId: string) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;

    try {
      const output = execSync(`aitm conversation ${sessionId} --format markdown`, {
        cwd: workspaceRoot,
        encoding: 'utf-8'
      });

      // Show save dialog
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${workspaceRoot}/conversation-${sessionId}.md`),
        filters: {
          'Markdown': ['md'],
          'JSON': ['json'],
          'Text': ['txt']
        }
      });

      if (uri) {
        const fs = require('fs');
        fs.writeFileSync(uri.fsPath, output);
        vscode.window.showInformationMessage(`Conversation exported to ${uri.fsPath}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to export: ${error}`);
    }
  }

  private _searchConversations(query: string) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;

    try {
      const output = execSync(`aitm search "${query}" --json 2>/dev/null || echo "[]"`, {
        cwd: workspaceRoot,
        encoding: 'utf-8'
      });

      const results = JSON.parse(output);
      this._sendToWebview('searchResults', results);
    } catch {
      this._sendToWebview('searchResults', []);
    }
  }

  private _sendToWebview(type: string, data: any) {
    if (this._view) {
      this._view.webview.postMessage({ type, data });
    }
  }

  public refresh() {
    this._loadConversations();
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conversation History</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-panel-border);
      --accent: var(--vscode-button-background);
      --hover: var(--vscode-list-hoverBackground);
      --user: var(--vscode-charts-green);
      --assistant: var(--vscode-charts-blue);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); background: var(--bg); color: var(--fg); height: 100vh; display: flex; flex-direction: column; }

    .header { padding: 12px; border-bottom: 1px solid var(--border); display: flex; gap: 8px; align-items: center; }
    .search { flex: 1; padding: 6px 10px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--fg); }
    .btn { padding: 6px 12px; border: none; border-radius: 4px; background: var(--accent); color: white; cursor: pointer; }
    .btn:hover { opacity: 0.9; }

    .content { flex: 1; display: flex; overflow: hidden; }

    .sidebar { width: 200px; border-right: 1px solid var(--border); overflow-y: auto; }
    .session { padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border); }
    .session:hover { background: var(--hover); }
    .session.active { background: var(--accent); color: white; }
    .session-time { font-size: 11px; opacity: 0.7; }
    .session-count { font-size: 11px; opacity: 0.6; }

    .messages { flex: 1; overflow-y: auto; padding: 16px; }
    .message { margin-bottom: 16px; padding: 12px; border-radius: 8px; }
    .message.user { background: rgba(34, 197, 94, 0.1); border-left: 3px solid var(--user); }
    .message.assistant { background: rgba(59, 130, 246, 0.1); border-left: 3px solid var(--assistant); }
    .message-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .message-role { font-weight: 600; font-size: 12px; text-transform: uppercase; }
    .message-time { font-size: 11px; opacity: 0.6; }
    .message-content { line-height: 1.5; white-space: pre-wrap; }
    .checkpoint-link { font-size: 11px; color: var(--accent); cursor: pointer; margin-top: 8px; display: inline-block; }
    .checkpoint-link:hover { text-decoration: underline; }

    .empty { padding: 40px; text-align: center; opacity: 0.6; }
    .empty-icon { font-size: 48px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <input type="text" class="search" id="search" placeholder="Search conversations..." />
    <button class="btn" onclick="refresh()">Refresh</button>
  </div>

  <div class="content">
    <div class="sidebar" id="sidebar">
      <div class="empty">
        <div class="empty-icon">Loading...</div>
      </div>
    </div>

    <div class="messages" id="messages">
      <div class="empty">
        <div class="empty-icon">Select a conversation</div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let conversations = [];
    let selectedSession = null;

    window.addEventListener('message', event => {
      const { type, data } = event.data;

      switch (type) {
        case 'conversations':
          conversations = data;
          renderSidebar();
          break;
        case 'conversation':
          renderMessages(data);
          break;
        case 'searchResults':
          conversations = data;
          renderSidebar();
          break;
        case 'error':
          showError(data);
          break;
      }
    });

    function renderSidebar() {
      const sidebar = document.getElementById('sidebar');

      if (!conversations.length) {
        sidebar.innerHTML = '<div class="empty"><div class="empty-icon">No conversations</div></div>';
        return;
      }

      sidebar.innerHTML = conversations.map(conv => {
        const date = new Date(conv.startTime);
        const isActive = selectedSession === conv.sessionId;
        return \`
          <div class="session \${isActive ? 'active' : ''}" onclick="selectConversation('\${conv.sessionId}')">
            <div class="session-time">\${date.toLocaleDateString()} \${date.toLocaleTimeString()}</div>
            <div class="session-count">\${conv.messages?.length || 0} messages</div>
          </div>
        \`;
      }).join('');
    }

    function renderMessages(conversation) {
      const messagesEl = document.getElementById('messages');

      if (!conversation?.messages?.length) {
        messagesEl.innerHTML = '<div class="empty"><div class="empty-icon">No messages</div></div>';
        return;
      }

      messagesEl.innerHTML = conversation.messages.map(msg => {
        const time = new Date(msg.timestamp).toLocaleTimeString();
        const icon = msg.role === 'user' ? '&#128100;' : '&#129302;';
        return \`
          <div class="message \${msg.role}">
            <div class="message-header">
              <span class="message-role">\${icon} \${msg.role}</span>
              <span class="message-time">\${time}</span>
            </div>
            <div class="message-content">\${escapeHtml(msg.content)}</div>
            \${msg.checkpointId ? \`<span class="checkpoint-link" onclick="goToCheckpoint('\${msg.checkpointId}')">Checkpoint</span>\` : ''}
          </div>
        \`;
      }).join('');

      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function selectConversation(sessionId) {
      selectedSession = sessionId;
      renderSidebar();
      vscode.postMessage({ type: 'selectConversation', sessionId });
    }

    function goToCheckpoint(checkpointId) {
      vscode.postMessage({ type: 'goToCheckpoint', checkpointId });
    }

    function refresh() {
      vscode.postMessage({ type: 'refresh' });
    }

    function showError(message) {
      document.getElementById('messages').innerHTML = \`<div class="empty"><div class="empty-icon">Error</div>\${message}</div>\`;
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // Search
    document.getElementById('search').addEventListener('input', (e) => {
      const query = e.target.value;
      if (query.length >= 2) {
        vscode.postMessage({ type: 'search', query });
      } else if (query.length === 0) {
        vscode.postMessage({ type: 'refresh' });
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
