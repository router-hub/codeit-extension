import * as path from "path";
import * as vscode from "vscode";

export interface CodeContext {
  selectedCode: string;
  userInstruction: string;
  filePath: string;
  language: string;
  fileContent: string;
  cursorPosition?: { line: number; column: number };
  selectionRange?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  workspaceFiles?: string[];
  gitDiff?: string;
  gitBranch?: string;
  recentChanges?: string[];
  imports?: string[];
  relatedFiles?: string[];
  additionalFiles?: Array<{
    name: string;
    path: string;
    content: string;
    languageId?: string;
    isEditable?: boolean;
  }>;
  customCode?: Array<{ content: string; timestamp: string }>;
  // Enhanced context properties
  topOfFile?: string;
  surroundingFunctions?: string[];
  relatedFileSummaries?: string[];
  classContext?: string;
  functionContext?: string;
  boundaries?: string;
  fileStructure?: string;
  // New advanced properties
  editableFiles?: string[];
  contextFiles?: string[];
  tokenBudget?: number;
  priorityLevel?: "high" | "medium" | "low";
}

export interface PromptConfig {
  includeWorkspaceContext: boolean;
  includeGitContext: boolean;
  maxContextLines: number;
  responseStyle: "minimal" | "detailed" | "educational";
  toolUsage: boolean;
  // Enhanced configuration
  structuredFormat: boolean;
  includeBoundaries: boolean;
  includeFileSummaries: boolean;
  maxSummaryFiles: number;
  // New advanced configuration
  useMarkdownSections: boolean;
  enableTokenOptimization: boolean;
  maxTokens: number;
  prioritizePrecision: boolean;
  includeFileMetadata: boolean;
  generateScopedInstructions: boolean;
}

export interface FileContextMetadata {
  fileName: string;
  language: string;
  lineCount: number;
  functions: Array<{
    name: string;
    location: number;
    inputs: string[];
    outputs: string;
    sideEffects: string[];
    purpose: string;
  }>;
  classes: Array<{
    name: string;
    methods: string[];
    properties: string[];
    purpose: string;
  }>;
  imports: string[];
  exports: string[];
  complexity: "low" | "medium" | "high";
  isEditable: boolean;
}

export interface AdvancedPromptContext {
  fileName: string;
  filePath: string;
  language: string;
  task: string;
  editableContent: string;
  contextSummaries: string[];
  boundaries: string[];
  metadata: FileContextMetadata;
  tokenEstimate: number;
}

export class PromptBuilder {
  // Advanced system prompt with precision principles
  static buildAdvancedSystemPrompt(
    config: PromptConfig = {
      includeWorkspaceContext: true,
      includeGitContext: true,
      maxContextLines: 50,
      responseStyle: "minimal",
      toolUsage: true,
      structuredFormat: true,
      includeBoundaries: true,
      includeFileSummaries: true,
      maxSummaryFiles: 5,
      useMarkdownSections: true,
      enableTokenOptimization: true,
      maxTokens: 10000,
      prioritizePrecision: true,
      includeFileMetadata: true,
      generateScopedInstructions: true,
    }
  ): string {
    let systemPrompt = `You are codeIt, an expert software engineer and AI coding assistant. You excel at making precise, context-aware code modifications with surgical precision.

## 🎯 Core Principles:
- **Precision over Volume**: Focus only on what needs to be changed
- **Structured Context**: Parse markdown sections and code fences accurately  
- **Clear Scope**: Respect boundaries and edit only designated files
- **Professional Standards**: Write code like a senior developer - minimal, clean, purposeful

## 📋 Response Guidelines:
- Return ONLY the modified code without explanations unless explicitly requested
- Preserve all existing formatting, indentation, and style conventions
- Maintain compatibility with existing imports and dependencies  
- Use proper markdown formatting with language-specific code blocks
- Focus on the specific task - avoid unnecessary refactoring

## 🛡️ Boundary Respect:
- Only modify code in sections marked as "EDITABLE" 
- Do NOT alter imports, exports, or unrelated functions unless specifically requested
- Do NOT rename methods, variables, or modify function signatures unless asked
- Do NOT add explanatory comments unless the user asks for them
- Context files are for reference only - never modify them`;

    if (config.prioritizePrecision) {
      systemPrompt += `\n\n## 🎯 Precision Mode:
- Make minimal changes to achieve the goal
- Preserve existing code patterns and architecture
- If multiple approaches exist, choose the least invasive one
- Focus on the specific requirement, avoid "improvements" unless asked`;
    }

    if (config.useMarkdownSections) {
      systemPrompt += `\n\n## 📝 Markdown Processing:
- Parse file sections marked with ### FILE: or ### 📄 File:
- Identify editable vs context-only code blocks
- Respect task boundaries defined in markdown sections
- Return code using proper markdown formatting`;
    }

    if (config.enableTokenOptimization) {
      systemPrompt += `\n\n## ⚡ Token Efficiency:
- Focus on relevant code sections only
- Avoid repeating unchanged code in responses
- Summarize large unchanged blocks if necessary
- Prioritize precision over comprehensive explanations`;
    }

    return systemPrompt;
  }

