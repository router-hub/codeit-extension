import * as vscode from "vscode";
import { ConfigManager } from "./config";
import { PerplexityAPI } from "./api";
import { PromptBuilder, CodeContext } from "./promptBuilder";
import { PatchEngine } from "./patchEngine";
import { OutputParser } from "./outputParser";
import { ChatProvider } from "./chatProvider";
import { ChatViewProvider } from "./chatViewProvider";
import { SmartAgent } from "./smartAgent";
import { ProjectIndexer } from "./projectIndexer";
import * as path from 'path'; 

export function activate(context: vscode.ExtensionContext) {
  const configManager = ConfigManager.getInstance(context);
  const perplexityAPI = new PerplexityAPI(configManager);
  const chatProvider = ChatProvider.getInstance(perplexityAPI, context);

  // Initialize the chat provider
  chatProvider.initialize();

  // Initialize Smart Agent
  const smartAgent = SmartAgent.getInstance(perplexityAPI);
  const projectIndexer = ProjectIndexer.getInstance();

  // Build initial project index
  setTimeout(() => {
    projectIndexer.buildIndex().catch(console.error);
  }, 2000);

const unifiedCodeItCommand = vscode.commands.registerCommand(
  'codeit.askCodeIt',
  async () => {
    // Show dropdown to choose mode
    const mode = await vscode.window.showQuickPick([
      {
        label: '💬 Chat Mode',
        description: 'Ask questions, get explanations, discuss code',
        detail: 'Interactive conversation with context awareness',
        mode: 'chat'
      },
      {
        label: '🤖 Smart Agent Mode', 
        description: 'Execute intelligent file operations and modifications',
        detail: 'Find files, apply changes, multi-file operations',
        mode: 'smart'
      }
    ], {
      placeHolder: 'Choose how you want to interact with codeIt',
      ignoreFocusOut: true
    });

    if (!mode) return;

    // Get user instruction
    const instruction = await vscode.window.showInputBox({
      prompt: mode.mode === 'chat' 
        ? 'What would you like to know or discuss about your code?'
        : 'What would you like codeIt to do? (e.g., "Update UserService to add logging")',
      placeHolder: mode.mode === 'chat'
        ? 'e.g., "Explain this function", "How can I improve this code?"'
        : 'e.g., "Update main.jsx to add logging", "Fix all TypeScript errors"',
      ignoreFocusOut: true
    });

    if (!instruction) return;

    try {
      if (mode.mode === 'chat') {
        await handleChatMode(instruction, chatProvider);
      } else {
        await handleSmartAgentMode(instruction, smartAgent);
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`codeIt Error: ${error.message}`);
    }
  }
);

// Chat mode handler
async function handleChatMode(instruction: string, chatProvider: ChatProvider) {
  const editor = vscode.window.activeTextEditor;
  
  // Build context for chat
  const context = {
    currentFile: editor ? {
      name: path.basename(editor.document.fileName),
      path: editor.document.fileName,
      content: editor.document.getText()
    } : undefined,
    selectedCode: editor?.document.getText(editor.selection) || "",
    userInstruction: instruction,
    cursorPosition: editor?.selection.active,
    additionalFiles: [],
    customCode: []
  };

  // Send to chat and open chat interface
  await chatProvider.sendMessage(instruction, context);
  await chatProvider.startChat();
}

// Smart agent mode handler
async function handleSmartAgentMode(instruction: string, smartAgent: SmartAgent) {
  const result = await smartAgent.executeSmartInstruction(instruction);
  
  if (result.success) {
    vscode.window.showInformationMessage(
      `✅ Smart instruction completed! Applied ${result.changesApplied} changes to ${result.filesProcessed} files.`
    );
  } else {
    vscode.window.showWarningMessage(
      `⚠️ Smart instruction completed with issues: ${result.errors.join(', ')}`
    );
  }
}
// Add these commands to extension.ts for direct access
const chatModeCommand = vscode.commands.registerCommand(
  'codeit.chatMode',
  async () => {
    const instruction = await vscode.window.showInputBox({
      prompt: 'What would you like to know or discuss about your code?',
      placeHolder: 'e.g., "Explain this function", "How can I improve this code?"',
      ignoreFocusOut: true
    });

    if (instruction) {
      await handleChatMode(instruction, chatProvider);
    }
  }
);

const smartAgentModeCommand = vscode.commands.registerCommand(
  'codeit.smartAgentMode',
  async () => {
    const instruction = await vscode.window.showInputBox({
      prompt: 'What would you like codeIt to do?',
      placeHolder: 'e.g., "Update main.jsx to add logging", "Fix all TypeScript errors"',
      ignoreFocusOut: true
    });

    if (instruction) {
      await handleSmartAgentMode(instruction, smartAgent);
    }
  }
);

context.subscriptions.push(chatModeCommand, smartAgentModeCommand);

  const refreshIndexCommand = vscode.commands.registerCommand(
    "codeit.refreshProjectIndex",
    async () => {
      try {
        await projectIndexer.refreshIndex();
        vscode.window.showInformationMessage(
          "Project index refreshed successfully!"
        );
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to refresh index: ${error.message}`
        );
      }
    }
  );


  context.subscriptions.push(
    unifiedCodeItCommand,
    refreshIndexCommand
  );

  // Pass configManager to the API instance for access in ChatProvider
  (perplexityAPI as any).configManager = configManager;

  // Register the main refactor command - updated for codeIt branding
  let refactorCommand = vscode.commands.registerCommand(
    "codeit.refactorSelection",
    async () => {
      await handleRefactorCommand(configManager, perplexityAPI);
    }
  );

  // Register generate code command
  let generateCommand = vscode.commands.registerCommand(
    "codeit.generateCode",
    async () => {
      await handleGenerateCommand(configManager, perplexityAPI);
    }
  );

  // Register API key configuration command
  let configureCommand = vscode.commands.registerCommand(
    "codeit.configureAPI",
    async () => {
      await handleConfigureCommand(configManager, perplexityAPI);
    }
  );

  // Register test connection command
  let testCommand = vscode.commands.registerCommand(
    "codeit.testConnection",
    async () => {
      await handleTestCommand(perplexityAPI);
    }
  );

  // Register undo command
  let undoCommand = vscode.commands.registerCommand(
    "codeit.undoLastChange",
    async () => {
      await handleUndoCommand();
    }
  );

  // Register chat commands
  let startChatCommand = vscode.commands.registerCommand(
    "codeit.startChat",
    async () => {
      await chatProvider.startChat();
    }
  );

  let quickChatCommand = vscode.commands.registerCommand(
    "codeit.quickChat",
    async () => {
      await handleQuickChatCommand(chatProvider);
    }
  );

  // Register show history command
  let historyCommand = vscode.commands.registerCommand(
    "codeit.showHistory",
    async () => {
      await handleHistoryCommand();
    }
  );

  // Register clear history command
  let clearHistoryCommand = vscode.commands.registerCommand(
    "codeit.clearHistory",
    async () => {
      await handleClearHistoryCommand(chatProvider);
    }
  );

  // Register export history command
  let exportHistoryCommand = vscode.commands.registerCommand(
    "codeit.exportHistory",
    async () => {
      await exportHistory();
    }
  );

  // Register test chat command
  let testChatCommand = vscode.commands.registerCommand(
    "codeit.testChat",
    async () => {
      await handleTestChatCommand(chatProvider);
    }
  );

  // Register set API key command
  let setApiKeyCommand = vscode.commands.registerCommand(
    "codeit.setApiKey",
    async () => {
      await handleSetApiKeyCommand(configManager);
    }
  );

  // Register chat view provider
  const chatViewProvider = new ChatViewProvider(chatProvider);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatViewProvider
    )
  );

  // Register status bar item for quick access
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = "$(robot) codeIt";
  statusBarItem.tooltip = "codeIt AI Assistant - Click to start chat";
  statusBarItem.command = "codeit.startChat";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Update status bar with configuration info
  updateStatusBar(statusBarItem, configManager);

  context.subscriptions.push(
    refactorCommand,
    generateCommand,
    configureCommand,
    testCommand,
    undoCommand,
    startChatCommand,
    quickChatCommand,
    historyCommand,
    clearHistoryCommand,
    exportHistoryCommand,
    testChatCommand,
    setApiKeyCommand
  );
}

async function handleRefactorCommand(
  configManager: ConfigManager,
  perplexityAPI: PerplexityAPI
) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);

  if (!selectedText.trim()) {
    vscode.window.showInformationMessage("Please select some code first.");
    return;
  }

  // Check if API key is configured
  if (!(await configManager.hasApiKey())) {
    const apiKey = await configManager.promptForApiKey();
    if (!apiKey) {
      vscode.window.showInformationMessage(
        "API key is required to use codeIt."
      );
      return;
    }
  }

  // Get user instruction
  const userInstruction = await vscode.window.showInputBox({
    prompt: "How would you like to improve this code?",
    placeHolder:
      'e.g., "refactor for better readability", "add error handling", "optimize performance"',
    ignoreFocusOut: true,
  });

  if (!userInstruction) {
    return;
  }

  // Build enhanced context
const context: CodeContext = {
  selectedCode: selectedText,
  userInstruction,
  filePath: editor.document.fileName,
  language: PromptBuilder.detectLanguageFromPath(editor.document.fileName),
  fileContent: editor.document.getText(),
  cursorPosition: {
    line: selection.start.line,
    column: selection.start.character,
  },
  selectionRange: {
    start: { line: selection.start.line, column: selection.start.character },
    end: { line: selection.end.line, column: selection.end.character },
  },
  workspaceFiles: await getWorkspaceFiles(),
  imports: await extractImportsFromDocument(editor.document), // Updated method call
};

  // Show progress and call API
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "codeIt is analyzing your code...",
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({
          message: "Building context and generating prompts...",
        });

        const response = await perplexityAPI.callAPI(context);

        progress.report({ message: "Processing AI response..." });

        // Parse the response
        const parsedOutput = OutputParser.parseAIResponse(response.content);

        if (!parsedOutput.code) {
          vscode.window.showErrorMessage(
            "AI response did not contain valid code."
          );
          return;
        }

        // Apply the patch with confirmation
        const result = await PatchEngine.applyPatchWithConfirmation(
          editor,
          selection,
          response.content
        );

        if (result.success) {
          vscode.window.showInformationMessage(
            "✅ Code updated successfully by codeIt!"
          );
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `codeIt processing failed: ${error.message}`
        );
      }
    }
  );
}

async function handleGenerateCommand(
  configManager: ConfigManager,
  perplexityAPI: PerplexityAPI
) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }

  // Check API key
  if (!(await configManager.hasApiKey())) {
    const apiKey = await configManager.promptForApiKey();
    if (!apiKey) {
      vscode.window.showInformationMessage(
        "API key is required to use codeIt."
      );
      return;
    }
  }

  // Get generation instruction
  const userInstruction = await vscode.window.showInputBox({
    prompt: "What code would you like to generate?",
    placeHolder:
      'e.g., "create a function to validate email", "add a class for user management"',
    ignoreFocusOut: true,
  });

  if (!userInstruction) {
    return;
  }

  const position = editor.selection.active;
const context: CodeContext = {
  selectedCode: "",
  userInstruction,
  filePath: editor.document.fileName,
  language: PromptBuilder.detectLanguageFromPath(editor.document.fileName),
  fileContent: editor.document.getText(),
  cursorPosition: { line: position.line, column: position.character },
  workspaceFiles: await getWorkspaceFiles(),
  imports: await extractImportsFromDocument(editor.document), // Updated method call
};

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "codeIt is generating code...",
      cancellable: false,
    },
    async (progress) => {
      try {
        const response = await perplexityAPI.callAPI(context);
        const parsedOutput = OutputParser.parseAIResponse(response.content);

        if (parsedOutput.code) {
          const edit = new vscode.WorkspaceEdit();
          edit.insert(editor.document.uri, position, parsedOutput.code);

          const success = await vscode.workspace.applyEdit(edit);
          if (success) {
            vscode.window.showInformationMessage(
              "✅ Code generated successfully by codeIt!"
            );
          }
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Code generation failed: ${error.message}`
        );
      }
    }
  );
}

