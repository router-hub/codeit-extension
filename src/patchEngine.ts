import * as vscode from 'vscode';
import { OutputParser, ParsedOutput, MultiFileChange } from './outputParser';
import { CodeContext, PromptBuilder } from './promptBuilder';

export interface PatchResult {
  success: boolean;
  message: string;
  originalText: string;
  newText: string;
  appliedAt: Date;
  patchType: 'inline' | 'generation' | 'refactor' | 'multifile';
  confidence: number;
  affectedFiles?: string[];
  contextPreserved: boolean;
  metadata?: {
    responseType: string;
    hasAlternatives: boolean;
    syntaxValidated: boolean;
  };
}

export interface PatchOptions {
  autoApply: boolean;
  preserveSelection: boolean;
  showDiff: boolean;
  validateSyntax: boolean;
  trackChanges: boolean;
  timeout?: number;
  showAlternatives?: boolean;
}

export interface PatchHistory {
  id: string;
  timestamp: Date;
  filePath: string;
  originalCode: string;
  newCode: string;
  instruction: string;
  success: boolean;
  confidence: number;
  patchType: string;
}

export class PatchEngine {
  private static patchHistory: PatchHistory[] = [];
  private static maxHistorySize = 50;

static async applyInlinePatch(
  editor: vscode.TextEditor,
  selection: vscode.Selection,
  aiResponse: string,
  context: CodeContext,
  options: PatchOptions = { 
    autoApply: false, 
    preserveSelection: false, 
    showDiff: true, 
    validateSyntax: true, 
    trackChanges: true,
    showAlternatives: false
  }
): Promise<PatchResult> {
  const originalText = editor.document.getText(selection);
  
  // Use the enhanced parser with context
  const parsedOutput = OutputParser.parseAIResponse(aiResponse, {
    originalLanguage: context.language,
    expectMultiFile: false,
    instruction: context.userInstruction
  });
  
  if (!parsedOutput.code) {
    return this.createFailureResult('No valid code found in AI response', originalText);
  }

  // Handle alternatives if available
  if (parsedOutput.alternatives && parsedOutput.alternatives.length > 0 && options.showAlternatives) {
    const selectedCode = await this.showAlternativesDialog(parsedOutput);
    if (!selectedCode) {
      return this.createFailureResult('User cancelled alternative selection', originalText);
    }
    parsedOutput.code = selectedCode;
  }

  const newText = this.processCodeForInlineEdit(parsedOutput.code, originalText, context);
  
  // Use the enhanced confidence from parser
  const confidence = parsedOutput.confidence;

  // Enhanced syntax validation
  if (options.validateSyntax) {
    const syntaxValid = await this.validateSyntax(newText, context.language || 'text');
    if (!syntaxValid) {
      return this.createFailureResult('Generated code has syntax errors', originalText, newText);
    }
  }

  // Enhanced diff preview with metadata
  if (options.showDiff && !options.autoApply) {
    const shouldApply = await this.showEnhancedDiffPreview(originalText, newText, context, parsedOutput);
    if (!shouldApply) {
      return this.createFailureResult('User cancelled the patch application', originalText, newText);
    }
  }

  try {
    const result = await this.applyCodeChange(editor, selection, newText, options);
    
    if (result.success && options.trackChanges) {
      this.addToHistory({
        id: this.generateId(),
        timestamp: new Date(),
        filePath: editor.document.uri.fsPath,
        originalCode: originalText,
        newCode: newText,
        instruction: context.userInstruction,
        success: true,
        confidence: parsedOutput.confidence,
        patchType: parsedOutput.patchType
      });
    }

    return {
      success: result.success,
      message: result.message,
      originalText,
      newText,
      appliedAt: new Date(),
      patchType: parsedOutput.patchType,
      confidence: parsedOutput.confidence,
      contextPreserved: this.checkContextPreservation(originalText, newText, context),
      metadata: {
        responseType: parsedOutput.metadata.responseType,
        hasAlternatives: (parsedOutput.alternatives?.length || 0) > 0,
        syntaxValidated: options.validateSyntax
      }
    };
  } catch (error: any) {
    return this.createFailureResult(`Error applying patch: ${error.message}`, originalText, newText);
  }
}


