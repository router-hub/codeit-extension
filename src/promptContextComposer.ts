import { FileMatch } from "./smartFileResolver";
import { PromptBuilder, CodeContext, PromptConfig } from "./promptBuilder";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export interface ComposerOptions {
  maxFilesToInclude: number;
  includeFullFileContent: boolean;
  maxContentLines: number;
  includeRelatedFiles: boolean;
  generateBoundaries: boolean;
}

export interface ComposedPromptContext {
  systemPrompt: string;
  userPrompt: string;
  targetFiles: FileMatch[];
  additionalContext: string[];
  estimatedTokens: number;
}

export class PromptContextComposer {
  private static instance: PromptContextComposer;
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel(
      "codeIt Context Composer"
    );
  }

  static getInstance(): PromptContextComposer {
    if (!PromptContextComposer.instance) {
      PromptContextComposer.instance = new PromptContextComposer();
    }
    return PromptContextComposer.instance;
  }

  private log(message: string, level: "info" | "warn" | "error" = "info") {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [PromptContextComposer] ${message}`;

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

  async composePromptContext(
    instruction: string,
    fileMatches: FileMatch[],
    options: Partial<ComposerOptions> = {}
  ): Promise<ComposedPromptContext> {
    const finalOptions: ComposerOptions = {
      maxFilesToInclude: 3,
      includeFullFileContent: true,
      maxContentLines: 500,
      includeRelatedFiles: true,
      generateBoundaries: true,
      ...options,
    };

    this.log(`Composing prompt context for: "${instruction}"`);
    this.log(`Processing ${fileMatches.length} file matches`);

    // Select top files to include
    const targetFiles = fileMatches.slice(0, finalOptions.maxFilesToInclude);
    this.log(`Selected ${targetFiles.length} target files`);

    // Build context for each target file
    const fileContexts: CodeContext[] = [];
    const additionalContext: string[] = [];

    for (const match of targetFiles) {
      try {
        const fileContent = fs.readFileSync(match.file.path, "utf8");
        const language = match.file.language;

        // Create structured code context
        const codeContext: CodeContext = {
          selectedCode: finalOptions.includeFullFileContent
            ? this.truncateContent(fileContent, finalOptions.maxContentLines)
            : this.extractRelevantSections(fileContent, instruction, language),
          userInstruction: instruction,
          filePath: match.file.path,
          language: language,
          fileContent: fileContent,
          imports: match.file.imports,
          // Add additional context files as related summaries
          additionalFiles: this.buildAdditionalFilesContext(
            fileMatches.slice(finalOptions.maxFilesToInclude)
          ),
        };

        fileContexts.push(codeContext);

        this.log(`Built context for ${match.file.relativePath} (${language})`);
      } catch (error: any) {
        this.log(
          `Failed to read file ${match.file.path}: ${error.message}`,
          "error"
        );
        additionalContext.push(
          `Failed to load: ${match.file.relativePath} - ${error.message}`
        );
      }
    }

    // Generate composed prompt
    const composedContext = await this.generateComposedPrompt(
      instruction,
      fileContexts,
      finalOptions
    );

    const estimatedTokens = this.estimateTokenCount(
      composedContext.systemPrompt + composedContext.userPrompt
    );

    this.log(
      `Generated composed prompt with ~${estimatedTokens} estimated tokens`
    );

    return {
      systemPrompt: composedContext.systemPrompt,
      userPrompt: composedContext.userPrompt,
      targetFiles,
      additionalContext,
      estimatedTokens,
    };
  }

  private async generateComposedPrompt(
    instruction: string,
    fileContexts: CodeContext[],
    options: ComposerOptions
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    // Build enhanced system prompt
    const promptConfig: PromptConfig = {
      includeWorkspaceContext: true,
      includeGitContext: false,
      maxContextLines: options.maxContentLines,
      responseStyle: "minimal",
      toolUsage: true,
      structuredFormat: true,
      includeBoundaries: options.generateBoundaries,
      includeFileSummaries: options.includeRelatedFiles,
      maxSummaryFiles: 5,
      // New advanced configuration
      useMarkdownSections: true,
      enableTokenOptimization: true,
      maxTokens: 100,
      prioritizePrecision: true,
      includeFileMetadata: true,
      generateScopedInstructions: true,
    };

    const systemPrompt = PromptBuilder.buildSystemPrompt(promptConfig);

    // Build comprehensive user prompt
    let userPrompt = `## Multi-File Context Analysis\n\n`;
    userPrompt += `**Task:** ${instruction}\n\n`;

    // Add each file context
    for (let i = 0; i < fileContexts.length; i++) {
      const context = fileContexts[i];
      const fileNumber = i + 1;

             userPrompt += `### File ${fileNumber}: ${path.basename(
         context.filePath
       )}\n`;
       userPrompt += `**Path:** \`${vscode.workspace.asRelativePath(
         context.filePath
       )}\`\n`;
       userPrompt += `**Language:** ${context.language}\n`;
       userPrompt += `**Line Numbers:** Lines 1-${context.fileContent.split('\n').length}\n\n`;

      // Extract and include structured context
      const structuredPrompt = PromptBuilder.buildStructuredUserPrompt(
        context,
        promptConfig
      );
      userPrompt += structuredPrompt + "\n\n";

      userPrompt += `---\n\n`;
    }

    // Add task boundaries
    if (options.generateBoundaries) {
      userPrompt += `### Task Boundaries:\n`;
      userPrompt += `- Only modify the files identified above\n`;
      userPrompt += `- Maintain existing code style and patterns\n`;
      userPrompt += `- Preserve imports and exports unless specifically requested to change them\n`;
      userPrompt += `- Apply changes consistently across all relevant files\n`;
      userPrompt += `- Test the changes to ensure they don't break existing functionality\n\n`;
    }

    // Add final task clarification
    userPrompt += `### Final Task:\n${instruction}\n\n`;
    userPrompt += `Please provide the modified code for each file that needs changes. `;
    userPrompt += `Use clear file headers and maintain the existing structure.\n\n`;
         userPrompt += `## 📝 CRITICAL: Line Number Accuracy\n`;
     userPrompt += `⚠️ IMPORTANT: You MUST use the EXACT line numbers shown in the code blocks above!\n`;
     userPrompt += `When making changes, please specify line numbers in your response:\n`;
     userPrompt += `- Use format: \`### File: filename.ext (lines X-Y)\` for specific line ranges\n`;
     userPrompt += `- Use format: \`### File: filename.ext (line X)\` for single line changes\n`;
     userPrompt += `- ALWAYS use the line numbers shown in the code blocks (e.g., "1: ", "2: ", etc.)\n`;
     userPrompt += `- NEVER guess or estimate line numbers - use ONLY the numbers provided\n`;
     userPrompt += `- Always specify the exact filename when referencing line numbers\n`;
     userPrompt += `- Line numbers are 1-based and match the numbers in the code blocks\n`;
     userPrompt += `- If adding new code, specify where to insert it with line numbers\n`;
     userPrompt += `- For function documentation, include the function name and line numbers\n`;
     userPrompt += `- Examples:\n`;
     userPrompt += `  - \`### File: App.jsx (lines 15-25)\` - Replace lines 15-25 in App.jsx\n`;
     userPrompt += `  - \`### File: main.js (line 42)\` - Replace line 42 in main.js\n`;
     userPrompt += `  - \`### File: utils.js (lines 10-15)\` - Replace lines 10-15 in utils.js\n\n`;
     userPrompt += `## 🔧 Function Documentation Format:\n`;
     userPrompt += `When adding function documentation:\n`;
     userPrompt += `- Use JSDoc format: \`/**\` ... \`*/\`\n`;
     userPrompt += `- Include function name in the first line: \`* functionName - description\`\n`;
     userPrompt += `- Specify parameters with \`@param\` tags\n`;
     userPrompt += `- Specify return values with \`@returns\` tags\n`;
     userPrompt += `- For function documentation, you can omit line numbers - the system will find the function automatically\n`;
     userPrompt += `- Example:\n`;
     userPrompt += `\`\`\`javascript\n`;
     userPrompt += `/**\n`;
     userPrompt += ` * handleOpenFile - Opens a file using the Electron API\n`;
     userPrompt += ` * @returns {Promise<void>}\n`;
     userPrompt += ` */\n`;
     userPrompt += `\`\`\`\n\n`;
     userPrompt += `## ⚠️ LINE NUMBER VALIDATION:\n`;
     userPrompt += `- The system will validate your line numbers against the actual file content\n`;
     userPrompt += `- If line numbers seem incorrect, the system will log a warning\n`;
     userPrompt += `- For function documentation, line numbers are optional - the system will auto-detect the function location\n`;
     userPrompt += `- Always double-check that your line numbers match the content you're providing\n\n`;
     userPrompt += `This helps the system apply changes precisely without replacing entire files.`;

    return { systemPrompt, userPrompt };
  }

  private truncateContent(content: string, maxLines: number): string {
    const lines = content.split("\n");
    if (lines.length <= maxLines) {
      return content;
    }

    return (
      lines.slice(0, maxLines).join("\n") +
      `\n\n// ... (${lines.length - maxLines} more lines truncated)`
    );
  }

  private extractRelevantSections(
    content: string,
    instruction: string,
    language: string
  ): string {
    // Extract relevant code sections based on instruction
    const lines = content.split("\n");
    const relevantLines: string[] = [];

    // Extract identifiers from instruction
    const identifiers = this.extractIdentifiersFromInstruction(instruction);

    // Find lines that contain relevant identifiers
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineContainsIdentifier = identifiers.some((id) =>
        line.toLowerCase().includes(id.toLowerCase())
      );

      if (lineContainsIdentifier) {
        // Include context around the relevant line
        const start = Math.max(0, i - 5);
        const end = Math.min(lines.length, i + 5);

        for (let j = start; j <= end; j++) {
          if (!relevantLines.includes(lines[j])) {
            relevantLines.push(lines[j]);
          }
        }
      }
    }

    // If no specific relevance found, return top portion of file
    if (relevantLines.length === 0) {
      return this.truncateContent(content, 100);
    }

    return relevantLines.join("\n");
  }

  private extractIdentifiersFromInstruction(instruction: string): string[] {
    const identifiers: string[] = [];

    // Extract class names, function names, etc.
    const patterns = [
      /\b[A-Z][a-zA-Z0-9]*\b/g, // PascalCase
      /\b[a-z][a-zA-Z0-9]*\b/g, // camelCase
      /\b[a-z_][a-z0-9_]*\b/g, // snake_case
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(instruction)) !== null) {
        if (match[0].length > 2) {
          identifiers.push(match[0]);
        }
      }
    }

    return [...new Set(identifiers)];
  }

  private buildAdditionalFilesContext(
    additionalMatches: FileMatch[]
  ): Array<{ name: string; path: string; content: string }> {
    const additionalFiles: Array<{
      name: string;
      path: string;
      content: string;
    }> = [];

    for (const match of additionalMatches.slice(0, 5)) {
      // Limit to 5 additional files
      try {
        // Include only file summary, not full content
        const summary = this.createFileSummary(match.file);
        additionalFiles.push({
          name: path.basename(match.file.path),
          path: match.file.relativePath,
          content: summary,
        });
      } catch (error) {
        // Skip files we can't process
      }
    }

    return additionalFiles;
  }

  private createFileSummary(fileIndex: any): string {
    let summary = `${fileIndex.language} file with ${fileIndex.lineCount} lines.\n`;

    if (fileIndex.classes.length > 0) {
      summary += `Classes: ${fileIndex.classes.join(", ")}\n`;
    }

    if (fileIndex.functions.length > 0) {
      summary += `Functions: ${fileIndex.functions.slice(0, 10).join(", ")}`;
      if (fileIndex.functions.length > 10) {
        summary += ` (and ${fileIndex.functions.length - 10} more)`;
      }
      summary += "\n";
    }

    if (fileIndex.exports.length > 0) {
      summary += `Exports: ${fileIndex.exports.join(", ")}\n`;
    }

    if (fileIndex.imports.length > 0) {
      summary += `Key imports: ${fileIndex.imports.slice(0, 5).join(", ")}`;
      if (fileIndex.imports.length > 5) {
        summary += ` (and ${fileIndex.imports.length - 5} more)`;
      }
    }

    return summary;
  }

  private estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  showDebugOutput() {
    this.outputChannel.show();
  }
}
