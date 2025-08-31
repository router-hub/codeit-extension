import * as path from 'path';
import { ProjectIndexer } from './projectIndexer';
import { SmartFileResolver, FileMatch } from './smartFileResolver';
import { PromptContextComposer, ComposedPromptContext } from './promptContextComposer';
import { PerplexityAPI } from './api';
import { PatchEngine } from './patchEngine';
import * as vscode from 'vscode';

export interface SmartAgentOptions {
  enableIndexing: boolean;
  maxFilesToProcess: number;
  showDiffPreview: boolean;
  applyChangesAutomatically: boolean;
  enableProgressNotification: boolean;
}

export interface AgentExecutionResult {
  success: boolean;
  filesProcessed: number;
  changesApplied: number;
  errors: string[];
  executionTime: number;
}

export class SmartAgent {
  private static instance: SmartAgent;
  private indexer: ProjectIndexer;
  private resolver: SmartFileResolver;
  private composer: PromptContextComposer;
  private api: PerplexityAPI;
  private outputChannel: vscode.OutputChannel;

  constructor(api: PerplexityAPI) {
    this.api = api;
    this.indexer = ProjectIndexer.getInstance();
    this.resolver = SmartFileResolver.getInstance();
    this.composer = PromptContextComposer.getInstance();
    this.outputChannel = vscode.window.createOutputChannel("codeIt Smart Agent");
  }

