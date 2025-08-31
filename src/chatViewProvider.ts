import * as vscode from "vscode";
import { ChatProvider, ChatSession, ChatMessage } from "./chatProvider";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "codeit.chatView";

  private _view?: vscode.WebviewView;
  private chatProvider: ChatProvider;

  constructor(chatProvider: ChatProvider) {
    this.chatProvider = chatProvider;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "startChat":
          await this.chatProvider.startChat();
          this.updateView();
          break;
        case "switchSession":
          const switched = this.chatProvider.switchSession(data.sessionId);
          if (switched) {
            this.updateView();
            vscode.window.showInformationMessage("Switched to chat session");
          }
          break;
        case "deleteSession":
          const deleted = this.chatProvider.deleteSession(data.sessionId);
          if (deleted) {
            this.updateView();
            vscode.window.showInformationMessage("Chat session deleted");
          }
          break;
        case "clearHistory":
          this.chatProvider.clearChatHistory(data.sessionId);
          this.updateView();
          vscode.window.showInformationMessage("Chat history cleared");
          break;
        case "exportSession":
          this.exportSession(data.sessionId);
          break;
        case "newSession":
          this.chatProvider.createNewSession();
          this.updateView();
          break;
      }
    });

    this.updateView();
  }

  public updateView() {
    if (this._view) {
      const sessions = this.chatProvider.getAllSessions();
      const currentSession = this.chatProvider.getCurrentSession();

      this._view.webview.postMessage({
        type: "updateSessions",
        sessions,
        currentSessionId: currentSession?.id,
      });
    }
  }

  private async exportSession(sessionId: string) {
    try {
      const historyJson = this.chatProvider.exportChatHistory(sessionId);
      const session = this.chatProvider.getSession(sessionId);

      if (session) {
        const fileName = `codeit-chat-${session.title.replace(
          /[^a-zA-Z0-9]/g,
          "-"
        )}-${Date.now()}.json`;

        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(fileName),
          filters: {
            "JSON Files": ["json"],
            "All Files": ["*"],
          },
        });

        if (uri) {
          await vscode.workspace.fs.writeFile(
            uri,
            Buffer.from(historyJson, "utf8")
          );
          vscode.window.showInformationMessage(
            `Chat history exported to ${uri.fsPath}`
          );
        }
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to export chat: ${error.message}`);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>codeIt - Chat Sessions</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
            margin: 0;
            padding: 12px;
          }
          
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
          }
          
          .header h3 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-sideBarTitle-foreground);
          }
          
          .header-actions {
            display: flex;
            gap: 8px;
          }
          
          .btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 500;
            transition: background-color 0.2s;
          }
          
          .btn:hover {
            background: var(--vscode-button-hoverBackground);
          }
          
          .btn.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
          }
          
          .btn.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
          }
          
          .sessions-container {
            max-height: 500px;
            overflow-y: auto;
          }
          
          .session-item {
            padding: 12px;
            margin-bottom: 8px;
            border-radius: 6px;
            cursor: pointer;
            border: 1px solid transparent;
            transition: all 0.2s ease;
            position: relative;
          }
          
          .session-item:hover {
            background: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-list-focusOutline);
          }
          
          .session-item.active {
            background: var(--vscode-list-activeSelectionBackground);
            border-color: var(--vscode-list-activeSelectionBorder);
          }
          
          .session-item.active::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 3px;
            background: var(--vscode-focusBorder);
            border-radius: 0 2px 2px 0;
          }
          
          .session-title {
            font-weight: 500;
            margin-bottom: 6px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 13px;
          }
          
          .session-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
          }
          
          .session-actions {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
          }
          
          .action-btn {
            background: none;
            border: 1px solid var(--vscode-button-border);
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            padding: 4px 8px;
            font-size: 10px;
            border-radius: 3px;
            transition: all 0.2s;
          }
          
          .action-btn:hover {
            background: var(--vscode-toolbar-hoverBackground);
            color: var(--vscode-foreground);
          }
          
          .action-btn.danger:hover {
            background: var(--vscode-errorForeground);
            color: var(--vscode-errorBackground);
          }
          
          .empty-state {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            padding: 40px 20px;
            line-height: 1.5;
          }
          
          .empty-state-icon {
            font-size: 24px;
            margin-bottom: 12px;
            opacity: 0.5;
          }
          
          .message-count {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 500;
          }
          
          .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-left: 8px;
          }
          
          .status-indicator.active {
            background: var(--vscode-charts-green);
          }
          
          .status-indicator.inactive {
            background: var(--vscode-descriptionForeground);
            opacity: 0.3;
          }
          
          .session-workspace {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            opacity: 0.7;
            margin-top: 4px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h3>🤖 codeIt Chats</h3>
          <div class="header-actions">
            <button class="btn secondary" id="new-session">+ New</button>
            <button class="btn" id="start-chat">Open Chat</button>
          </div>
        </div>
        
        <div class="sessions-container" id="sessions-container">
          <div class="empty-state">
            <div class="empty-state-icon">💬</div>
            <div>No chat sessions yet</div>
            <div style="margin-top: 8px; font-size: 10px;">
              Start a conversation with codeIt!
            </div>
          </div>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          
          let sessions = [];
          let currentSessionId = null;
          
          // Handle start chat button
          document.getElementById('start-chat').addEventListener('click', () => {
            vscode.postMessage({ type: 'startChat' });
          });
          
          // Handle new session button
          document.getElementById('new-session').addEventListener('click', () => {
            vscode.postMessage({ type: 'newSession' });
          });
          
          // Handle messages from extension
          window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
              case 'updateSessions':
                sessions = message.sessions || [];
                currentSessionId = message.currentSessionId;
                updateSessionsView();
                break;
            }
          });
          
          function updateSessionsView() {
            const container = document.getElementById('sessions-container');
            
            if (sessions.length === 0) {
              container.innerHTML = \`
                <div class="empty-state">
                  <div class="empty-state-icon">💬</div>
                  <div>No chat sessions yet</div>
                  <div style="margin-top: 8px; font-size: 10px;">
                    Start a conversation with codeIt!
                  </div>
                </div>
              \`;
              return;
            }
            
            container.innerHTML = sessions.map(session => {
              const isActive = session.id === currentSessionId;
              const messageCount = session.messages.length;
              const lastActivity = new Date(session.lastActivity).toLocaleString();
              const createdAt = new Date(session.createdAt).toLocaleDateString();
              
              return \`
                <div class="session-item \${isActive ? 'active' : ''}" data-session-id="\${session.id}">
                  <div class="session-title">
                    \${escapeHtml(session.title)}
                    <span class="status-indicator \${isActive ? 'active' : 'inactive'}"></span>
                  </div>
                  <div class="session-meta">
                    <span>Last: \${lastActivity}</span>
                    <span class="message-count">\${messageCount}</span>
                  </div>
                  \${session.workspacePath ? \`<div class="session-workspace">📁 \${escapeHtml(session.workspacePath)}</div>\` : ''}
                  <div class="session-actions">
                    <button class="action-btn" onclick="switchSession('\${session.id}')" \${isActive ? 'disabled' : ''}>
                      \${isActive ? '✓ Current' : '↗ Switch'}
                    </button>
                    <button class="action-btn" onclick="exportSession('\${session.id}')">
                      📤 Export
                    </button>
                    <button class="action-btn" onclick="clearHistory('\${session.id}')">
                      🗑 Clear
                    </button>
                    <button class="action-btn danger" onclick="deleteSession('\${session.id}')">
                      ❌ Delete
                    </button>
                  </div>
                </div>
              \`;
            }).join('');
          }
          
          function switchSession(sessionId) {
            if (sessionId !== currentSessionId) {
              vscode.postMessage({ type: 'switchSession', sessionId });
            }
          }
          
          function clearHistory(sessionId) {
            if (confirm('Are you sure you want to clear this chat history?\\n\\nThis action cannot be undone.')) {
              vscode.postMessage({ type: 'clearHistory', sessionId });
            }
          }
          
          function deleteSession(sessionId) {
            if (confirm('Are you sure you want to delete this chat session?\\n\\nThis will permanently remove all messages and cannot be undone.')) {
              vscode.postMessage({ type: 'deleteSession', sessionId });
            }
          }
          
          function exportSession(sessionId) {
            vscode.postMessage({ type: 'exportSession', sessionId });
          }
          
          function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
          }
          
          // Handle session item clicks for switching
          document.addEventListener('click', (e) => {
            const sessionItem = e.target.closest('.session-item');
            if (sessionItem && !e.target.closest('.session-actions')) {
              const sessionId = sessionItem.dataset.sessionId;
              if (sessionId && sessionId !== currentSessionId) {
                switchSession(sessionId);
              }
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