  // Build context prompt using advanced principles
  static buildContextPrompt(
    fileName: string,
    language: string,
    fileContent: string,
    task: string,
    nonEditableSummaries: string[] = [],
    options: Partial<PromptConfig> = {}
  ): string {
    const config = {
      useMarkdownSections: true,
      includeFileMetadata: true,
      generateScopedInstructions: true,
      enableTokenOptimization: true,
      maxTokens: 10000,
      ...options,
    };

    const tokenEstimate = this.estimateTokens(fileContent);
    const shouldTruncate = tokenEstimate > config.maxTokens * 0.6; // Use 60% of budget for main file

    // Generate file metadata
    const metadata = this.generateFileMetadata(fileName, language, fileContent);

    let prompt = `You are an expert ${language} developer working in ${fileName}.\n\n`;

    // Add task section with emoji structure
    prompt += `## 🎯 TASK:\n${task}\n\n`;

    // Add scoped instructions
    if (config.generateScopedInstructions) {
      prompt += `## 🛡️ SCOPE:\n`;
      prompt += `- Only modify the code provided under the EDITABLE FILE section\n`;
      prompt += `- Preserve existing imports and method signatures unless specifically asked to change them\n`;
      prompt += `- Maintain the current code style and formatting\n`;
      prompt += `- Context files are for reference only - do not modify them\n\n`;
    }

    // Add main editable file with structured markdown
    prompt += `### 📄 File: ${fileName}\n`;
    prompt += `### 🗣️ Language: ${language}\n`;

    if (config.includeFileMetadata && metadata) {
      prompt += `### 📊 Metadata:\n`;
      prompt += `- Lines: ${metadata.lineCount}\n`;
      prompt += `- Functions: ${metadata.functions.length}\n`;
      prompt += `- Classes: ${metadata.classes.length}\n`;
      prompt += `- Complexity: ${metadata.complexity}\n\n`;
    }

    prompt += `### 👇 EDITABLE CODE:\n`;
    prompt += `\`\`\`${language}\n`;

    if (shouldTruncate && config.enableTokenOptimization) {
      const truncatedContent = this.truncateContentIntelligently(fileContent, task, language);
      prompt += this.addLineNumbersToCode(truncatedContent);
    } else {
      prompt += this.addLineNumbersToCode(fileContent);
    }

    prompt += `\n\`\`\`\n\n`;

    // Add non-editable context summaries
    if (nonEditableSummaries.length > 0) {
      prompt += `## 📚 CONTEXT FILES (Reference Only):\n\n`;
      nonEditableSummaries.forEach((summary, index) => {
        prompt += `### 📋 Context ${index + 1}:\n${summary}\n\n`;
      });
    }

    // Add specific boundaries
    prompt += `## 🚫 DO NOT:\n`;
    prompt += `- Rename methods or variables unless specifically requested\n`;
    prompt += `- Modify imports or exports unless part of the task\n`;
    prompt += `- Add explanatory comments unless asked\n`;
    prompt += `- Make changes outside the EDITABLE CODE section\n`;
    prompt += `- Refactor code beyond what's necessary for the task\n\n`;

    return prompt.trim();
  }