  static async applyGenerationPatch(
    editor: vscode.TextEditor,
    position: vscode.Position,
    aiResponse: string,
    context: CodeContext,
    options: PatchOptions = { 
      autoApply: false, 
      preserveSelection: false, 
      showDiff: true, 
      validateSyntax: true, 
      trackChanges: true,
      showAlternatives: false
    }
  ): Promise<PatchResult> {
    // Use enhanced parser for generation
    const parsedOutput = OutputParser.parseAIResponse(aiResponse, {
      originalLanguage: context.language,
      expectMultiFile: false,
      instruction: context.userInstruction
    });
    
    if (!parsedOutput.code) {
      return this.createFailureResult('No valid code found in AI response', '');
    }

    // Handle alternatives for generation
    if (parsedOutput.alternatives && parsedOutput.alternatives.length > 0 && options.showAlternatives) {
      const selectedCode = await this.showAlternativesDialog(parsedOutput);
      if (!selectedCode) {
        return this.createFailureResult('User cancelled alternative selection', '');
      }
      parsedOutput.code = selectedCode;
    }

    const generatedCode = this.processCodeForGeneration(parsedOutput.code, context, position);

    // Enhanced syntax validation
    if (options.validateSyntax) {
      const syntaxValid = await this.validateSyntax(generatedCode, context.language || 'text');
      if (!syntaxValid) {
        return this.createFailureResult('Generated code has syntax errors', '', generatedCode);
      }
    }

    // Enhanced generation preview
    if (options.showDiff && !options.autoApply) {
      const shouldApply = await this.showEnhancedGenerationPreview(generatedCode, context, parsedOutput);
      if (!shouldApply) {
        return this.createFailureResult('User cancelled code generation', '', generatedCode);
      }
    }

    try {
      const edit = new vscode.WorkspaceEdit();
      edit.insert(editor.document.uri, position, generatedCode);
      
      const success = await vscode.workspace.applyEdit(edit);
      
      if (success && options.trackChanges) {
        this.addToHistory({
          id: this.generateId(),
          timestamp: new Date(),
          filePath: editor.document.uri.fsPath,
          originalCode: '',
          newCode: generatedCode,
          instruction: context.userInstruction,
          success: true,
          confidence: parsedOutput.confidence,
          patchType: parsedOutput.patchType
        });
      }

      const message = success ? 'Code generated successfully by codeIt' : 'Failed to generate code';
      
      if (success && parsedOutput.explanation) {
        vscode.window.showInformationMessage(`${message}! ${parsedOutput.explanation}`);
      }

      return {
        success,
        message,
        originalText: '',
        newText: generatedCode,
        appliedAt: new Date(),
        patchType: parsedOutput.patchType,
        confidence: parsedOutput.confidence,
        contextPreserved: true,
        metadata: {
          responseType: parsedOutput.metadata.responseType,
          hasAlternatives: (parsedOutput.alternatives?.length || 0) > 0,
          syntaxValidated: options.validateSyntax
        }
      };
    } catch (error: any) {
      return this.createFailureResult(`Error generating code: ${error.message}`, '', generatedCode);
    }
  }