// Add this helper function to extension.ts
async function extractImportsFromDocument(document: vscode.TextDocument): Promise<string[]> {
  const content = document.getText();
  const language = PromptBuilder.detectLanguageFromPath(document.fileName);
  const imports: string[] = [];
  
  // Get first 50 lines to check for imports
  const lines = content.split('\n').slice(0, 50);
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      continue;
    }
    
    // Check for import patterns based on language
    if (isImportLine(trimmed, language)) {
      imports.push(trimmed);
    } else if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
      // Stop at first non-import, non-comment line
      break;
    }
  }
  
  return imports;
}

// Helper function to detect import lines
function isImportLine(line: string, language: string): boolean {
  const patterns: { [key: string]: RegExp[] } = {
    'typescript': [
      /^import\s+.*from\s+['"].*['"]/,
      /^import\s+['"].*['"]/,
      /^const\s+.*=\s*require\(/
    ],
    'javascript': [
      /^import\s+.*from\s+['"].*['"]/,
      /^import\s+['"].*['"]/,
      /^const\s+.*=\s*require\(/,
      /^var\s+.*=\s*require\(/,
      /^let\s+.*=\s*require\(/
    ],
    'python': [
      /^import\s+/,
      /^from\s+.*import/
    ],
    'java': [
      /^import\s+/,
      /^package\s+/
    ],
    'csharp': [
      /^using\s+/
    ],
    'cpp': [
      /^#include\s+/
    ],
    'c': [
      /^#include\s+/
    ]
  };

  const langPatterns = patterns[language] || patterns['javascript'];
  return langPatterns.some(pattern => pattern.test(line));
}


async function handleQuickChatCommand(chatProvider: ChatProvider) {
  const editor = vscode.window.activeTextEditor;
  const selectedText = editor?.document.getText(editor.selection) || "";

  // Get quick question
  const question = await vscode.window.showInputBox({
    prompt: "Ask codeIt about your code:",
    placeHolder:
      'e.g., "explain this function", "how can I improve this?", "what does this do?"',
    ignoreFocusOut: true,
  });

  if (!question) {
    return;
  }

  // Create context with selected code
  const context = {
    currentFile: editor?.document.fileName,
    selectedCode: selectedText,
    cursorPosition: editor?.selection.active,
  };

  // Send message to chat
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "codeIt is thinking...",
        cancellable: false,
      },
      async () => {
        await chatProvider.sendMessage(question, context);
      }
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`codeIt chat error: ${error.message}`);
  }
}

async function handleHistoryCommand() {
  const editor = vscode.window.activeTextEditor;

  // Show history options
  const options = [
    {
      label: "📄 Current File History",
      description: "Show history for the currently open file",
      action: "current",
    },
    {
      label: "📁 All Files History",
      description: "Show history for all files in workspace",
      action: "all",
    },
    {
      label: "🗑️ Clear History",
      description: "Clear all codeIt history",
      action: "clear",
    },
    {
      label: "📤 Export History",
      description: "Export history to JSON file",
      action: "export",
    },
  ];

  const selectedOption = await vscode.window.showQuickPick(options, {
    placeHolder: "Choose history action:",
    ignoreFocusOut: true,
  });

  if (!selectedOption) {
    return;
  }

  switch (selectedOption.action) {
    case "current":
      await showCurrentFileHistory(editor);
      break;
    case "all":
      await showAllFilesHistory();
      break;
    case "clear":
      await clearAllHistory();
      break;
    case "export":
      await exportHistory();
      break;
  }
}

async function showCurrentFileHistory(editor: vscode.TextEditor | undefined) {
  if (!editor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }

  const currentFilePath = editor.document.uri.fsPath;
  const history = PatchEngine.getPatchHistory(currentFilePath);

  if (history.length === 0) {
    vscode.window.showInformationMessage(
      `No codeIt history for ${editor.document.fileName}`
    );
    return;
  }

  await displayHistory(history, `History for ${editor.document.fileName}`);
}

async function showAllFilesHistory() {
  const history = PatchEngine.getPatchHistory();

  if (history.length === 0) {
    vscode.window.showInformationMessage("No codeIt history available.");
    return;
  }

  await displayHistory(history, "All codeIt History");
}

async function displayHistory(history: any[], title: string) {
  const historyItems = history.map((entry) => ({
    label: `${entry.instruction}`,
    description: `${entry.timestamp.toLocaleString()} - ${
      entry.patchType || "edit"
    }`,
    detail: `${entry.filePath} - ${entry.success ? "✅" : "❌"} ${
      entry.confidence
        ? `(${(entry.confidence * 100).toFixed(0)}% confidence)`
        : ""
    }`,
    entry,
  }));

  const selected = await vscode.window.showQuickPick(historyItems, {
    placeHolder: title,
    ignoreFocusOut: true,
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (selected) {
    await showHistoryDetails(selected.entry);
  }
}

async function showHistoryDetails(entry: any) {
  const details = `# codeIt Change History

## Details
- **Instruction:** ${entry.instruction}
- **Date:** ${entry.timestamp.toLocaleString()}
- **File:** ${entry.filePath}
- **Type:** ${entry.patchType || "edit"}
- **Success:** ${entry.success ? "Yes ✅" : "No ❌"}
${
  entry.confidence
    ? `- **Confidence:** ${(entry.confidence * 100).toFixed(0)}%`
    : ""
}

## Original Code
\`\`\`${getLanguageFromPath(entry.filePath)}
${entry.originalCode}
\`\`\`

## Modified Code
\`\`\`${getLanguageFromPath(entry.filePath)}
${entry.newCode}
\`\`\`

---
*Generated by codeIt AI Assistant*`;

  const historyDocument = await vscode.workspace.openTextDocument({
    content: details,
    language: "markdown",
  });

  await vscode.window.showTextDocument(
    historyDocument,
    vscode.ViewColumn.Beside
  );
}

async function clearAllHistory() {
  const action = await vscode.window.showWarningMessage(
    "Are you sure you want to clear all codeIt history? This cannot be undone.",
    { modal: true },
    "Clear All",
    "Cancel"
  );

  if (action === "Clear All") {
    PatchEngine.clearHistory();
    vscode.window.showInformationMessage(
      "✅ All codeIt history cleared successfully!"
    );
  }
}

async function exportHistory() {
  const history = PatchEngine.getPatchHistory();

  if (history.length === 0) {
    vscode.window.showInformationMessage("No history to export.");
    return;
  }

  try {
    const fileName = `codeit-history-${Date.now()}.json`;
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(fileName),
      filters: {
        "JSON Files": ["json"],
        "All Files": ["*"],
      },
    });

    if (uri) {
      const historyJson = JSON.stringify(history, null, 2);
      await vscode.workspace.fs.writeFile(
        uri,
        Buffer.from(historyJson, "utf8")
      );
      vscode.window.showInformationMessage(
        `✅ History exported to ${uri.fsPath}`
      );
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `Failed to export history: ${error.message}`
    );
  }
}

async function handleClearHistoryCommand(chatProvider: ChatProvider) {
  const action = await vscode.window.showWarningMessage(
    "Are you sure you want to clear all codeIt history?",
    { modal: true },
    "Clear All",
    "Cancel"
  );

  if (action === "Clear All") {
    PatchEngine.clearHistory();
    chatProvider.clearChatHistory();
    vscode.window.showInformationMessage(
      "✅ codeIt history cleared successfully!"
    );
  }
}

async function handleTestChatCommand(chatProvider: ChatProvider) {
  try {
    // Send a test message to verify chat is working
    const testMessage = await chatProvider.sendMessage(
      "Hello! This is a test message."
    );
    vscode.window.showInformationMessage("Test message sent successfully!");
  } catch (error: any) {
    vscode.window.showErrorMessage(`Test chat error: ${error.message}`);
  }
}

async function handleSetApiKeyCommand(configManager: ConfigManager) {
  try {
    const apiKey = await vscode.window.showInputBox({
      prompt: "Enter your Perplexity API key",
      placeHolder: "pplx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Please enter an API key";
        }
        if (!value.startsWith("pplx-") && !value.startsWith("pcl_")) {
          return 'API key should start with "pplx-" or "pcl_"';
        }
        return null;
      },
    });

    if (apiKey) {
      await configManager.setApiKey(apiKey.trim());
      vscode.window.showInformationMessage(
        "✅ API key configured successfully!"
      );
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error setting API key: ${error.message}`);
  }
}

async function handleConfigureCommand(
  configManager: ConfigManager,
  perplexityAPI: PerplexityAPI
) {
  const currentKey = await configManager.getApiKey();

  if (currentKey) {
    const action = await vscode.window.showInformationMessage(
      "codeIt API key is already configured. What would you like to do?",
      "Update API Key",
      "Test Connection",
      "View Settings",
      "Cancel"
    );

    switch (action) {
      case "Update API Key":
        await configManager.updateApiKey();
        break;
      case "Test Connection":
        await handleTestCommand(perplexityAPI);
        break;
      case "View Settings":
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "codeit"
        );
        break;
    }
  } else {
    await configManager.promptForApiKey();
  }
}

async function handleTestCommand(perplexityAPI: PerplexityAPI) {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Testing codeIt connection...",
      cancellable: false,
    },
    async () => {
      try {
        const isConnected = await perplexityAPI.testConnection();

        if (isConnected) {
          vscode.window.showInformationMessage(
            "✅ codeIt connection successful!"
          );
        } else {
          vscode.window.showErrorMessage(
            "❌ Failed to connect to Perplexity API. Please check your API key."
          );
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Connection test failed: ${error.message}`
        );
      }
    }
  );
}

async function handleUndoCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }

  const success = await PatchEngine.undoLastPatch(editor);
  if (!success) {
    vscode.window.showInformationMessage(
      "No codeIt changes to undo in this file."
    );
  }
}