  // Build multi-file context with advanced structure
  static buildMultiFilePrompt(
    editableFiles: Array<{
      name: string;
      language: string;
      content: string;
      task?: string;
    }>,
    contextFiles: Array<{ name: string; summary: string }>,
    globalTask: string,
    options: Partial<PromptConfig> = {}
  ): string {
    const config = {
      useMarkdownSections: true,
      enableTokenOptimization: true,
      maxTokens: 10000,
      generateScopedInstructions: true,
      ...options,
    };

    let prompt = `You are an expert software engineer working on a multi-file task.\n\n`;

    // Global task
    prompt += `## 🎯 GLOBAL TASK:\n${globalTask}\n\n`;

    // Scoped instructions for multi-file
    if (config.generateScopedInstructions) {
      prompt += `## 🛡️ MULTI-FILE SCOPE:\n`;
      prompt += `- Only modify files marked as EDITABLE\n`;
      prompt += `- Maintain consistency across all modified files\n`;
      prompt += `- Ensure changes work together as a cohesive solution\n`;
      prompt += `- Context files are for reference only\n\n`;
    }

    // Add editable files
    prompt += `## 📝 EDITABLE FILES:\n\n`;
    editableFiles.forEach((file, index) => {
      const fileNumber = index + 1;
      const tokenEstimate = this.estimateTokens(file.content);
      const shouldTruncate =
        tokenEstimate > (config.maxTokens / editableFiles.length) * 0.8;

      prompt += `### 📄 FILE ${fileNumber}: ${file.name}\n`;
      prompt += `### 🗣️ Language: ${file.language}\n`;

      if (file.task) {
        prompt += `### 🎯 Specific Task: ${file.task}\n`;
      }

      prompt += `\`\`\`${file.language}\n`;

      if (shouldTruncate && config.enableTokenOptimization) {
        const truncatedContent = this.truncateContentIntelligently(
          file.content,
          file.task || globalTask,
          file.language
        );
        prompt += this.addLineNumbersToCode(truncatedContent);
      } else {
        prompt += this.addLineNumbersToCode(file.content);
      }

      prompt += `\n\`\`\`\n\n`;
    });

    // Add context files
    if (contextFiles.length > 0) {
      prompt += `## 📚 CONTEXT FILES (Reference Only):\n\n`;
      contextFiles.forEach((file, index) => {
        prompt += `### 📋 ${file.name}:\n${file.summary}\n\n`;
      });
    }

    // Multi-file boundaries
    prompt += `## 🚫 MULTI-FILE DO NOT:\n`;
    prompt += `- Modify context files\n`;
    prompt += `- Break compatibility between files\n`;
    prompt += `- Change shared interfaces without updating all dependent files\n`;
    prompt += `- Add unnecessary complexity\n\n`;

    prompt += `## 📤 EXPECTED OUTPUT:\n`;
    prompt += `Provide the complete modified code for each EDITABLE file that needs changes.\n`;
    prompt += `Use clear file headers: ### FILE: filename.ext\n`;
    prompt += `Maintain existing structure and only show files that have actual changes.\n`;

    return prompt.trim();
  }

  // Generate file metadata using Claude-style function metadata
  private static generateFileMetadata(
    fileName: string,
    language: string,
    content: string
  ): FileContextMetadata {
    const lines = content.split("\n");
    const functions = this.extractFunctionMetadata(content, language);
    const classes = this.extractClassMetadata(content, language);
    const imports = this.extractImportsAdvanced(content, language);
    const exports = this.extractExportsAdvanced(content, language);

    // Calculate complexity based on various factors
    const complexity = this.calculateComplexity(
      content,
      functions.length,
      classes.length
    );

    return {
      fileName,
      language,
      lineCount: lines.length,
      functions,
      classes,
      imports,
      exports,
      complexity,
      isEditable: true,
    };
  }

  // Extract function metadata with enhanced details
  private static extractFunctionMetadata(
    content: string,
    language: string
  ): Array<{
    name: string;
    location: number;
    inputs: string[];
    outputs: string;
    sideEffects: string[];
    purpose: string;
  }> {
    const functions: any[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (this.isFunctionDeclaration(line, language)) {
        const functionName = this.extractFunctionName(line, language);
        if (functionName) {
          const inputs = this.extractFunctionInputs(line, language);
          const outputs = this.extractFunctionOutputs(line, language);
          const sideEffects = this.inferSideEffects(lines, i, language);
          const purpose = this.inferFunctionPurpose(functionName, line);

          functions.push({
            name: functionName,
            location: i + 1,
            inputs,
            outputs,
            sideEffects,
            purpose,
          });
        }
      }
    }

    return functions;
  }