  static async applyMultiFilePatch(
    aiResponse: string,
    context: CodeContext,
    options: PatchOptions = { 
      autoApply: false, 
      preserveSelection: false, 
      showDiff: true, 
      validateSyntax: true, 
      trackChanges: true 
    }
  ): Promise<PatchResult> {
    // Use enhanced parser for multi-file
    const parsedOutput = OutputParser.parseAIResponse(aiResponse, {
      originalLanguage: context.language,
      expectMultiFile: true,
      instruction: context.userInstruction
    });
    
    if (parsedOutput.patchType !== 'multifile') {
      return this.createFailureResult('No multi-file changes found in response', '');
    }

    // Parse multi-file changes using the enhanced parser
    const multiFileChanges = OutputParser.parseMultiFileResponse(aiResponse);
    
    if (!multiFileChanges || multiFileChanges.length === 0) {
      return this.createFailureResult('No multi-file changes found in response', '');
    }

    const affectedFiles = multiFileChanges.map(change => change.filePath);
    
    // Enhanced multi-file confirmation
    if (!options.autoApply) {
      const confirmed = await this.confirmEnhancedMultiFileChanges(multiFileChanges, parsedOutput);
      if (!confirmed) {
        return this.createFailureResult('User cancelled multi-file changes', '', '', affectedFiles);
      }
    }

    // Validate syntax for each file if requested
    if (options.validateSyntax) {
      const validationResults = await Promise.all(
        multiFileChanges.map(change => 
          this.validateSyntax(change.content, change.language || 'text')
        )
      );
      
      const invalidFiles = multiFileChanges.filter((_, index) => !validationResults[index]);
      if (invalidFiles.length > 0) {
        const fileList = invalidFiles.map(f => f.filePath).join(', ');
        return this.createFailureResult(`Syntax errors in files: ${fileList}`, '', '', affectedFiles);
      }
    }

    const results: boolean[] = [];
    const workspaceEdit = new vscode.WorkspaceEdit();

    for (const change of multiFileChanges) {
      try {
        const uri = vscode.Uri.file(change.filePath);
        
        if (change.type === 'create') {
          workspaceEdit.createFile(uri, { ignoreIfExists: false });
          workspaceEdit.insert(uri, new vscode.Position(0, 0), change.content);
        } else if (change.type === 'modify') {
          const range = new vscode.Range(
            new vscode.Position(change.startLine || 0, 0),
            new vscode.Position(change.endLine || Number.MAX_SAFE_INTEGER, 0)
          );
          workspaceEdit.replace(uri, range, change.content);
        } else if (change.type === 'delete') {
          workspaceEdit.deleteFile(uri);
        }
        
        results.push(true);
      } catch (error) {
        results.push(false);
      }
    }

    try {
      const success = await vscode.workspace.applyEdit(workspaceEdit);
      const successCount = results.filter(r => r).length;
      
      if (success && options.trackChanges) {
        multiFileChanges.forEach(change => {
          this.addToHistory({
            id: this.generateId(),
            timestamp: new Date(),
            filePath: change.filePath,
            originalCode: change.originalContent || '',
            newCode: change.content,
            instruction: context.userInstruction,
            success: true,
            confidence: parsedOutput.confidence,
            patchType: 'multifile'
          });
        });
      }

      return {
        success,
        message: `codeIt applied changes to ${successCount}/${multiFileChanges.length} files`,
        originalText: '',
        newText: '',
        appliedAt: new Date(),
        patchType: 'multifile',
        confidence: parsedOutput.confidence,
        affectedFiles,
        contextPreserved: true,
        metadata: {
          responseType: parsedOutput.metadata.responseType,
          hasAlternatives: false,
          syntaxValidated: options.validateSyntax
        }
      };
    } catch (error: any) {
      return this.createFailureResult(`Error applying multi-file changes: ${error.message}`, '', '', affectedFiles);
    }
  }

  static async applySmartPatch(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    aiResponse: string,
    context: CodeContext,
    options: PatchOptions = { 
      autoApply: false, 
      preserveSelection: false, 
      showDiff: true, 
      validateSyntax: true, 
      trackChanges: true,
      showAlternatives: true
    }
  ): Promise<PatchResult> {
    // Let the enhanced parser determine the strategy
    const parsedOutput = OutputParser.parseAIResponse(aiResponse, {
      originalLanguage: context.language,
      expectMultiFile: aiResponse.includes('File:') || aiResponse.includes('Path:'),
      instruction: context.userInstruction
    });
    
    switch (parsedOutput.patchType) {
      case 'inline':
      case 'refactor':
        return this.applyInlinePatch(editor, selection, aiResponse, context, options);
      case 'generation':
        const position = selection.start;
        return this.applyGenerationPatch(editor, position, aiResponse, context, options);
      case 'multifile':
        return this.applyMultiFilePatch(aiResponse, context, options);
      default:
        return this.applyInlinePatch(editor, selection, aiResponse, context, options);
    }
  }