async function getWorkspaceFiles(): Promise<string[]> {
  if (!vscode.workspace.workspaceFolders) {
    return [];
  }

  try {
    const files = await vscode.workspace.findFiles(
      "**/*.{js,ts,jsx,tsx,py,java,cpp,c,cs,php,rb,go,rs}",
      "**/node_modules/**",
      100
    );
    return files.map((file) => vscode.workspace.asRelativePath(file));
  } catch (error) {
    return [];
  }
}

function getLanguageFromPath(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase();
  const languageMap: { [key: string]: string } = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    java: "java",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    go: "go",
    rs: "rust",
  };
  return languageMap[extension || ""] || "text";
}

function getSurroundingContext(
  editor: vscode.TextEditor,
  selection: vscode.Selection
): string {
  const document = editor.document;
  const startLine = Math.max(0, selection.start.line - 5);
  const endLine = Math.min(document.lineCount - 1, selection.end.line + 5);

  let context = "";
  for (let i = startLine; i <= endLine; i++) {
    if (i < selection.start.line || i > selection.end.line) {
      context += document.lineAt(i).text + "\n";
    }
  }

  return context.trim();
}

async function updateStatusBar(
  statusBarItem: vscode.StatusBarItem,
  configManager: ConfigManager
) {
  try {
    const summary = await configManager.getConfigSummary();
    statusBarItem.tooltip = `codeIt AI Assistant\n${summary}`;
  } catch (error) {
    // Fallback if getConfigSummary fails
    statusBarItem.tooltip = "codeIt AI Assistant - Click to start chat";
  }
}

export function deactivate() {
  // Clean up resources
  PatchEngine.clearHistory();
}