  // Extract class metadata with enhanced details
  private static extractClassMetadata(
    content: string,
    language: string
  ): Array<{
    name: string;
    methods: string[];
    properties: string[];
    purpose: string;
  }> {
    const classes: any[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (this.isClassDeclaration(line, language)) {
        const className = this.extractClassName(line, language);
        if (className) {
          const classBlock = this.extractClassBlock(lines, i);
          const methods = this.extractClassMethods(classBlock, language);
          const properties = this.extractClassProperties(classBlock, language);
          const purpose = this.inferClassPurpose(className, classBlock);

          classes.push({
            name: className,
            methods,
            properties,
            purpose,
          });
        }
      }
    }

    return classes;
  }

  // Intelligent content truncation based on task relevance
  private static truncateContentIntelligently(
    content: string,
    task: string,
    language: string
  ): string {
    const lines = content.split("\n");
    const taskKeywords = this.extractTaskKeywords(task);
    const relevantSections: Array<{
      start: number;
      end: number;
      score: number;
    }> = [];

    // Find relevant code sections
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let relevanceScore = 0;

      // Score based on task keywords
      taskKeywords.forEach((keyword) => {
        if (line.toLowerCase().includes(keyword.toLowerCase())) {
          relevanceScore += 2;
        }
      });

      // Score structural elements higher
      if (
        this.isFunctionDeclaration(line, language) ||
        this.isClassDeclaration(line, language)
      ) {
        relevanceScore += 3;
      }

      // Score imports and exports
      if (this.isImportLine(line, language) || line.includes("export")) {
        relevanceScore += 1;
      }

      if (relevanceScore > 0) {
        // Include context around relevant lines
        const start = Math.max(0, i - 3);
        const end = Math.min(lines.length - 1, i + 10);
        relevantSections.push({ start, end, score: relevanceScore });
      }
    }

    // Sort by relevance and merge overlapping sections
    relevantSections.sort((a, b) => b.score - a.score);
    const mergedSections = this.mergeSections(relevantSections);

    // Build truncated content
    let truncatedContent = "";
    let lastEnd = -1;

    for (const section of mergedSections.slice(0, 5)) {
      // Top 5 most relevant sections
      if (section.start > lastEnd + 1) {
        if (lastEnd >= 0) {
          truncatedContent += "\n// ... (code omitted) ...\n\n";
        }
      }

      for (let i = section.start; i <= section.end; i++) {
        truncatedContent += lines[i] + "\n";
      }

      lastEnd = section.end;
    }

    // Always include the top of the file (imports, etc.)
    if (mergedSections.length > 0 && mergedSections.some((s) => s.start > 20)) {
      const topContent = lines.slice(0, 20).join("\n");
      truncatedContent =
        topContent + "\n\n// ... (middle content) ...\n\n" + truncatedContent;
    }