  // Simple patch application method for backward compatibility
  static async applyPatchWithConfirmation(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    aiResponse: string
  ): Promise<{ success: boolean; originalText?: string; newText?: string }> {
    const originalText = editor.document.getText(selection);
    
    // Parse the AI response
    const parsedOutput = OutputParser.parseAIResponse(aiResponse);
    
    if (!parsedOutput.code) {
      vscode.window.showErrorMessage('No valid code found in AI response');
      return { success: false };
    }

    // Show confirmation dialog
    const shouldApply = await vscode.window.showInformationMessage(
      'Apply the suggested changes?',
      { modal: true },
      'Apply',
      'Cancel'
    );

    if (shouldApply !== 'Apply') {
      return { success: false };
    }

    try {
      const cleanedCode = OutputParser.cleanCode(parsedOutput.code);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(editor.document.uri, selection, cleanedCode);
      
      const success = await vscode.workspace.applyEdit(edit);
      
      return {
        success,
        originalText,
        newText: cleanedCode
      };
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to apply changes: ${error.message}`);
      return { success: false };
    }
  }

  // Enhanced UI methods
  private static async showAlternativesDialog(parsedOutput: ParsedOutput): Promise<string | undefined> {
    if (!parsedOutput.alternatives || parsedOutput.alternatives.length === 0) {
      return parsedOutput.code;
    }

    const options = [
      {
        label: 'Primary Solution',
        description: `Confidence: ${(parsedOutput.confidence * 100).toFixed(0)}% - ${parsedOutput.code.substring(0, 100)}...`,
        code: parsedOutput.code
      },
      ...parsedOutput.alternatives.map((alt, index) => ({
        label: alt.label || `Alternative ${index + 1}`,
        description: `Confidence: ${(alt.confidence * 100).toFixed(0)}% - ${alt.code.substring(0, 100)}...`,
        code: alt.code
      }))
    ];

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: 'Choose which code solution to apply:',
      ignoreFocusOut: true
    });

    return selected?.code;
  }

  private static async showEnhancedDiffPreview(
    originalCode: string,
    newCode: string,
    context: CodeContext,
    parsedOutput: ParsedOutput
  ): Promise<boolean> {
    const diffContent = this.createEnhancedDiffContent(originalCode, newCode, parsedOutput);
    
    const diffDocument = await vscode.workspace.openTextDocument({
      content: diffContent,
      language: 'diff'
    });
    
    await vscode.window.showTextDocument(diffDocument, vscode.ViewColumn.Beside);
    
    const options = ['Apply Changes', 'Show Alternatives', 'Cancel'];
    if (!parsedOutput.alternatives || parsedOutput.alternatives.length === 0) {
      options.splice(1, 1); // Remove "Show Alternatives" if none available
    }
    
    const result = await vscode.window.showInformationMessage(
      `codeIt - Review changes (Confidence: ${(parsedOutput.confidence * 100).toFixed(0)}%):`,
      { modal: true },
      ...options
    );
    
    if (result === 'Show Alternatives' && parsedOutput.alternatives) {
      const selectedCode = await this.showAlternativesDialog(parsedOutput);
      return selectedCode !== undefined;
    }
    
    return result === 'Apply Changes';
  }

  private static async showEnhancedGenerationPreview(
    generatedCode: string,
    context: CodeContext,
    parsedOutput: ParsedOutput
  ): Promise<boolean> {
    const previewDocument = await vscode.workspace.openTextDocument({
      content: this.createGenerationPreviewContent(generatedCode, parsedOutput),
      language: context.language
    });
    
    await vscode.window.showTextDocument(previewDocument, vscode.ViewColumn.Beside);
    
    const result = await vscode.window.showInformationMessage(
      `codeIt - Review generated code (Confidence: ${(parsedOutput.confidence * 100).toFixed(0)}%):`,
      { modal: true },
      'Insert Code',
      'Cancel'
    );
    
    return result === 'Insert Code';
  }

  private static async confirmEnhancedMultiFileChanges(
    changes: MultiFileChange[],
    parsedOutput: ParsedOutput
  ): Promise<boolean> {
    const fileList = changes.map(c => `- ${c.filePath} (${c.type})`).join('\n');
    
    let message = `codeIt will modify ${changes.length} files:\n${fileList}`;
    if (parsedOutput.explanation) {
      message += `\n\nExplanation: ${parsedOutput.explanation}`;
    }
    message += `\n\nConfidence: ${(parsedOutput.confidence * 100).toFixed(0)}%`;
    
    const result = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      'Apply All Changes',
      'Cancel'
    );
    
    return result === 'Apply All Changes';
  }

  private static createEnhancedDiffContent(
    originalCode: string,
    newCode: string,
    parsedOutput: ParsedOutput
  ): string {
    let diff = `--- Original\n+++ Modified by codeIt (Confidence: ${(parsedOutput.confidence * 100).toFixed(0)}%)\n\n`;
    
    if (parsedOutput.explanation) {
      diff += `// ${parsedOutput.explanation}\n\n`;
    }
    
    if (parsedOutput.metadata.responseType !== 'code_only') {
      diff += `// Response Type: ${parsedOutput.metadata.responseType}\n`;
      diff += `// Patch Type: ${parsedOutput.patchType}\n\n`;
    }
    
    const originalLines = originalCode.split('\n');
    const newLines = newCode.split('\n');
    
    originalLines.forEach((line) => {
      diff += `- ${line}\n`;
    });
    
    newLines.forEach((line) => {
      diff += `+ ${line}\n`;
    });
    
    return diff;
  }