  static getInstance(api: PerplexityAPI): SmartAgent {
    if (!SmartAgent.instance) {
      SmartAgent.instance = new SmartAgent(api);
    }
    return SmartAgent.instance;
  }

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [SmartAgent] ${message}`;
    
    this.outputChannel.appendLine(logMessage);
    
    switch (level) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      default:
        console.log(logMessage);
    }
  }

  async executeSmartInstruction(
    instruction: string, 
    options: Partial<SmartAgentOptions> = {}
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const finalOptions: SmartAgentOptions = {
      enableIndexing: true,
      maxFilesToProcess: 3,
      showDiffPreview: true,
      applyChangesAutomatically: false,
      enableProgressNotification: true,
      ...options
    };

    this.log(`Executing smart instruction: "${instruction}"`);

    const result: AgentExecutionResult = {
      success: false,
      filesProcessed: 0,
      changesApplied: 0,
      errors: [],
      executionTime: 0
    };

    try {
      if (finalOptions.enableProgressNotification) {
        return await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "codeIt Smart Agent",
            cancellable: false,
          },
          async (progress) => {
            return await this.executeInstructionWithProgress(instruction, finalOptions, progress, result);
          }
        );
      } else {
        return await this.executeInstructionWithProgress(instruction, finalOptions, null, result);
      }
    } catch (error: any) {
      this.log(`Smart instruction execution failed: ${error.message}`, 'error');
      result.errors.push(error.message);
      result.executionTime = Date.now() - startTime;
      return result;
    }
  }

  private async executeInstructionWithProgress(
    instruction: string,
    options: SmartAgentOptions,
    progress: vscode.Progress<{message?: string; increment?: number}> | null,
    result: AgentExecutionResult
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();

    try {
      // Step 1: Ensure project is indexed
      progress?.report({ message: "Indexing project...", increment: 10 });
      this.log("Step 1: Ensuring project index is up to date");
      
      if (options.enableIndexing && !this.indexer.isIndexed()) {
        await this.indexer.buildIndex();
        this.log("Project indexed successfully");
      }

      // Step 2: Resolve target files
      progress?.report({ message: "Resolving target files...", increment: 20 });
      this.log("Step 2: Resolving target files");
      
      const fileMatches = await this.resolver.resolveFiles(instruction, {
        maxResults: options.maxFilesToProcess * 2, // Get more candidates
        minScore: 0.1,
        enableFuzzyMatching: true,
        prioritizeExactMatches: true
      });

      if (fileMatches.length === 0) {
        const error = "No relevant files found for the given instruction";
        this.log(error, 'error');
        result.errors.push(error);
        result.executionTime = Date.now() - startTime;
        return result;
      }

      this.log(`Found ${fileMatches.length} potential target files`);
      result.filesProcessed = Math.min(fileMatches.length, options.maxFilesToProcess);

      // Step 3: Compose structured prompt context
      progress?.report({ message: "Building context...", increment: 30 });
      this.log("Step 3: Composing prompt context");
      
      const promptContext = await this.composer.composePromptContext(
        instruction,
        fileMatches,
        {
          maxFilesToInclude: options.maxFilesToProcess,
          includeFullFileContent: true,
          maxContentLines: 500,
          includeRelatedFiles: true,
          generateBoundaries: true
        }
      );

      this.log(`Generated prompt context with ~${promptContext.estimatedTokens} tokens`);

      // Step 4: Execute AI request
      progress?.report({ message: "Calling AI service...", increment: 40 });
      this.log("Step 4: Executing AI request");
      
      const aiResponse = await this.api.callAPI({
        selectedCode: promptContext.userPrompt,
        userInstruction: instruction,
        filePath: promptContext.targetFiles[0]?.file.path || 'multiple-files',
        language: promptContext.targetFiles[0]?.file.language || 'typescript',
        fileContent: promptContext.userPrompt
      });

      this.log(`Received AI response: ${aiResponse.content.length} characters`);

      // Step 5: Parse and apply changes
      progress?.report({ message: "Applying changes...", increment: 50 });
      this.log("Step 5: Parsing and applying changes");
      
      const changeResults = await this.parseAndApplyChanges(
        aiResponse.content,
        promptContext.targetFiles,
        options
      );

      result.changesApplied = changeResults.appliedCount;
      result.errors.push(...changeResults.errors);
      
      // Success is determined by whether we got a meaningful response
      // For explanation requests: success = got response
      // For modification requests: success = found and applied changes
      const hasCodeChanges = changeResults.appliedCount > 0;
      const hasResponse = aiResponse.content.length > 0;
      
      if (hasCodeChanges) {
        result.success = true;
        this.log(`Applied ${result.changesApplied} changes successfully`);
      } else if (hasResponse) {
        result.success = true;
        this.log(`Request completed successfully (explanation or no changes needed)`);
      } else {
        result.success = false;
        this.log(`Request failed - no response or changes found`);
      }

    } catch (error: any) {
      this.log(`Error during execution: ${error.message}`, 'error');
      result.errors.push(error.message);
    }

    result.executionTime = Date.now() - startTime;
    progress?.report({ message: "Complete!", increment: 100 });
    
    return result;
  }

  private async parseAndApplyChanges(
    aiResponse: string,
    targetFiles: FileMatch[],
    options: SmartAgentOptions
  ): Promise<{ appliedCount: number; errors: string[] }> {
    let appliedCount = 0;
    const errors: string[] = [];

    // Parse the AI response to extract file changes
    const fileChanges = this.parseFileChanges(aiResponse);
    this.log(`Parsed ${fileChanges.length} file changes from AI response`);

    // If no file changes found, this might be an explanation request
    if (fileChanges.length === 0) {
      this.log('No file changes found in AI response - likely an explanation request');
      return { appliedCount: 0, errors: [] };
    }

    for (const change of fileChanges) {
      try {
        // Find the target file with more flexible matching
        let targetFile = targetFiles.find(f => 
          f.file.relativePath.includes(change.fileName) ||
          f.file.path.includes(change.fileName) ||
          f.file.relativePath.toLowerCase().includes(change.fileName.toLowerCase()) ||
          path.basename(f.file.path).toLowerCase() === change.fileName.toLowerCase()
        );

        // If still not found, try to find by partial name match
        if (!targetFile) {
          const fileNameWithoutExt = change.fileName.replace(/\.[^/.]+$/, '');
          targetFile = targetFiles.find(f => 
            path.basename(f.file.path, path.extname(f.file.path)).toLowerCase() === fileNameWithoutExt.toLowerCase()
          );
        }

        // If still not found, use the first target file if only one exists
        if (!targetFile && targetFiles.length === 1) {
          targetFile = targetFiles[0];
          this.log(`Using single target file: ${targetFile.file.relativePath}`);
        }

        if (!targetFile) {
          const availableFiles = targetFiles.map(f => f.file.relativePath).join(', ');
          errors.push(`Target file not found: ${change.fileName}. Available files: ${availableFiles}`);
          continue;
        }

        this.log(`Found target file: ${targetFile.file.relativePath} for change: ${change.fileName}`);

                 // Open the file in editor
         const document = await vscode.workspace.openTextDocument(targetFile.file.path);
         const editor = await vscode.window.showTextDocument(document);

         // Create change preview for chat interface
         if (options.showDiffPreview) {
           const changePreview = await this.createChangePreviewForChat(editor, change, targetFile);
           
           // Send change preview to chat interface instead of showing alert
           this.sendChangePreviewToChat(changePreview);
           
           // For now, we'll apply changes automatically
           // In the future, this will be controlled by the chat interface
           this.log(`Change preview sent to chat for ${targetFile.file.relativePath}`);
         }

        // Apply the changes
        const success = await this.applyFileChanges(
          editor, 
          change.newContent, 
          change.startLine, 
          change.endLine,
          change.changeType
        );
        if (success) {
          appliedCount++;
          this.log(`Successfully applied changes to ${targetFile.file.relativePath}`);
        } else {
          errors.push(`Failed to apply changes to ${targetFile.file.relativePath}`);
        }

      } catch (error: any) {
        const errorMsg = `Error processing ${change.fileName}: ${error.message}`;
        this.log(errorMsg, 'error');
        errors.push(errorMsg);
      }
    }

    return { appliedCount, errors };
  }

  private parseFileChanges(aiResponse: string): Array<{ 
    fileName: string; 
    newContent: string; 
    startLine?: number; 
    endLine?: number; 
    changeType: 'replace' | 'insert' | 'function_update' 
  }> {
    const changes: Array<{ 
      fileName: string; 
      newContent: string; 
      startLine?: number; 
      endLine?: number; 
      changeType: 'replace' | 'insert' | 'function_update' 
    }> = [];
    
         // Pattern 1: Look for file headers with line numbers (### File: filename (lines X-Y))
     const fileHeaderWithLinesPattern = /###?\s*File:?\s*([^\n]+?)\s*(?:\(lines?\s*(\d+)(?:\s*-\s*(\d+))?\))?\s*\n```[\w]*\n([\s\S]*?)\n```/gi;
     
     let match;
     while ((match = fileHeaderWithLinesPattern.exec(aiResponse)) !== null) {
       const fileName = match[1]?.trim() || '';
       const startLine = match[2] ? parseInt(match[2]) : undefined;
       const endLine = match[3] ? parseInt(match[3]) : undefined;
       const content = match[4] || '';
       
       if (fileName && content) {
         const cleanFileName = fileName.replace(/[`*]/g, '').trim();
         const cleanContent = content.trim();
         
                   // For function documentation, we need to find the actual function in the target file
          // and determine the correct line numbers dynamically
          if (content.includes('/**') && content.includes('*/')) {
            // Remove line numbers from the content (e.g., "53: ", "54: ", etc.)
            const cleanedContent = cleanContent.replace(/^\s*\d+:\s*/gm, '');
            
            // This is function documentation - we'll handle it in applyFileChanges
            changes.push({
              fileName: cleanFileName,
              newContent: cleanedContent,
              startLine: undefined, // Will be determined dynamically
              endLine: undefined,
              changeType: 'function_update'
            });
          } else {
           // For regular code changes, validate line numbers
           if (startLine !== undefined) {
             const contentLines = content.split('\n').length;
             
             // If AI provided line numbers, use them but log a warning if they seem off
             if (startLine < 1 || startLine > 1000) {
               this.log(`Warning: AI provided unusual start line ${startLine}`, 'warn');
             }
             
             changes.push({
               fileName: cleanFileName,
               newContent: cleanContent,
               startLine,
               endLine: endLine || (startLine + contentLines - 1),
               changeType: 'replace'
             });
           } else {
             changes.push({
               fileName: cleanFileName,
               newContent: cleanContent,
               startLine,
               endLine,
               changeType: 'replace'
             });
           }
         }
       }
     }

    // Pattern 2: Look for function documentation with specific function names
    if (changes.length === 0) {
      // Look for JSDoc comments in code blocks
      const functionDocPattern = /```[\w]*\n([\s\S]*?)\*\//gi;
      let blockMatch;
      
             while ((blockMatch = functionDocPattern.exec(aiResponse)) !== null) {
         const content = blockMatch[1] || '';
         if (content.trim() && content.includes('/**')) {
           // Remove line numbers from the content
           const cleanedContent = content.trim().replace(/^\s*\d+:\s*/gm, '');
           
           // Extract the function name from the documentation
           const functionNameMatch = cleanedContent.match(/\*\s*(\w+)\s*-/);
           if (functionNameMatch) {
             changes.push({
               fileName: functionNameMatch[1], // Use function name as fileName
               newContent: cleanedContent,
               changeType: 'function_update'
             });
           } else {
             changes.push({
               fileName: 'function_update',
               newContent: cleanedContent,
               changeType: 'function_update'
             });
           }
         }
       }
    }

    // Pattern 2.5: Look for function documentation in the format provided by the user
    if (changes.length === 0) {
      const functionDocWithCodePattern = /(\/\*\*[\s\S]*?\*\/)\s*\n\s*(const|let|var|function)\s+(\w+)/gi;
      let blockMatch;
      
             while ((blockMatch = functionDocWithCodePattern.exec(aiResponse)) !== null) {
         const docContent = blockMatch[1] || '';
         const functionName = blockMatch[3] || '';
         
         if (docContent.trim() && functionName) {
           // Remove line numbers from the content
           const cleanedContent = docContent.trim().replace(/^\s*\d+:\s*/gm, '');
           
           changes.push({
             fileName: functionName,
             newContent: cleanedContent,
             changeType: 'function_update'
           });
         }
       }
    }

    // Pattern 3: Look for code blocks with file comments
    if (changes.length === 0) {
      const codeBlockPattern = /```[\w]*\s*\/\/\s*([^\n]+)\n([\s\S]*?)```/gi;
      let blockMatch;
      
      while ((blockMatch = codeBlockPattern.exec(aiResponse)) !== null) {
        const fileName = blockMatch[1]?.trim() || '';
        const content = blockMatch[2] || '';
        
        if (fileName && content) {
          changes.push({
            fileName: fileName,
            newContent: content.trim(),
            changeType: 'replace'
          });
        }
      }
    }

    // Pattern 4: Look for simple code blocks (fallback)
    if (changes.length === 0) {
      const codeBlockPattern = /```[\w]*\n([\s\S]*?)```/gi;
      let blockMatch;
      let blockIndex = 0;
      
      while ((blockMatch = codeBlockPattern.exec(aiResponse)) !== null) {
        const content = blockMatch[1] || '';
        if (content.trim()) {
          changes.push({
            fileName: `modified_file_${blockIndex + 1}`,
            newContent: content.trim(),
            changeType: 'replace'
          });
          blockIndex++;
        }
      }
    }

    return changes;
  }

  private async applyFileChanges(
    editor: vscode.TextEditor, 
    newContent: string, 
    startLine?: number, 
    endLine?: number,
    changeType: 'replace' | 'insert' | 'function_update' = 'replace'
  ): Promise<boolean> {
    try {
      const document = editor.document;
      const documentText = document.getText();
      const lines = documentText.split('\n');

      let range: vscode.Range;
      let contentToInsert: string;

      if (changeType === 'function_update') {
        // For function updates, we need to find the function and replace its documentation
        const functionMatch = this.findFunctionInCode(newContent, documentText);
        if (functionMatch) {
          range = functionMatch.range;
          contentToInsert = functionMatch.newContent;
        } else {
          // Fallback: replace the entire file
          range = new vscode.Range(
            document.positionAt(0),
            document.positionAt(documentText.length)
          );
          contentToInsert = newContent;
        }
      } else if (startLine !== undefined && endLine !== undefined) {
        // Replace specific line range
        const startPos = document.positionAt(lines.slice(0, startLine - 1).join('\n').length + (startLine > 1 ? 1 : 0));
        const endPos = document.positionAt(lines.slice(0, endLine).join('\n').length);
        range = new vscode.Range(startPos, endPos);
        contentToInsert = newContent;
      } else if (startLine !== undefined) {
        // Replace from specific line to end
        const startPos = document.positionAt(lines.slice(0, startLine - 1).join('\n').length + (startLine > 1 ? 1 : 0));
        const endPos = document.positionAt(documentText.length);
        range = new vscode.Range(startPos, endPos);
        contentToInsert = newContent;
      } else {
        // Fallback: replace entire file
        range = new vscode.Range(
          document.positionAt(0),
          document.positionAt(documentText.length)
        );
        contentToInsert = newContent;
      }

      const success = await editor.edit(editBuilder => {
        editBuilder.replace(range, contentToInsert);
      });

      if (success) {
        await document.save();
        this.log(`Applied changes to lines ${startLine || 1}-${endLine || 'end'}`);
      }

      return success;
    } catch (error: any) {
      this.log(`Error applying file changes: ${error.message}`, 'error');
      return false;
    }
  }

     private findFunctionInCode(newContent: string, documentText: string): { range: vscode.Range; newContent: string } | null {
     // Extract function name from the documentation
     const functionNameMatch = newContent.match(/\*\s*(\w+)\s*-/);
     if (!functionNameMatch) return null;

     const functionName = functionNameMatch[1];
     
     // Find the function in the document - look for various function declaration patterns
     const functionPatterns = [
       new RegExp(`(?:function|const|let|var)\\s+${functionName}\\s*[=:]?\\s*(?:async\\s*)?\\(`, 'g'),
       new RegExp(`${functionName}\\s*[:=]\\s*(?:async\\s*)?\\(`, 'g'),
       new RegExp(`(?:public|private|protected)?\\s*(?:async\\s*)?${functionName}\\s*\\(`, 'g')
     ];
     
     let match = null;
     for (const pattern of functionPatterns) {
       match = pattern.exec(documentText);
       if (match) break;
     }
     
     if (!match) return null;

     // Find the start and end of the function
     const startIndex = match.index;
     let endIndex = startIndex;
     let braceCount = 0;
     let foundOpenBrace = false;

     for (let i = startIndex; i < documentText.length; i++) {
       const char = documentText[i];
       if (char === '{') {
         braceCount++;
         foundOpenBrace = true;
       } else if (char === '}') {
         braceCount--;
         if (foundOpenBrace && braceCount === 0) {
           endIndex = i + 1;
           break;
         }
       }
     }

     if (endIndex <= startIndex) return null;

     // Find the line numbers
     const lines = documentText.split('\n');
     let currentPos = 0;
     let functionStartLine = 0;
     let functionEndLine = 0;
     
     for (let i = 0; i < lines.length; i++) {
       const lineEnd = currentPos + lines[i].length + 1; // +1 for newline
       if (currentPos <= startIndex && startIndex < lineEnd) {
         functionStartLine = i;
       }
       if (currentPos <= endIndex && endIndex <= lineEnd) {
         functionEndLine = i;
         break;
       }
       currentPos = lineEnd;
     }

     // Look backwards from the function to find where documentation should be inserted
     let insertLine = functionStartLine;
     let hasExistingDoc = false;
     
     for (let i = functionStartLine - 1; i >= 0; i--) {
       const line = lines[i].trim();
       
       // Skip empty lines
       if (line === '') {
         continue;
       }
       
       // If we find existing JSDoc comment, we need to replace it
       if (line.startsWith('/**') || line.startsWith('*')) {
         hasExistingDoc = true;
         // Find the start of the existing documentation
         let docStartLine = i;
         while (docStartLine > 0 && (lines[docStartLine - 1].trim().startsWith('*') || lines[docStartLine - 1].trim().startsWith('/**'))) {
           docStartLine--;
         }
         insertLine = docStartLine;
         break;
       }
       
       // If we find a non-empty line that's not documentation, insert before the function
       if (!line.startsWith('//') && !line.startsWith('/*')) {
         insertLine = functionStartLine;
         break;
       }
     }

           // Create range that includes the documentation insertion point and the function to replace
      const insertPosition = new vscode.Position(insertLine, 0);
      const functionEndPosition = new vscode.Position(functionEndLine + 1, 0);
      const range = new vscode.Range(insertPosition, functionEndPosition);

      // Format the complete content: documentation + function
      const functionContent = documentText.substring(startIndex, endIndex);
      const formattedContent = newContent.trim() + '\n' + functionContent;

      // Log what we're about to replace for debugging
      this.log(`Replacing function ${functionName} at lines ${insertLine + 1}-${functionEndLine + 1}`);
      this.log(`Has existing documentation: ${hasExistingDoc}`);
      this.log(`Original function content: ${functionContent.substring(0, 100)}...`);
      this.log(`New content with documentation: ${formattedContent.substring(0, 100)}...`);

      return { range, newContent: formattedContent };
   }

  // Convenience methods for common tasks
  async updateService(serviceName: string, changes: string): Promise<AgentExecutionResult> {
    return this.executeSmartInstruction(
      `Update ${serviceName} service: ${changes}`,
      {
        enableIndexing: true,
        maxFilesToProcess: 2,
        showDiffPreview: true,
        applyChangesAutomatically: false
      }
    );
  }

  async addLoggingToClass(className: string): Promise<AgentExecutionResult> {
    return this.executeSmartInstruction(
      `Add comprehensive logging to all methods in ${className}`,
      {
        enableIndexing: true,
        maxFilesToProcess: 1,
        showDiffPreview: true,
        applyChangesAutomatically: false
      }
    );
  }

  async refactorFunction(functionName: string, instructions: string): Promise<AgentExecutionResult> {
    return this.executeSmartInstruction(
      `Refactor function ${functionName}: ${instructions}`,
      {
        enableIndexing: true,
        maxFilesToProcess: 1,
        showDiffPreview: true,
        applyChangesAutomatically: false
      }
    );
  }

  async implementFeature(featureDescription: string): Promise<AgentExecutionResult> {
    return this.executeSmartInstruction(
      `Implement feature: ${featureDescription}`,
      {
        enableIndexing: true,
        maxFilesToProcess: 5,
        showDiffPreview: true,
        applyChangesAutomatically: false
      }
    );
  }



     private async createChangePreviewForChat(
     editor: vscode.TextEditor, 
     change: { fileName: string; newContent: string; startLine?: number; endLine?: number; changeType: string },
     targetFile: FileMatch
   ): Promise<any> {
     const document = editor.document;
     const documentText = document.getText();
     
     let preview = {
       type: 'change_preview',
       filePath: targetFile.file.relativePath,
       changeType: change.changeType,
       originalContent: '',
       newContent: '',
       lineRange: '',
       description: ''
     };
     
     if (change.changeType === 'function_update') {
       const functionMatch = this.findFunctionInCode(change.newContent, documentText);
       if (functionMatch) {
         const range = functionMatch.range;
         
         preview.lineRange = `${range.start.line + 1}-${range.end.line + 1}`;
         preview.newContent = functionMatch.newContent;
         preview.originalContent = documentText.substring(
           document.offsetAt(range.start),
           document.offsetAt(range.end)
         );
         preview.description = `Update function documentation in ${targetFile.file.relativePath}`;
       }
     } else if (change.startLine && change.endLine) {
       preview.lineRange = `${change.startLine}-${change.endLine}`;
       preview.newContent = change.newContent;
       const lines = documentText.split('\n');
       preview.originalContent = lines.slice(change.startLine - 1, change.endLine).join('\n');
       preview.description = `Replace lines ${change.startLine}-${change.endLine} in ${targetFile.file.relativePath}`;
     } else {
       preview.newContent = change.newContent;
       preview.originalContent = documentText;
       preview.description = `Replace entire content of ${targetFile.file.relativePath}`;
     }
     
     return preview;
   }

   private async createChangePreview(
     editor: vscode.TextEditor, 
     change: { fileName: string; newContent: string; startLine?: number; endLine?: number; changeType: string },
     targetFile: FileMatch
   ): Promise<string> {
     const document = editor.document;
     const documentText = document.getText();
     
     let preview = `File: ${targetFile.file.relativePath}\n`;
     preview += `Change Type: ${change.changeType}\n\n`;
     
     if (change.changeType === 'function_update') {
       const functionMatch = this.findFunctionInCode(change.newContent, documentText);
       if (functionMatch) {
         const lines = documentText.split('\n');
         const range = functionMatch.range;
         
         preview += `Will replace lines ${range.start.line + 1}-${range.end.line + 1}\n\n`;
         preview += `NEW CONTENT:\n`;
         preview += `\`\`\`\n${functionMatch.newContent}\n\`\`\`\n\n`;
         
         // Show what will be removed
         const originalContent = documentText.substring(
           document.offsetAt(range.start),
           document.offsetAt(range.end)
         );
         preview += `ORIGINAL CONTENT (will be replaced):\n`;
         preview += `\`\`\`\n${originalContent}\n\`\`\``;
       }
     } else if (change.startLine && change.endLine) {
       preview += `Will replace lines ${change.startLine}-${change.endLine}\n\n`;
       preview += `NEW CONTENT:\n`;
       preview += `\`\`\`\n${change.newContent}\n\`\`\``;
     } else {
       preview += `Will replace entire file content\n\n`;
       preview += `NEW CONTENT:\n`;
       preview += `\`\`\`\n${change.newContent.substring(0, 500)}${change.newContent.length > 500 ? '...' : ''}\n\`\`\``;
     }
     
     return preview;
   }

   private async showDetailedDiff(
     editor: vscode.TextEditor,
     change: { fileName: string; newContent: string; startLine?: number; endLine?: number; changeType: string },
     targetFile: FileMatch
   ): Promise<void> {
     const document = editor.document;
     const documentText = document.getText();
     
     let originalContent = '';
     let newContent = '';
     
     if (change.changeType === 'function_update') {
       const functionMatch = this.findFunctionInCode(change.newContent, documentText);
       if (functionMatch) {
         originalContent = documentText.substring(
           document.offsetAt(functionMatch.range.start),
           document.offsetAt(functionMatch.range.end)
         );
         newContent = functionMatch.newContent;
       }
     } else if (change.startLine && change.endLine) {
       const lines = documentText.split('\n');
       originalContent = lines.slice(change.startLine - 1, change.endLine).join('\n');
       newContent = change.newContent;
     } else {
       originalContent = documentText;
       newContent = change.newContent;
     }
     
     // Create a temporary file for the diff
     const tempDir = vscode.Uri.file(require('os').tmpdir());
     const originalFile = vscode.Uri.joinPath(tempDir, `${targetFile.file.relativePath}.original`);
     const newFile = vscode.Uri.joinPath(tempDir, `${targetFile.file.relativePath}.new`);
     
     try {
       await vscode.workspace.fs.writeFile(originalFile, Buffer.from(originalContent));
       await vscode.workspace.fs.writeFile(newFile, Buffer.from(newContent));
       
       // Open diff editor
       await vscode.commands.executeCommand('vscode.diff', originalFile, newFile, `Changes to ${targetFile.file.relativePath}`);
           } catch (error: any) {
        this.log(`Failed to show diff: ${error.message}`, 'error');
      }
   }

   private sendChangePreviewToChat(changePreview: any): void {
     // This method will be called by the ChatProvider to send change previews
     // For now, we'll emit an event that the ChatProvider can listen to
     if (this.onChangePreview) {
       this.onChangePreview(changePreview);
     }
   }

   // Event handler for change previews
   private onChangePreview?: (preview: any) => void;

   // Method to set the change preview handler
   setChangePreviewHandler(handler: (preview: any) => void): void {
     this.onChangePreview = handler;
   }

   showDebugOutput() {
     this.outputChannel.show();
     this.indexer.showDebugOutput();
     this.resolver.showDebugOutput();
     this.composer.showDebugOutput();
   }
 }