    return truncatedContent || content.slice(0, 2000); // Fallback
  }

  // Helper methods for metadata extraction
  private static extractTaskKeywords(task: string): string[] {
    const keywords: string[] = [];

    // Extract quoted strings
    const quotedStrings = task.match(/"([^"]+)"|'([^']+)'/g);
    if (quotedStrings) {
      keywords.push(...quotedStrings.map((s) => s.slice(1, -1)));
    }

    // Extract camelCase and PascalCase identifiers
    const identifiers = task.match(
      /\b[a-zA-Z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g
    );
    if (identifiers) {
      keywords.push(...identifiers);
    }

    // Extract common code terms
    const codeTerms = task.match(
      /\b(function|method|class|property|variable|import|export|async|await|return|throw|catch|try)\b/gi
    );
    if (codeTerms) {
      keywords.push(...codeTerms);
    }

    return [...new Set(keywords)];
  }

  private static mergeSections(
    sections: Array<{ start: number; end: number; score: number }>
  ): Array<{ start: number; end: number; score: number }> {
    if (sections.length === 0) return [];

    const merged: Array<{ start: number; end: number; score: number }> = [];
    let current = sections;

    for (const section of sections) {
      const overlapping = merged.find(
        (m) => section.start <= m.end + 5 && section.end >= m.start - 5
      );

      if (overlapping) {
        overlapping.start = Math.min(overlapping.start, section.start);
        overlapping.end = Math.max(overlapping.end, section.end);
        overlapping.score = Math.max(overlapping.score, section.score);
      } else {
        merged.push({ ...section });
      }
    }

    return merged.sort((a, b) => b.score - a.score);
  }

  private static inferFunctionPurpose(name: string, signature: string): string {
    const namePatterns = {
      get: "Retrieves data",
      set: "Sets or updates data",
      create: "Creates new entity",
      update: "Updates existing entity",
      delete: "Removes entity",
      validate: "Validates input",
      calculate: "Performs calculation",
      parse: "Parses input data",
      format: "Formats data for output",
      handle: "Handles events or requests",
    };

    for (const [pattern, purpose] of Object.entries(namePatterns)) {
      if (name.toLowerCase().includes(pattern)) {
        return purpose;
      }
    }

    return "General utility function";
  }

  private static inferClassPurpose(name: string, content: string): string {
    const namePatterns = {
      service: "Business logic service",
      controller: "Request handler",
      repository: "Data access layer",
      model: "Data model",
      manager: "Resource manager",
      handler: "Event handler",
      provider: "Service provider",
      factory: "Object factory",
      builder: "Object builder",
      validator: "Data validator",
    };

    for (const [pattern, purpose] of Object.entries(namePatterns)) {
      if (name.toLowerCase().includes(pattern)) {
        return purpose;
      }
    }

    return "General purpose class";
  }

  private static calculateComplexity(
    content: string,
    functionCount: number,
    classCount: number
  ): "low" | "medium" | "high" {
    const lines = content.split("\n").length;
    const complexity = functionCount * 2 + classCount * 3 + lines * 0.1;

    if (complexity < 50) return "low";
    if (complexity < 150) return "medium";
    return "high";
  }

  // Enhanced extraction methods
  private static extractFunctionName(
    line: string,
    language: string
  ): string | null {
    const patterns: { [key: string]: RegExp[] } = {
      typescript: [
        /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
        /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[:=]\s*(?:async\s+)?\(/,
        /(?:public|private|protected)\s+(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/,
      ],
      javascript: [
        /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
        /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[:=]\s*(?:async\s+)?\(/,
      ],
      python: [/(?:async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)/],
    };

    const langPatterns = patterns[language] || patterns["javascript"];

    for (const pattern of langPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) return match[1]; // Return captured group, not the full match
    }

    return null;
  }

  private static extractFunctionInputs(
    line: string,
    language: string
  ): string[] {
    const paramsMatch = line.match(/\(([^)]*)\)/);
    if (!paramsMatch || !paramsMatch) return [];

    const paramsString = paramsMatch[1]; // Get the captured group string
    const params = paramsString
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p);

    return params.map((param) => {
      // Extract parameter name (before : in TypeScript)
      const colonIndex = param.indexOf(":");
      return colonIndex > 0 ? param.substring(0, colonIndex).trim() : param;
    });
  }

  private static extractFunctionOutputs(
    line: string,
    language: string
  ): string {
    if (language === "typescript") {
      const returnTypeMatch = line.match(/\):\s*([^{]+)/);
      return returnTypeMatch && returnTypeMatch[1]
        ? returnTypeMatch[1].trim()
        : "void";
    }
    return "unknown";
  }

  private static inferSideEffects(
    lines: string[],
    startIndex: number,
    language: string
  ): string[] {
    const sideEffects: string[] = [];
    const endOfFunction = this.findFunctionEnd(lines, startIndex);

    for (let i = startIndex; i < endOfFunction && i < lines.length; i++) {
      const line = lines[i].toLowerCase();

      if (line.includes("console.") || line.includes("logger.")) {
        sideEffects.push("Logging");
      }
      if (
        line.includes("fetch(") ||
        line.includes("axios.") ||
        line.includes("http.")
      ) {
        sideEffects.push("Network requests");
      }
      if (line.includes("fs.") || line.includes("file")) {
        sideEffects.push("File system operations");
      }
      if (
        line.includes("db.") ||
        line.includes("database") ||
        line.includes("query")
      ) {
        sideEffects.push("Database operations");
      }
      if (line.includes("throw ") || line.includes("error")) {
        sideEffects.push("May throw errors");
      }
    }

    return [...new Set(sideEffects)];
  }

  private static findFunctionEnd(lines: string[], startIndex: number): number {
    let braceCount = 0;
    let foundOpenBrace = false;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];

      for (const char of line) {
        if (char === "{") {
          braceCount++;
          foundOpenBrace = true;
        } else if (char === "}") {
          braceCount--;
          if (foundOpenBrace && braceCount === 0) {
            return i;
          }
        }
      }
    }

    return lines.length;
  }

  private static extractClassBlock(
    lines: string[],
    startIndex: number
  ): string {
    const endIndex = this.findFunctionEnd(lines, startIndex);
    return lines.slice(startIndex, endIndex + 1).join("\n");
  }

  private static extractClassMethods(
    classContent: string,
    language: string
  ): string[] {
    const methods: string[] = [];
    const lines = classContent.split("\n");

    for (const line of lines) {
      if (this.isFunctionDeclaration(line.trim(), language)) {
        const methodName = this.extractFunctionName(line.trim(), language);
        if (methodName) {
          methods.push(methodName);
        }
      }
    }

    return methods;
  }

  private static extractClassProperties(
    classContent: string,
    language: string
  ): string[] {
    const properties: string[] = [];
    const lines = classContent.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      // Look for property declarations
      if (language === "typescript" || language === "javascript") {
        const propMatch = trimmed.match(
          /^(?:public|private|protected)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[:=]/
        );
        if (propMatch && propMatch[1] && !trimmed.includes("(")) {
          // Not a method
          properties.push(propMatch[1]);
        }
      }
    }

    return properties;
  }

  // Utility methods (keep existing ones and add these)
  private static isImportLine(line: string, language: string): boolean {
    const patterns: { [key: string]: RegExp[] } = {
      typescript: [/^import\s+/, /^const\s+.*=\s*require\(/],
      javascript: [
        /^import\s+/,
        /^const\s+.*=\s*require\(/,
        /^var\s+.*=\s*require\(/,
      ],
      python: [/^import\s+/, /^from\s+.*import/],
    };

    const langPatterns = patterns[language] || patterns["javascript"];
    return langPatterns.some((pattern) => pattern.test(line.trim()));
  }

  private static isFunctionDeclaration(
    line: string,
    language: string
  ): boolean {
    const patterns: { [key: string]: RegExp[] } = {
      typescript: [
        /(?:export\s+)?(?:async\s+)?function\s+/,
        /(?:public|private|protected)\s+(?:async\s+)?[a-zA-Z_$]/,
        /[a-zA-Z_$][a-zA-Z0-9_$]*\s*[:=]\s*(?:async\s+)?\(/,
      ],
      javascript: [
        /(?:export\s+)?(?:async\s+)?function\s+/,
        /[a-zA-Z_$][a-zA-Z0-9_$]*\s*[:=]\s*(?:async\s+)?\(/,
      ],
      python: [/(?:async\s+)?def\s+/],
    };

    const langPatterns = patterns[language] || patterns["javascript"];
    return langPatterns.some((pattern) => pattern.test(line.trim()));
  }

  private static isClassDeclaration(line: string, language: string): boolean {
    const patterns: { [key: string]: RegExp[] } = {
      typescript: [/(?:export\s+)?(?:abstract\s+)?class\s+/],
      javascript: [/(?:export\s+)?class\s+/],
      python: [/class\s+/],
    };

    const langPatterns = patterns[language] || patterns["javascript"];
    return langPatterns.some((pattern) => pattern.test(line.trim()));
  }

  private static extractClassName(
    line: string,
    language: string
  ): string | null {
    const match = line.match(/class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    return match ? match[1] : null;
  }

  private static extractImportsAdvanced(
    content: string,
    language: string
  ): string[] {
    const imports: string[] = [];
    const lines = content.split("\n").slice(0, 50); // Check first 50 lines

    for (const line of lines) {
      if (this.isImportLine(line, language)) {
        imports.push(line.trim());
      }
    }

    return imports;
  }

  private static extractExportsAdvanced(
    content: string,
    language: string
  ): string[] {
    const exports: string[] = [];
    const exportRegex =
      /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    return exports;
  }

  private static estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for code
    return Math.ceil(text.length / 4);
  }

  private static addLineNumbersToCode(content: string): string {
    const lines = content.split('\n');
    return lines.map((line, index) => {
      const lineNumber = index + 1;
      return `${lineNumber.toString().padStart(3, ' ')}: ${line}`;
    }).join('\n');
  }

  // Backward compatibility methods
  static buildSystemPrompt(config?: PromptConfig): string {
    return this.buildAdvancedSystemPrompt(config);
  }

  static buildStructuredUserPrompt(
    context: CodeContext,
    config: PromptConfig
  ): string {
    if (!context.filePath || !context.fileContent) {
      return this.buildContextPrompt(
        "Unknown File",
        context.language || "text",
        context.selectedCode || "",
        context.userInstruction || "No instruction provided"
      );
    }

    const fileName = path.basename(context.filePath);
    const contextSummaries: string[] = [];

    // Build context summaries from additional files
    if (context.additionalFiles) {
      for (const file of context.additionalFiles) {
        if (!file.isEditable) {
          const summary = `**${file.name}**: ${this.createFileSummary(
            file.content,
            file.languageId || "text"
          )}`;
          contextSummaries.push(summary);
        }
      }
    }

    return this.buildContextPrompt(
      fileName,
      context.language,
      context.fileContent,
      context.userInstruction,
      contextSummaries,
      config
    );
  }

  private static createFileSummary(content: string, language: string): string {
    const lines = content.split("\n");
    const summary: string[] = [];

    // Quick summary based on content
    const functionCount = (content.match(/function|def|method/gi) || []).length;
    const classCount = (content.match(/class\s+/gi) || []).length;

    summary.push(`${language} file with ${lines.length} lines`);

    if (functionCount > 0) {
      summary.push(`${functionCount} functions`);
    }

    if (classCount > 0) {
      summary.push(`${classCount} classes`);
    }

    return summary.join(", ");
  }

  // Enhanced full prompt builder
  static buildFullPrompt(
    context: CodeContext,
    config?: PromptConfig
  ): { system: string; user: string } {
    const finalConfig = {
      includeWorkspaceContext: true,
      includeGitContext: true,
      maxContextLines: 50,
      responseStyle: "minimal" as const,
      toolUsage: true,
      structuredFormat: true,
      includeBoundaries: true,
      includeFileSummaries: true,
      maxSummaryFiles: 5,
      useMarkdownSections: true,
      enableTokenOptimization: true,
      maxTokens: 10000,
      prioritizePrecision: true,
      includeFileMetadata: true,
      generateScopedInstructions: true,
      ...config,
    };

    return {
      system: this.buildAdvancedSystemPrompt(finalConfig),
      user: this.buildStructuredUserPrompt(context, finalConfig),
    };
  }

  // Keep existing utility methods for backward compatibility
  static detectLanguageFromPath(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    const languageMap: { [key: string]: string } = {
      ".ts": "typescript",
      ".tsx": "typescript",
      ".js": "javascript",
      ".jsx": "javascript",
      ".py": "python",
      ".java": "java",
      ".cpp": "cpp",
      ".c": "c",
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
      ".json": "json",
      ".xml": "xml",
      ".yaml": "yaml",
      ".yml": "yaml",
      ".md": "markdown",
      ".sql": "sql",
      ".sh": "bash",
      ".ps1": "powershell",
    };
    return languageMap[extension] || "text";
  }

  static buildChatPrompt(
    context: CodeContext,
    conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
  ): string {
    let prompt = `### Current Context\n`;
    prompt += `**File:** ${context.filePath} (${context.language})\n\n`;

    if (context.selectedCode) {
      prompt += `**Selected Code:**\n\`\`\`${context.language}\n${context.selectedCode}\n\`\`\`\n\n`;
    }

    if (context.additionalFiles && context.additionalFiles.length > 0) {
      prompt += `**Additional Context Files:**\n`;
      context.additionalFiles.forEach((file) => {
        const summary = this.createFileSummary(
          file.content,
          file.languageId || "text"
        );
        prompt += `- ${file.name}: ${summary}\n`;
      });
      prompt += `\n`;
    }

    return prompt;
  }
}