  private static createGenerationPreviewContent(
    generatedCode: string,
    parsedOutput: ParsedOutput
  ): string {
    let content = '';
    
    if (parsedOutput.explanation) {
      content += `// ${parsedOutput.explanation}\n`;
    }
    
    content += `// Generated by codeIt with ${(parsedOutput.confidence * 100).toFixed(0)}% confidence\n`;
    content += `// Response Type: ${parsedOutput.metadata.responseType}\n\n`;
    content += generatedCode;
    
    return content;
  }

  // Updated helper methods to work with enhanced parser
  private static createFailureResult(
    message: string,
    originalText: string,
    newText: string = '',
    affectedFiles?: string[]
  ): PatchResult {
    return {
      success: false,
      message,
      originalText,
      newText,
      appliedAt: new Date(),
      patchType: 'inline',
      confidence: 0,
      affectedFiles,
      contextPreserved: false,
      metadata: {
        responseType: 'error',
        hasAlternatives: false,
        syntaxValidated: false
      }
    };
  }

  // Keep all the existing utility methods...
  private static processCodeForInlineEdit(code: string, originalCode: string, context: CodeContext): string {
    // Clean the code using the enhanced parser
    const cleanedCode = OutputParser.cleanCode(code);
    
    // Preserve indentation from original code
    const originalIndentation = this.detectIndentation(originalCode);
    const processedCode = this.adjustIndentation(cleanedCode, originalIndentation);
    
    // Preserve surrounding whitespace patterns
    const leadingWhitespace = originalCode.match(/^\s*/)?.[0] || '';
    const trailingWhitespace = originalCode.match(/\s*$/)?.[0] || '';
    
    return leadingWhitespace + processedCode.trim() + trailingWhitespace;
  }

