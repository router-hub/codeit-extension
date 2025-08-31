import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';

export interface FileIndex {
  path: string;
  relativePath: string;
  exports: string[];
  imports: string[];
  classes: string[];
  functions: string[];
  interfaces: string[];
  summary: string;
  language: string;
  lastModified: number;
  lineCount: number;
}

export interface ProjectIndex {
  [fileName: string]: FileIndex;
}

export interface IndexingOptions {
  maxFiles: number;
  maxFileSize: number; // bytes
  includePatterns: string[];
  excludePatterns: string[];
  enableASTParsing: boolean;
}

export class ProjectIndexer {
  private static instance: ProjectIndexer;
  private projectIndex: ProjectIndex = {};
  private isIndexing = false;
  private lastIndexTime = 0;
  private outputChannel: vscode.OutputChannel;
  private workspaceRoot: string = '';

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel("codeIt Project Indexer");
    this.updateWorkspaceRoot();
  }

  private updateWorkspaceRoot() {
    // Get the workspace root from the active text editor if available
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const documentUri = activeEditor.document.uri;
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
      if (workspaceFolder) {
        this.workspaceRoot = workspaceFolder.uri.fsPath;
        this.log(`Using workspace root from active editor: ${this.workspaceRoot}`);
        return;
      }
    }

    // Fallback to first workspace folder
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    this.log(`Using default workspace root: ${this.workspaceRoot}`);
  }

  static getInstance(): ProjectIndexer {
    if (!ProjectIndexer.instance) {
      ProjectIndexer.instance = new ProjectIndexer();
    }
    return ProjectIndexer.instance;
  }

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [ProjectIndexer] ${message}`;
    
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

  async buildIndex(options: Partial<IndexingOptions> = {}): Promise<ProjectIndex> {
    if (this.isIndexing) {
      this.log('Indexing already in progress, skipping...');
      return this.projectIndex;
    }

    // Update workspace root before indexing
    this.updateWorkspaceRoot();

    const startTime = Date.now();
    this.isIndexing = true;
    this.log('Starting project indexing...');

    const finalOptions: IndexingOptions = {
      maxFiles: 1000,
      maxFileSize: 1024 * 1024, // 1MB
      includePatterns: [
        '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
        '**/*.py', '**/*.java', '**/*.cpp', '**/*.c',
        '**/*.cs', '**/*.php', '**/*.rb', '**/*.go',
        '**/*.rs', '**/*.swift', '**/*.kt', '**/*.scala'
      ],
      excludePatterns: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/coverage/**',
        '**/*.min.js',
        '**/*.d.ts'
      ],
      enableASTParsing: true,
      ...options
    };

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "codeIt: Indexing Project",
          cancellable: false,
        },
        async (progress) => {
          // Find all relevant files
          const files = await this.findFiles(finalOptions);
          this.log(`Found ${files.length} files to index`);

          let processed = 0;
          this.projectIndex = {};

          for (const filePath of files) {
            try {
              progress.report({ 
                message: `Processing ${path.basename(filePath)}...`,
                increment: (100 / files.length)
              });

              const fileIndex = await this.indexFile(filePath, finalOptions);
              if (fileIndex) {
                const fileName = path.basename(filePath);
                this.projectIndex[fileName] = fileIndex;
                processed++;
              }
            } catch (error: any) {
              this.log(`Error indexing ${filePath}: ${error.message}`, 'warn');
            }
          }

          this.log(`Successfully indexed ${processed} files`);
        }
      );

      this.lastIndexTime = Date.now();
      const duration = this.lastIndexTime - startTime;
      this.log(`Project indexing completed in ${duration}ms`);

      return this.projectIndex;
    } catch (error: any) {
      this.log(`Project indexing failed: ${error.message}`, 'error');
      throw error;
    } finally {
      this.isIndexing = false;
    }
  }

  private async findFiles(options: IndexingOptions): Promise<string[]> {
    if (!this.workspaceRoot) {
      this.log('No workspace root found');
      return [];
    }

    const allFiles: string[] = [];

    for (const pattern of options.includePatterns) {
      try {
        const files = await glob(pattern, {
          cwd: this.workspaceRoot,
          absolute: true,
          ignore: options.excludePatterns
        });
        allFiles.push(...files);
      } catch (error: any) {
        this.log(`Error finding files with pattern ${pattern}: ${error.message}`, 'warn');
      }
    }

    // Remove duplicates and sort
    const uniqueFiles = [...new Set(allFiles)].sort();
    
    // Apply file size limit
    const validFiles: string[] = [];
    for (const file of uniqueFiles.slice(0, options.maxFiles)) {
      try {
        const stats = fs.statSync(file);
        if (stats.size <= options.maxFileSize) {
          validFiles.push(file);
        } else {
          this.log(`Skipping large file: ${file} (${stats.size} bytes)`, 'warn');
        }
      } catch (error) {
        // Skip files we can't stat
      }
    }

    return validFiles;
  }

  private async indexFile(filePath: string, options: IndexingOptions): Promise<FileIndex | null> {
    try {
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      const language = this.detectLanguage(filePath);
      const relativePath = path.relative(this.workspaceRoot, filePath);

      this.log(`Indexing ${relativePath} (${language})`, 'info');

      // Parse file content
      const parseResult = options.enableASTParsing 
        ? this.parseFileContent(content, language)
        : this.parseFileContentSimple(content, language);

      const summary = this.generateFileSummary(content, parseResult, language);

      return {
        path: filePath,
        relativePath,
        exports: parseResult.exports,
        imports: parseResult.imports,
        classes: parseResult.classes,
        functions: parseResult.functions,
        interfaces: parseResult.interfaces,
        summary,
        language,
        lastModified: stats.mtime.getTime(),
        lineCount: content.split('\n').length
      };
    } catch (error: any) {
      this.log(`Failed to index ${filePath}: ${error.message}`, 'error');
      return null;
    }
  }

  private parseFileContent(content: string, language: string) {
    // Enhanced parsing using regex patterns for different languages
    const result = {
      exports: [] as string[],
      imports: [] as string[],
      classes: [] as string[],
      functions: [] as string[],
      interfaces: [] as string[]
    };

    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
        continue;
      }

      // Parse imports
      const imports = this.extractImports(trimmed, language);
      result.imports.push(...imports);

      // Parse exports
      const exports = this.extractExports(trimmed, language);
      result.exports.push(...exports);

      // Parse classes
      const classes = this.extractClasses(trimmed, language);
      result.classes.push(...classes);

      // Parse functions
      const functions = this.extractFunctions(trimmed, language);
      result.functions.push(...functions);

      // Parse interfaces
      const interfaces = this.extractInterfaces(trimmed, language);
      result.interfaces.push(...interfaces);
    }

    // Remove duplicates
    result.exports = [...new Set(result.exports)];
    result.imports = [...new Set(result.imports)];
    result.classes = [...new Set(result.classes)];
    result.functions = [...new Set(result.functions)];
    result.interfaces = [...new Set(result.interfaces)];

    return result;
  }

  private parseFileContentSimple(content: string, language: string) {
    // Fallback simple parsing
    return {
      exports: this.extractExportsSimple(content, language),
      imports: this.extractImportsSimple(content, language),
      classes: this.extractClassesSimple(content, language),
      functions: this.extractFunctionsSimple(content, language),
      interfaces: this.extractInterfacesSimple(content, language)
    };
  }

  private extractImports(line: string, language: string): string[] {
    const imports: string[] = [];
    
    const patterns: { [key: string]: RegExp[] } = {
      'typescript': [
        /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
        /import\s+['"]([^'"]+)['"]/g,
        /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
      ],
      'javascript': [
        /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
        /import\s+['"]([^'"]+)['"]/g,
        /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
      ],
      'python': [
        /import\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g,
        /from\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s+import/g
      ]
    };

    const langPatterns = patterns[language] || patterns['javascript'];
    
    for (const pattern of langPatterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        imports.push(match[1]);
      }
    }

    return imports;
  }

  private extractExports(line: string, language: string): string[] {
    const exports: string[] = [];
    
    const patterns: { [key: string]: RegExp[] } = {
      'typescript': [
        /export\s+(?:default\s+)?(?:class|function|const|let|var|enum|interface)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
        /export\s*{\s*([^}]+)\s*}/g
      ],
      'javascript': [
        /export\s+(?:default\s+)?(?:class|function|const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
        /module\.exports\s*=\s*([a-zA-Z_][a-zA-Z0-9_]*)/g
      ]
    };

    const langPatterns = patterns[language] || patterns['javascript'];
    
    for (const pattern of langPatterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        if (match[1].includes(',')) {
          // Handle export { a, b, c }
          const items = match[1].split(',').map(item => item.trim());
          exports.push(...items);
        } else {
          exports.push(match[1]);
        }
      }
    }

    return exports;
  }

  private extractClasses(line: string, language: string): string[] {
    const classes: string[] = [];
    
    const patterns: { [key: string]: RegExp[] } = {
      'typescript': [/(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z_][a-zA-Z0-9_]*)/g],
      'javascript': [/(?:export\s+)?class\s+([a-zA-Z_][a-zA-Z0-9_]*)/g],
      'python': [/class\s+([a-zA-Z_][a-zA-Z0-9_]*)/g],
      'java': [/(?:public\s+|private\s+|protected\s+)?class\s+([a-zA-Z_][a-zA-Z0-9_]*)/g],
      'csharp': [/(?:public\s+|private\s+|protected\s+|internal\s+)?class\s+([a-zA-Z_][a-zA-Z0-9_]*)/g]
    };

    const langPatterns = patterns[language] || patterns['javascript'];
    
    for (const pattern of langPatterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        classes.push(match[1]);
      }
    }

    return classes;
  }

  private extractFunctions(line: string, language: string): string[] {
    const functions: string[] = [];
    
    const patterns: { [key: string]: RegExp[] } = {
      'typescript': [
        /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
        /(?:public|private|protected)\s+(?:async\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
        /([a-zA-Z_][a-zA-Z0-9_]*)\s*[:=]\s*(?:async\s+)?\(/g
      ],
      'javascript': [
        /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
        /([a-zA-Z_][a-zA-Z0-9_]*)\s*[:=]\s*(?:async\s+)?\(/g
      ],
      'python': [/(?:async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)/g]
    };

    const langPatterns = patterns[language] || patterns['javascript'];
    
    for (const pattern of langPatterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        functions.push(match[1]);
      }
    }

    return functions;
  }

  private extractInterfaces(line: string, language: string): string[] {
    const interfaces: string[] = [];
    
    const patterns: { [key: string]: RegExp[] } = {
      'typescript': [/(?:export\s+)?interface\s+([a-zA-Z_][a-zA-Z0-9_]*)/g],
      'java': [/(?:public\s+)?interface\s+([a-zA-Z_][a-zA-Z0-9_]*)/g],
      'csharp': [/(?:public\s+|internal\s+)?interface\s+([a-zA-Z_][a-zA-Z0-9_]*)/g]
    };

    const langPatterns = patterns[language] || [];
    
    for (const pattern of langPatterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        interfaces.push(match[1]);
      }
    }

    return interfaces;
  }

  // Simple fallback extraction methods
  private extractExportsSimple(content: string, language: string): string[] {
    const exports: string[] = [];
    const lines = content.split('\n').slice(0, 100); // First 100 lines

    for (const line of lines) {
      if (line.includes('export')) {
        const match = line.match(/export\s+(?:default\s+)?(?:class|function|const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (match) exports.push(match[1]);
      }
    }

    return [...new Set(exports)];
  }

  private extractImportsSimple(content: string, language: string): string[] {
    const imports: string[] = [];
    const lines = content.split('\n').slice(0, 50); // First 50 lines

    for (const line of lines) {
      if (line.includes('import') || line.includes('require')) {
        const match = line.match(/(?:import.*from\s+|require\s*\(\s*)['"]([^'"]+)['"]/);
        if (match) imports.push(match[1]);
      }
    }

    return [...new Set(imports)];
  }

  private extractClassesSimple(content: string, language: string): string[] {
    const classes: string[] = [];
    const classRegex = /class\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let match;

    while ((match = classRegex.exec(content)) !== null) {
      classes.push(match[1]);
    }

    return [...new Set(classes)];
  }

  private extractFunctionsSimple(content: string, language: string): string[] {
    const functions: string[] = [];
    const functionRegex = /function\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let match;

    while ((match = functionRegex.exec(content)) !== null) {
      functions.push(match[1]);
    }

    return [...new Set(functions)];
  }

  private extractInterfacesSimple(content: string, language: string): string[] {
    const interfaces: string[] = [];
    const interfaceRegex = /interface\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let match;

    while ((match = interfaceRegex.exec(content)) !== null) {
      interfaces.push(match[1]);
    }

    return [...new Set(interfaces)];
  }

  private generateFileSummary(content: string, parseResult: any, language: string): string {
    const summary: string[] = [];
    
    if (parseResult.classes.length > 0) {
      summary.push(`${parseResult.classes.length} class${parseResult.classes.length > 1 ? 'es' : ''}: ${parseResult.classes.slice(0, 3).join(', ')}`);
    }
    
    if (parseResult.functions.length > 0) {
      summary.push(`${parseResult.functions.length} function${parseResult.functions.length > 1 ? 's' : ''}: ${parseResult.functions.slice(0, 3).join(', ')}`);
    }
    
    if (parseResult.interfaces.length > 0) {
      summary.push(`${parseResult.interfaces.length} interface${parseResult.interfaces.length > 1 ? 's' : ''}: ${parseResult.interfaces.slice(0, 2).join(', ')}`);
    }

    const lineCount = content.split('\n').length;
    const baseInfo = `${language} file with ${lineCount} lines`;
    
    return summary.length > 0 ? `${baseInfo}. ${summary.join(', ')}` : baseInfo;
  }

  private detectLanguage(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    const languageMap: { [key: string]: string } = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.cxx': 'cpp',
      '.cc': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala'
    };
    return languageMap[extension] || 'text';
  }

  // Public API methods
  getIndex(): ProjectIndex {
    return this.projectIndex;
  }

  async refreshIndex(): Promise<ProjectIndex> {
    this.log('Refreshing project index...');
    return await this.buildIndex();
  }

  getFilesByPattern(pattern: string): FileIndex[] {
    const regex = new RegExp(pattern, 'i');
    return Object.values(this.projectIndex).filter(file => 
      regex.test(file.relativePath) || 
      regex.test(path.basename(file.path))
    );
  }

  findByExport(exportName: string): FileIndex[] {
    return Object.values(this.projectIndex).filter(file =>
      file.exports.some(exp => exp.toLowerCase().includes(exportName.toLowerCase()))
    );
  }

  findByClass(className: string): FileIndex[] {
    return Object.values(this.projectIndex).filter(file =>
      file.classes.some(cls => cls.toLowerCase().includes(className.toLowerCase()))
    );
  }

  findByFunction(functionName: string): FileIndex[] {
    return Object.values(this.projectIndex).filter(file =>
      file.functions.some(func => func.toLowerCase().includes(functionName.toLowerCase()))
    );
  }

  async updateFileIndex(filePath: string): Promise<void> {
    try {
      const fileIndex = await this.indexFile(filePath, {
        maxFiles: 1000,
        maxFileSize: 1024 * 1024,
        includePatterns: ['**/*'],
        excludePatterns: [],
        enableASTParsing: true
      });

      if (fileIndex) {
        const fileName = path.basename(filePath);
        this.projectIndex[fileName] = fileIndex;
        this.log(`Updated index for ${fileName}`);
      }
    } catch (error: any) {
      this.log(`Failed to update index for ${filePath}: ${error.message}`, 'error');
    }
  }

  isIndexed(): boolean {
    return Object.keys(this.projectIndex).length > 0;
  }

  getIndexStats(): { fileCount: number; lastIndexTime: number; isIndexing: boolean } {
    return {
      fileCount: Object.keys(this.projectIndex).length,
      lastIndexTime: this.lastIndexTime,
      isIndexing: this.isIndexing
    };
  }

  showDebugOutput() {
    this.outputChannel.show();
    this.log(`Current workspace root: ${this.workspaceRoot}`);
    this.log(`Workspace folders: ${vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath).join(', ') || 'none'}`);
  }
}
