import * as vscode from "vscode";
import { PerplexityAPI } from "./api";
import * as path from "path";
import * as fs from "fs";
import { PromptBuilder, CodeContext } from "./promptBuilder";
import { OutputParser } from "./outputParser";
import { PatchEngine } from "./patchEngine";
import { SmartAgent } from "./smartAgent";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  codeContext?: CodeContext;
  appliedChanges?: {
    filePath: string;
    originalCode: string;
    newCode: string;
    success: boolean;
  }[];
  metadata?: {
    tokensUsed?: number;
    modelUsed?: string;
    responseTime?: number;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  lastActivity: Date;
  workspacePath?: string;
  activeFile?: string;
}

export interface ChatContext {
  currentFile?: any;
  selectedCode?: string;
  cursorPosition?: vscode.Position;
  workspaceFiles?: string[];
  gitBranch?: string;
  recentChanges?: string[];
  additionalFiles?: any[];
  customCode?: any[];
  activeFile?: any;
  currentSelection?: any;
}

export class ChatProvider {
  private static instance: ChatProvider;
  private sessions: Map<string, ChatSession> = new Map();
  private currentSessionId?: string;
  private api: PerplexityAPI;
  private webviewPanel?: vscode.WebviewPanel;
  private outputChannel: vscode.OutputChannel;
  private extensionContext: vscode.ExtensionContext;
  private currentMode: string = 'chat';

  constructor(api: PerplexityAPI, context: vscode.ExtensionContext) {
    this.api = api;
    this.outputChannel = vscode.window.createOutputChannel("codeIt Chat");
    this.extensionContext = context;
    this.log("ChatProvider initialized");
  }