  private static processCodeForGeneration(code: string, context: CodeContext, position: vscode.Position): string {
    // Clean the code using the enhanced parser
    const cleanedCode = OutputParser.cleanCode(code);
    
    // Add proper indentation based on cursor position
    const indentation = this.getIndentationAtPosition(context.fileContent, position);
    return this.adjustIndentation(cleanedCode, indentation);
  }

  private static async validateSyntax(code: string, language: string): Promise<boolean> {
    // Enhanced syntax validation - integrate with language servers
    // For now, just do basic validation
    try {
      // Basic bracket matching
      const brackets = { '(': ')', '[': ']', '{': '}' };
      const stack: string[] = [];
      
      for (const char of code) {
        if (char in brackets) {
          stack.push(brackets[char as keyof typeof brackets]);
        } else if (Object.values(brackets).includes(char)) {
          if (stack.pop() !== char) return false;
        }
      }
      
      return stack.length === 0;
    } catch (error) {
      return false;
    }
  }

  private static checkContextPreservation(originalCode: string, newCode: string, context: CodeContext): boolean {
    const originalStyle = this.analyzeCodeStyle(originalCode);
    const newStyle = this.analyzeCodeStyle(newCode);
    
    return originalStyle.indentationType === newStyle.indentationType &&
           Math.abs(originalStyle.averageLineLength - newStyle.averageLineLength) < 20;
  }

  private static detectIndentation(code: string): string {
    const lines = code.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\s+)/);
      if (match) {
        return match[1];
      }
    }
    return '  ';
  }

  private static adjustIndentation(code: string, indentation: string): string {
    const lines = code.split('\n');
    return lines.map((line, index) => {
      if (index === 0 || line.trim() === '') return line;
      return indentation + line;
    }).join('\n');
  }

  private static getIndentationAtPosition(fileContent: string, position: vscode.Position): string {
    const lines = fileContent.split('\n');
    const currentLine = lines[position.line];
    const match = currentLine.match(/^(\s*)/);
    return match ? match[1] : '';
  }

  private static analyzeCodeStyle(code: string): any {
    const lines = code.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim() !== '');
    
    return {
      indentationType: code.includes('\t') ? 'tabs' : 'spaces',
      averageLineLength: nonEmptyLines.reduce((sum, line) => sum + line.length, 0) / nonEmptyLines.length,
      lineCount: lines.length
    };
  }

  private static addToHistory(entry: PatchHistory): void {
    this.patchHistory.unshift(entry);
    if (this.patchHistory.length > this.maxHistorySize) {
      this.patchHistory = this.patchHistory.slice(0, this.maxHistorySize);
    }
  }

  private static generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private static async applyCodeChange(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    newText: string,
    options: PatchOptions
  ): Promise<{ success: boolean; message: string }> {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(editor.document.uri, selection, newText);
    
    const success = await vscode.workspace.applyEdit(edit);
    
    if (success && options.preserveSelection) {
      const newSelection = new vscode.Selection(
        selection.start,
        selection.start.translate(newText.split('\n').length - 1, 0)
      );
      editor.selection = newSelection;
    }
    
    const message = success ? 'Code updated successfully by codeIt' : 'Failed to apply changes';
    return { success, message };
  }

  // Public API methods
  static getPatchHistory(filePath?: string): PatchHistory[] {
    if (filePath) {
      return this.patchHistory.filter(entry => entry.filePath === filePath);
    }
    return [...this.patchHistory];
  }

  static async undoLastPatch(editor: vscode.TextEditor): Promise<boolean> {
    const filePath = editor.document.uri.fsPath;
    const lastPatch = this.patchHistory.find(entry => entry.filePath === filePath && entry.success);
    
    if (!lastPatch) {
      vscode.window.showWarningMessage('No codeIt patch history found for this file');
      return false;
    }

    try {
      await vscode.commands.executeCommand('undo');
      vscode.window.showInformationMessage('Reverted last codeIt changes');
      return true;
    } catch (error) {
      vscode.window.showErrorMessage('Failed to undo codeIt changes');
      return false;
    }
  }

  static clearHistory(): void {
    this.patchHistory = [];
  }
}