  private log(message: string, level: "info" | "warn" | "error" = "info") {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [ChatProvider] ${message}`;

    this.outputChannel.appendLine(logMessage);

    switch (level) {
      case "error":
        console.error(logMessage);
        break;
      case "warn":
        console.warn(logMessage);
        break;
      default:
        console.log(logMessage);
    }
  }

  static getInstance(
    api: PerplexityAPI,
    context: vscode.ExtensionContext
  ): ChatProvider {
    if (!ChatProvider.instance) {
      ChatProvider.instance = new ChatProvider(api, context);
    }
    return ChatProvider.instance;
  }

  // Session Management
  createNewSession(workspacePath?: string): ChatSession {
    this.log(`Creating new session with workspace: ${workspacePath}`);

    const sessionId = this.generateSessionId();
    const session: ChatSession = {
      id: sessionId,
      title: `codeIt Chat ${new Date().toLocaleTimeString()}`,
      messages: [],
      createdAt: new Date(),
      lastActivity: new Date(),
      workspacePath:
        workspacePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    };

    this.sessions.set(sessionId, session);
    this.currentSessionId = sessionId;

    this.log(`New session created: ${sessionId}`);
    this.saveChatSessions();

    return session;
  }

  getCurrentSession(): ChatSession | undefined {
    this.log(`Getting current session: ${this.currentSessionId}`);

    if (!this.currentSessionId) {
      this.log("No current session, creating new one");
      return this.createNewSession();
    }
    return this.sessions.get(this.currentSessionId);
  }

  getSession(sessionId: string): ChatSession | undefined {
    this.log(`Getting session: ${sessionId}`);
    return this.sessions.get(sessionId);
  }

  getAllSessions(): ChatSession[] {
    this.log(`Getting all sessions (${this.sessions.size} total)`);
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()
    );
  }

  switchSession(sessionId: string): boolean {
    this.log(`Switching to session: ${sessionId}`);

    if (this.sessions.has(sessionId)) {
      this.currentSessionId = sessionId;
      this.updateWebview();
      this.log(`Successfully switched to session: ${sessionId}`);
      return true;
    }

    this.log(`Session not found: ${sessionId}`, "error");
    return false;
  }

  deleteSession(sessionId: string): boolean {
    this.log(`Deleting session: ${sessionId}`);

    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = undefined;
        this.log("Deleted current session, reset current session ID");
      }
      this.saveChatSessions();
      this.log(`Successfully deleted session: ${sessionId}`);
      return true;
    }

    this.log(`Session not found for deletion: ${sessionId}`, "error");
    return false;
  }

  // Direct Perplexity API Integration
  async sendMessage(
    content: string,
    context?: ChatContext
  ): Promise<ChatMessage> {
    this.log(`SendMessage called with content length: ${content.length}`);
    this.log(`Context provided: ${!!context}`);

    const session = this.getCurrentSession();
    if (!session) {
      const error = "No active codeIt chat session";
      this.log(error, "error");
      throw new Error(error);
    }

    this.log(`Using session: ${session.id}`);

    // Create user message
    const userMessage: ChatMessage = {
      id: this.generateMessageId(),
      role: "user",
      content,
      timestamp: new Date(),
      codeContext: context
        ? this.buildCodeContext(context)
        : this.getDefaultCodeContext(),
    };

    this.log(`Created user message: ${userMessage.id}`);
    session.messages.push(userMessage);
    session.lastActivity = new Date();
    this.updateWebview();
    this.saveChatSessions();

    // Get AI response directly from Perplexity
    try {
      const assistantMessage = await this.getPerplexityResponse(
        userMessage,
        session
      );
      session.messages.push(assistantMessage);
      session.lastActivity = new Date();
      this.updateWebview();
      this.saveChatSessions();

      this.log(`Message exchange completed successfully`);
      return assistantMessage;
    } catch (error) {
      this.log(`Error in sendMessage: ${error}`, "error");
      throw error;
    }
  }

  // Direct Perplexity API call
  private async getPerplexityResponse(
    userMessage: ChatMessage,
    session: ChatSession
  ): Promise<ChatMessage> {
    const startTime = Date.now();
    this.log(`Getting Perplexity response for message: ${userMessage.id}`);

    try {
      // Build conversation context
      const conversationHistory = session.messages
        .filter((msg) => msg.role === "user" || msg.role === "assistant")
        .slice(-10); // Last 10 messages for context

      this.log(`Conversation history: ${conversationHistory.length} messages`);

      // Create code context
      const codeContext =
        userMessage.codeContext || this.getDefaultCodeContext();
      this.log(
        `Code context - File: ${codeContext.filePath}, Language: ${codeContext.language}`
      );

      // Show progress notification and call Perplexity API
      const response = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "codeIt is analyzing...",
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: "Sending request to Perplexity..." });
          this.log("Calling Perplexity API...");

          const response = await this.api.chatWithCode(
            codeContext,
            conversationHistory.map((msg) => ({
              role: msg.role as "user" | "assistant",
              content: msg.content,
            }))
          );

          this.log(
            `Perplexity API response received - Model: ${response.model}, Tokens: ${response.usage?.total_tokens}`
          );
          progress.report({ message: "Processing response..." });
          return response;
        }
      );

      const responseTime = Date.now() - startTime;
      this.log(`Response received in ${responseTime}ms`);

      // Parse response for code changes
      const parsedOutput = OutputParser.parseAIResponse(response.content);
      this.log(
        `Output parsed - Has code: ${!!parsedOutput.code}, Confidence: ${
          parsedOutput.confidence
        }`
      );

      // Apply code changes if requested and available
      const appliedChanges = await this.applyCodeChanges(
        parsedOutput,
        codeContext,
        userMessage.content
      );

      this.log(`Applied changes: ${appliedChanges.length}`);

      const assistantMessage: ChatMessage = {
        id: this.generateMessageId(),
        role: "assistant",
        content: response.content,
        timestamp: new Date(),
        codeContext,
        appliedChanges,
        metadata: {
          tokensUsed: response.usage?.total_tokens,
          modelUsed: response.model || "sonar",
          responseTime,
        },
      };

      this.log(`Created assistant message: ${assistantMessage.id}`);
      return assistantMessage;
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      this.log(`Error in getPerplexityResponse: ${error.message}`, "error");

      // Show error notification
      vscode.window.showErrorMessage(`codeIt Error: ${error.message}`);

      return {
        id: this.generateMessageId(),
        role: "assistant",
        content: `Sorry, I encountered an error: ${error.message}`,
        timestamp: new Date(),
        metadata: {
          responseTime,
        },
      };
    }
  }

  private async applyCodeChanges(
    parsedOutput: any,
    codeContext: CodeContext,
    userInstruction: string
  ): Promise<any[]> {
    this.log(
      `Applying code changes - Has code: ${!!parsedOutput.code}, File: ${
        codeContext.filePath
      }`
    );

    const changes: any[] = [];

    if (!parsedOutput.code || !codeContext.filePath) {
      this.log("No code or file path, skipping changes");
      return changes;
    }

    // Only apply changes if user explicitly requested modifications
    const modificationKeywords = [
      "fix",
      "change",
      "update",
      "modify",
      "refactor",
      "improve",
      "apply",
    ];
    const shouldApplyChanges = modificationKeywords.some((keyword) =>
      userInstruction.toLowerCase().includes(keyword)
    );

    this.log(`Should apply changes: ${shouldApplyChanges}`);

    if (!shouldApplyChanges) {
      return changes;
    }

    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.fileName !== codeContext.filePath) {
        this.log("No active editor or file mismatch");
        return changes;
      }

      // Ask user for confirmation before applying changes
      const shouldApply = await vscode.window.showInformationMessage(
        "codeIt wants to apply code changes. Continue?",
        { modal: true },
        "Apply Changes",
        "Cancel"
      );

      this.log(`User confirmation: ${shouldApply}`);

      if (shouldApply === "Apply Changes") {
        // Apply the code changes
        const result = await PatchEngine.applyPatchWithConfirmation(
          editor,
          editor.selection,
          parsedOutput.code
        );

        this.log(`Patch application result: ${result.success}`);

        if (result.success) {
          changes.push({
            filePath: codeContext.filePath,
            originalCode: result.originalText,
            newCode: result.newText,
            success: true,
          });
        }
      }
    } catch (error: any) {
      this.log(`Error applying changes: ${error.message}`, "error");
    }

    return changes;
  }

  // Update the buildCodeContext method in chatProvider.ts
  private buildCodeContext(context: ChatContext): CodeContext {
    this.log("Building enhanced layered code context from provided context");

    const editor = vscode.window.activeTextEditor;

    // Build enhanced context with layered structure
    let enhancedContext: CodeContext = {
      selectedCode: context.selectedCode || "",
      userInstruction: "",
      filePath: context.currentFile?.path || editor?.document.fileName || "",
      language: editor
        ? PromptBuilder.detectLanguageFromPath(editor.document.fileName)
        : "text",
      fileContent:
        context.currentFile?.content || editor?.document.getText() || "",
      cursorPosition: context.cursorPosition
        ? {
            line: context.cursorPosition.line,
            column: context.cursorPosition.character,
          }
        : undefined,
      workspaceFiles: context.workspaceFiles,
      gitBranch: context.gitBranch,
      recentChanges: context.recentChanges,
      additionalFiles: context.additionalFiles || [],
      customCode: context.customCode || [],
    };

    // Add selection range for enhanced context analysis
    if (editor && !editor.selection.isEmpty) {
      enhancedContext.selectionRange = {
        start: {
          line: editor.selection.start.line,
          column: editor.selection.start.character,
        },
        end: {
          line: editor.selection.end.line,
          column: editor.selection.end.character,
        },
      };
    }

    // Add current file from context if available
    if (context.currentFile) {
      enhancedContext.fileContent = context.currentFile.content;
      enhancedContext.filePath = context.currentFile.path;
      this.log(`Added current file: ${context.currentFile.name}`);
    }

    // Add active file from context if available
    if (context.activeFile) {
      enhancedContext.fileContent = context.activeFile.content;
      enhancedContext.filePath = context.activeFile.path;
      this.log(`Added active file: ${context.activeFile.name}`);
    }

    // Add current selection if available
    if (context.currentSelection) {
      enhancedContext.selectedCode =
        context.currentSelection.content || context.currentSelection;
      this.log(
        `Added selection: ${enhancedContext.selectedCode.substring(0, 100)}...`
      );
    }

    // this.log(`Built enhanced layered context - File: ${enhancedContext.filePath}, Additional files: ${enhancedContext.additionalFiles.length}`);

    return enhancedContext;
  }

  getDefaultCodeContext(): CodeContext {
    this.log("Getting default code context");

    const editor = vscode.window.activeTextEditor;

    const context = {
      selectedCode: editor?.document.getText(editor.selection) || "",
      userInstruction: "",
      filePath: editor?.document.fileName || "",
      language: editor
        ? PromptBuilder.detectLanguageFromPath(editor.document.fileName)
        : "text",
      fileContent: editor?.document.getText() || "",
      cursorPosition: editor?.selection.active
        ? {
            line: editor.selection.active.line,
            column: editor.selection.active.character,
          }
        : undefined,
    };

    this.log(
      `Default context - File: ${context.filePath}, Language: ${context.language}`
    );
    return context;
  }

  // Webview Management
  createChatWebview(): vscode.WebviewPanel {
    this.log("Creating chat webview");

    this.webviewPanel = vscode.window.createWebviewPanel(
      "codeItChat",
      "codeIt - AI Assistant",
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    // Get file URIs
    const htmlPath = path.join(
      this.extensionContext.extensionPath,
      "media",
      "webview.html"
    );
    const cssPath = vscode.Uri.file(
      path.join(this.extensionContext.extensionPath, "media", "styles.css")
    );
    const jsPath = vscode.Uri.file(
      path.join(this.extensionContext.extensionPath, "media", "script.js")
    );

    // Convert to webview URIs
    const cssUri = this.webviewPanel.webview.asWebviewUri(cssPath);
    const jsUri = this.webviewPanel.webview.asWebviewUri(jsPath);
    const cspSource = this.webviewPanel.webview.cspSource;

    this.log(`Loading HTML from: ${htmlPath}`);
    this.log(`CSS URI: ${cssUri.toString()}`);
    this.log(`JS URI: ${jsUri.toString()}`);

    // Read and process HTML
    let html = fs.readFileSync(htmlPath, "utf8");

    // Replace placeholders
    html = html.replace("{{CSS_URI}}", cssUri.toString());
    html = html.replace("{{JS_URI}}", jsUri.toString());
    html = html.replace(/{{cspSource}}/g, cspSource);

    // Set the HTML content
    this.webviewPanel.webview.html = html;

    this.setupWebviewMessageHandling();
    this.updateWebview();
    this.sendActiveFileInfo(); // Send initial active file info

    this.log("Webview created successfully");
    return this.webviewPanel;
  }

  // Handle chat message with context (unified implementation)
 // Add mode detection to handleChatMessage
private async handleChatMessage(content: string, context: any) {
  this.log(`Handling chat message with content length: ${content.length}`);
  this.log(`Context keys: ${Object.keys(context || {}).join(', ')}`);
  this.log(`Current mode: ${this.currentMode}`);
  
  // Handle based on current mode
  if (this.currentMode === 'smart') {
    this.log('Processing in Smart Agent mode');
    
    try {
      const smartAgent = SmartAgent.getInstance(this.api);
      
      // Set up change preview handler
      smartAgent.setChangePreviewHandler((preview: any) => {
        this.handleChangePreview(preview);
      });
      
      const result = await smartAgent.executeSmartInstruction(content);
      
      // Send result back to chat
      this.webviewPanel?.webview.postMessage({
        command: 'addMessage',
        content: this.formatSmartAgentResult(result)
      });
      
      return;
    } catch (error: any) {
      this.log(`Smart Agent execution failed: ${error.message}`, 'error');
      this.webviewPanel?.webview.postMessage({
        command: 'error',
        error: `Smart Agent execution failed: ${error.message}`
      });
      return;
    }
  }
  
  // Chat mode - check if this should be handled by Smart Agent
  const isSmartAgentInstruction = this.isSmartAgentInstruction(content);
  
  if (isSmartAgentInstruction) {
    this.log('Detected Smart Agent instruction, offering mode switch');
    
    // Ask user if they want to switch to Smart Agent mode
    const switchMode = await vscode.window.showInformationMessage(
      'This looks like a Smart Agent instruction. Would you like to switch modes?',
      'Use Smart Agent',
      'Continue in Chat',
      'Cancel'
    );
    
    if (switchMode === 'Use Smart Agent') {
      // Delegate to Smart Agent
      try {
        const smartAgent = SmartAgent.getInstance(this.api);
        const result = await smartAgent.executeSmartInstruction(content);
        
        // Send result back to chat
        this.webviewPanel?.webview.postMessage({
          command: 'addMessage',
          content: this.formatSmartAgentResult(result)
        });
        
        return;
      } catch (error: any) {
        this.log(`Smart Agent delegation failed: ${error.message}`, 'error');
        // Fall through to regular chat handling
      }
    } else if (switchMode === 'Cancel') {
      return;
    }
  }

  try {
    const session = this.getCurrentSession();
    if (!session) {
      this.createNewSession();
    }

    // Add the user instruction to the context
    const enhancedContext = {
      ...context,
      userInstruction: content
    };

    // Send the message using regular chat
    const response = await this.sendMessage(content, enhancedContext);
    
    // Send response to webview
    this.webviewPanel?.webview.postMessage({
      command: 'addMessage',
      content: response.content
    });

  } catch (error: any) {
    this.log(`Error handling chat message: ${error.message}`, 'error');
    this.webviewPanel?.webview.postMessage({
      command: 'error',
      error: `Failed to process message: ${error.message}`
    });
  }
}

// Add method to detect Smart Agent instructions
private isSmartAgentInstruction(instruction: string): boolean {
  const smartAgentPatterns = [
    // File operations
    /\b(update|modify|change|fix|refactor)\s+\w+\.(js|ts|jsx|tsx|py|java|cpp|c|cs|php|rb|go|rs)\b/i,
    
    // Service/Component operations  
    /\b(update|modify|change|fix)\s+\w*(service|controller|component|model|util|helper|manager)\b/i,
    
    // Multi-file operations
    /\b(add|implement|create).*\b(to|in|across)\s+(all|multiple|every)\b/i,
    
    // Specific code modifications
    /\badd\s+(logging|error\s+handling|validation|tests?)\s+(to|in)\b/i,
    
    // File system operations
    /\b(create|generate|scaffold)\s+.*\bfile|component|service\b/i,
    
    // Cross-file refactoring
    /\brefactor.*\b(across|throughout|all)\b/i
  ];
  
  return smartAgentPatterns.some(pattern => pattern.test(instruction));
}

  private handleChangePreview(preview: any): void {
    this.log(`Handling change preview for ${preview.filePath}`);
    
    // Send change preview to webview
    this.webviewPanel?.webview.postMessage({
      command: 'showChangePreview',
      preview: preview
    });
  }

  private async handleApplyChange(filePath: string): Promise<void> {
    this.log(`Applying change for ${filePath}`);
    
    // For now, we'll just show a success message
    // In the future, this will actually apply the change
    this.webviewPanel?.webview.postMessage({
      command: 'addMessage',
      content: `✅ Applied changes to ${filePath}`
    });
  }

  private async handleSkipChange(filePath: string): Promise<void> {
    this.log(`Skipping change for ${filePath}`);
    
    this.webviewPanel?.webview.postMessage({
      command: 'addMessage',
      content: `⏭️ Skipped changes to ${filePath}`
    });
  }

  private async handleEditChange(filePath: string): Promise<void> {
    this.log(`Editing change for ${filePath}`);
    
    // Open the file in the editor for manual editing
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const fullPath = path.join(workspaceFolders[0].uri.fsPath, filePath);
        const document = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(document);
        
        this.webviewPanel?.webview.postMessage({
          command: 'addMessage',
          content: `✏️ Opened ${filePath} for editing`
        });
      }
    } catch (error: any) {
      this.log(`Failed to open file for editing: ${error.message}`, 'error');
      this.webviewPanel?.webview.postMessage({
        command: 'addMessage',
        content: `❌ Failed to open ${filePath} for editing: ${error.message}`
      });
    }
  }

// Format Smart Agent results for chat display
private formatSmartAgentResult(result: any): string {
  let message = `🤖 **Smart Agent Result**\n\n`;
  
  if (result.success) {
    message += `✅ **Success!** Applied ${result.changesApplied} changes to ${result.filesProcessed} files.\n\n`;
    message += `⏱️ Completed in ${result.executionTime}ms\n\n`;
    
    if (result.changesApplied > 0) {
      message += `**What I did:**\n- Modified ${result.filesProcessed} files\n- Applied ${result.changesApplied} code changes\n\n`;
      message += `You can review the changes in your editor and use Ctrl+Z to undo if needed.`;
    }
  } else {
    message += `❌ **Failed** to complete the instruction.\n\n`;
    message += `**Errors encountered:**\n`;
    result.errors.forEach((error: string, index: number) => {
      message += `${index + 1}. ${error}\n`;
    });
    message += `\n💡 **Tip:** Try being more specific about which files to modify.`;
  }
  
  return message;
}


  // Start new session (unified implementation)
  public startNewSession(): void {
    this.log("Starting new session");

    const newSession: ChatSession = {
      id: this.generateSessionId(),
      title: `Chat ${this.sessions.size + 1}`,
      messages: [],
      createdAt: new Date(),
      lastActivity: new Date(),
      workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    };

    this.sessions.set(newSession.id, newSession);
    this.currentSessionId = newSession.id;
    this.saveChatSessions();

    // Update webviews
    this.updateWebview();

    // Clear chat in main webview
    this.webviewPanel?.webview.postMessage({
      command: "clearChat",
    });

    this.log(`Started new chat session: ${newSession.id}`);
  }

  // Enhanced event handlers for VS Code integration
  private onActiveEditorChanged(editor: vscode.TextEditor | undefined): void {
    this.log(`Active editor changed: ${editor?.document.fileName || "none"}`);

    if (editor && editor.document && this.webviewPanel) {
      // Only send if it's a file (not untitled)
      if (editor.document.uri.scheme === "file") {
        this.sendActiveFileInfo();
      }
    }
  }

  private onSelectionChanged(
    event: vscode.TextEditorSelectionChangeEvent
  ): void {
    if (!this.webviewPanel) return;

    // Only process if there's a non-empty selection
    if (event.selections[0] && !event.selections[0].isEmpty) {
      const selection = event.textEditor.document.getText(event.selections[0]);
      const fileName = path.basename(event.textEditor.document.fileName);

      // Only send if selection is meaningful (more than just whitespace)
      if (selection.trim().length > 0) {
        this.log(
          `Selection changed in ${fileName}: ${selection.length} characters`
        );

        this.webviewPanel.webview.postMessage({
          command: "selectionChanged",
          selection: selection,
          fileName: fileName,
        });
      }
    }
  }

  private async handleDroppedFile(filePath: string): Promise<void> {
    this.log(`Handling dropped file: ${filePath}`);

    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error("File does not exist");
      }

      // Get file stats
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        throw new Error("Path is not a file");
      }

      // Check file size (limit to 1MB)
      if (stats.size > 1024 * 1024) {
        throw new Error("File is too large (max 1MB)");
      }

      this.log(`File stats - Size: ${stats.size} bytes`);

      // Read file content
      let document: vscode.TextDocument;
      try {
        document = await vscode.workspace.openTextDocument(filePath);
      } catch {
        // If VS Code can't open it, try reading as text
        const content = fs.readFileSync(filePath, "utf8");
        const file = {
          name: path.basename(filePath),
          path: vscode.workspace.asRelativePath(filePath),
          content: content,
          type: "dropped-file",
          languageId: this.getLanguageIdFromExtension(path.extname(filePath)),
        };

        this.log(`Sending dropped file to webview: ${file.name}`);

        this.webviewPanel?.webview.postMessage({
          command: "fileAdded",
          file: file,
        });
        return;
      }

      const file = {
        name: path.basename(document.fileName),
        path: vscode.workspace.asRelativePath(document.fileName),
        content: document.getText(),
        type: "dropped-file",
        languageId: document.languageId,
      };

      this.log(
        `Sending opened file to webview: ${file.name} (${file.languageId})`
      );

      this.webviewPanel?.webview.postMessage({
        command: "fileAdded",
        file: file,
      });
    } catch (error: any) {
      this.log(`Error handling dropped file: ${error.message}`, "error");
      this.webviewPanel?.webview.postMessage({
        command: "error",
        error: `Failed to load file: ${error.message}`,
      });
    }
  }

  private getLanguageIdFromExtension(extension: string): string {
    const languageMap: { [key: string]: string } = {
      ".js": "javascript",
      ".ts": "typescript",
      ".jsx": "javascriptreact",
      ".tsx": "typescriptreact",
      ".py": "python",
      ".java": "java",
      ".c": "c",
      ".cpp": "cpp",
      ".cs": "csharp",
      ".php": "php",
      ".rb": "ruby",
      ".go": "go",
      ".rs": "rust",
      ".swift": "swift",
      ".kt": "kotlin",
      ".scala": "scala",
      ".html": "html",
      ".css": "css",
      ".scss": "scss",
      ".sass": "sass",
      ".less": "less",
      ".json": "json",
      ".xml": "xml",
      ".yaml": "yaml",
      ".yml": "yaml",
      ".md": "markdown",
      ".txt": "plaintext",
      ".sql": "sql",
      ".sh": "shellscript",
      ".bat": "bat",
      ".ps1": "powershell",
    };

    return languageMap[extension.toLowerCase()] || "plaintext";
  }

  private sendActiveFileInfo(): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || !activeEditor.document) {
      this.log("No active editor or document available");
      return;
    }

    const document = activeEditor.document;

    // Only process file scheme documents
    if (document.uri.scheme !== "file") {
      this.log(`Skipping non-file document: ${document.uri.scheme}`);
      return;
    }

    const file = {
      name: path.basename(document.fileName),
      path: vscode.workspace.asRelativePath(document.fileName),
      content: document.getText(),
      languageId: document.languageId,
      uri: document.uri.toString(),
    };

    this.log(`Sending active file info: ${file.name} (${file.languageId})`);

    this.webviewPanel?.webview.postMessage({
      command: "activeFileChanged",
      file: file,
    });
  }

  private setupWebviewMessageHandling(): void {
    if (!this.webviewPanel) return;

    this.log("Setting up webview message handling");

    this.webviewPanel.webview.onDidReceiveMessage(async (message) => {
      this.log(`Received webview message: ${message.command}`);

      switch (message.command) {
        case "getActiveFile":
          this.log("Processing getActiveFile command");
          this.sendActiveFileInfo();
          break;

        case "addDroppedFile":
          this.log(`Processing addDroppedFile command: ${message.filePath}`);
          await this.handleDroppedFile(message.filePath);
          break;

        case "selectFile":
          this.log("Processing selectFile command");
          await this.selectAndAddFile();
          break;

        case "includeSelection":
          this.log("Processing includeSelection command");
          this.includeCurrentSelection();
          break;

        case "addCode":
          this.log("Processing addCode command");
          await this.addCustomCode();
          break;

        case "sendMessage":
          this.log(
            `Processing sendMessage command - Content length: ${
              message.content?.length || 0
            }`
          );
          await this.handleChatMessage(message.content, message.context);
          break;

        case "newChat":
          this.log("Processing newChat command");
          this.startNewSession();
          break;

        case "modeChanged":
          this.log(`Processing modeChanged command: ${message.mode}`);
          // Store the current mode for use in message handling
          this.currentMode = message.mode;
          break;

        case "applyChange":
          this.log(`Processing applyChange command: ${message.filePath}`);
          await this.handleApplyChange(message.filePath);
          break;

        case "skipChange":
          this.log(`Processing skipChange command: ${message.filePath}`);
          await this.handleSkipChange(message.filePath);
          break;

        case "editChange":
          this.log(`Processing editChange command: ${message.filePath}`);
          await this.handleEditChange(message.filePath);
          break;

        default:
          this.log(`Unknown command received: ${message.command}`, "warn");
      }
    });

    // Set up event listeners for VS Code editor changes
    const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(
      this.onActiveEditorChanged.bind(this)
    );

    const selectionDisposable = vscode.window.onDidChangeTextEditorSelection(
      this.onSelectionChanged.bind(this)
    );

    // Store disposables for cleanup
    this.extensionContext.subscriptions.push(activeEditorDisposable);
    this.extensionContext.subscriptions.push(selectionDisposable);

    this.log("Event listeners registered successfully");
  }

  private async selectAndAddFile() {
    this.log("Opening file selection dialog");

    const fileUri = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: {
        "Code files": [
          "js",
          "ts",
          "py",
          "java",
          "c",
          "cpp",
          "cs",
          "php",
          "rb",
          "go",
        ],
        "All files": ["*"],
      },
    });

    if (fileUri && fileUri[0]) {
      this.log(`File selected: ${fileUri[0].fsPath}`);
      await this.handleDroppedFile(fileUri[0].fsPath);
    } else {
      this.log("File selection cancelled");
    }
  }

  private includeCurrentSelection() {
    this.log("Including current selection");

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && !activeEditor.selection.isEmpty) {
      const selection = activeEditor.document.getText(activeEditor.selection);
      const fileName = path.basename(activeEditor.document.fileName);

      this.log(
        `Including selection from ${fileName}: ${selection.length} characters`
      );

      this.webviewPanel?.webview.postMessage({
        command: "selectionChanged",
        selection: selection,
        fileName: fileName,
      });
    } else {
      this.log("No text selected in active editor", "warn");
      vscode.window.showWarningMessage(
        "No text selected in the active editor."
      );
    }
  }

  private async addCustomCode() {
    this.log("Adding custom code");

    const code = await vscode.window.showInputBox({
      prompt: "Enter custom code or text",
      placeHolder: "Paste your code here...",
      value: "",
      ignoreFocusOut: true,
    });

    if (code) {
      this.log(`Custom code added: ${code.length} characters`);

      this.webviewPanel?.webview.postMessage({
        command: "codeAdded",
        code: {
          content: code,
          type: "custom-code",
        },
      });
    } else {
      this.log("Custom code addition cancelled");
    }
  }

  private updateWebview() {
    if (!this.webviewPanel) {
      this.log("No webview panel available for update");
      return;
    }

    const session = this.getCurrentSession();
    if (session) {
      this.log(`Updating webview with session: ${session.id}`);
      this.webviewPanel.webview.postMessage({
        command: "updateChat",
        session,
      });
    } else {
      this.log("No current session for webview update", "warn");
    }
  }

  // Save and load sessions
  private saveChatSessions(): void {
    try {
      const sessionsData = Array.from(this.sessions.entries()).map(
        ([idx, session]) => ({
          idx,
          ...session,
          messages: session.messages.map((msg) => ({
            ...msg,
            timestamp: msg.timestamp.toISOString(),
          })),
        })
      );

      this.extensionContext.globalState.update("codeItSessions", sessionsData);
      this.log(`Saved ${sessionsData.length} sessions`);
    } catch (error: any) {
      this.log(`Error saving sessions: ${error.message}`, "error");
    }
  }

  private loadChatSessions(): void {
    try {
      const sessionsData = this.extensionContext.globalState.get<any[]>(
        "codeItSessions",
        []
      );

      sessionsData.forEach((sessionData) => {
        const session: ChatSession = {
          ...sessionData,
          createdAt: new Date(sessionData.createdAt),
          lastActivity: new Date(sessionData.lastActivity),
          messages: sessionData.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          })),
        };

        this.sessions.set(session.id, session);
      });

      this.log(`Loaded ${sessionsData.length} sessions`);
    } catch (error: any) {
      this.log(`Error loading sessions: ${error.message}`, "error");
    }
  }

  // Utility methods
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API
  async startChat(): Promise<void> {
    this.log("Starting chat");
    this.loadChatSessions(); // Load existing sessions
    const webview = this.createChatWebview();
    webview.reveal();
  }

  getChatHistory(sessionId?: string): ChatMessage[] {
    const session = sessionId
      ? this.getSession(sessionId)
      : this.getCurrentSession();
    const historyLength = session?.messages.length || 0;
    this.log(`Getting chat history: ${historyLength} messages`);
    return session?.messages || [];
  }

  clearChatHistory(sessionId?: string): void {
    this.log(`Clearing chat history for session: ${sessionId || "current"}`);

    const session = sessionId
      ? this.getSession(sessionId)
      : this.getCurrentSession();
    if (session) {
      const messageCount = session.messages.length;
      session.messages = [];
      this.updateWebview();
      this.saveChatSessions();
      this.log(`Cleared ${messageCount} messages`);
    } else {
      this.log("No session found for clearing history", "warn");
    }
  }

  exportChatHistory(sessionId?: string): string {
    const messages = this.getChatHistory(sessionId);
    this.log(`Exporting chat history: ${messages.length} messages`);
    return JSON.stringify(messages, null, 2);
  }

  async importChatHistory(
    jsonData: string,
    sessionId?: string
  ): Promise<boolean> {
    this.log(`Importing chat history for session: ${sessionId || "current"}`);

    try {
      const messages = JSON.parse(jsonData) as ChatMessage[];
      const session = sessionId
        ? this.getSession(sessionId)
        : this.getCurrentSession();

      if (session) {
        session.messages = messages;
        session.lastActivity = new Date();
        this.updateWebview();
        this.saveChatSessions();
        this.log(`Imported ${messages.length} messages`);
        return true;
      }

      this.log("No session found for import", "warn");
      return false;
    } catch (error: any) {
      this.log(`Error importing chat history: ${error.message}`, "error");
      return false;
    }
  }

  // Initialize the provider
  initialize(): void {
    this.log("Initializing ChatProvider");
    this.loadChatSessions();
  }
}
