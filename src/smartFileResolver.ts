import { ProjectIndexer, FileIndex, ProjectIndex } from './projectIndexer';
import * as path from 'path';
import * as vscode from 'vscode';

export interface FileMatch {
  file: FileIndex;
  score: number;
  matchType: 'exact' | 'class' | 'function' | 'export' | 'fuzzy';
  matchReason: string;
}

export interface ResolverOptions {
  maxResults: number;
  minScore: number;
  enableFuzzyMatching: boolean;
  prioritizeExactMatches: boolean;
}

export class SmartFileResolver {
  private static instance: SmartFileResolver;
  private indexer: ProjectIndexer;
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.indexer = ProjectIndexer.getInstance();
    this.outputChannel = vscode.window.createOutputChannel("codeIt Smart Resolver");
  }

  static getInstance(): SmartFileResolver {
    if (!SmartFileResolver.instance) {
      SmartFileResolver.instance = new SmartFileResolver();
    }
    return SmartFileResolver.instance;
  }

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [SmartFileResolver] ${message}`;
    
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

  async resolveFiles(instruction: string, options: Partial<ResolverOptions> = {}): Promise<FileMatch[]> {
    const finalOptions: ResolverOptions = {
      maxResults: 10,
      minScore: 0.1,
      enableFuzzyMatching: true,
      prioritizeExactMatches: true,
      ...options
    };

    this.log(`Resolving files for instruction: "${instruction}"`);

    // Ensure index is available
    if (!this.indexer.isIndexed()) {
      this.log('Project not indexed, building index...');
      await this.indexer.buildIndex();
    }

    const index = this.indexer.getIndex();
    const matches: FileMatch[] = [];

    // Extract potential identifiers from instruction
    const identifiers = this.extractIdentifiers(instruction);
    this.log(`Extracted identifiers: ${identifiers.join(', ')}`);

    // 1. First, try to find exact file name matches
    const exactMatches: FileMatch[] = [];
    for (const identifier of identifiers) {
      const matches = this.findExactFileMatches(identifier, index);
      exactMatches.push(...matches);
    }

    // If we found exact matches, return only the best one
    if (exactMatches.length > 0) {
      const bestExactMatch = exactMatches
        .sort((a, b) => b.score - a.score)
        .slice(0, 1);
      
      this.log(`Found ${bestExactMatch.length} exact file match(es)`);
      bestExactMatch.forEach(match => {
        this.log(`  - ${match.file.relativePath} (${match.matchType}, score: ${match.score.toFixed(2)}) - ${match.matchReason}`);
      });

      return bestExactMatch;
    }

    // 2. If no exact matches, then look for other types of matches
    this.log('No exact matches found, looking for other types of matches...');

    // Class name matches
    for (const identifier of identifiers) {
      const classMatches = this.findClassMatches(identifier, index);
      matches.push(...classMatches);
    }

    // Function name matches  
    for (const identifier of identifiers) {
      const functionMatches = this.findFunctionMatches(identifier, index);
      matches.push(...functionMatches);
    }

    // Export matches
    for (const identifier of identifiers) {
      const exportMatches = this.findExportMatches(identifier, index);
      matches.push(...exportMatches);
    }

    // Fuzzy matches (if enabled)
    if (finalOptions.enableFuzzyMatching) {
      for (const identifier of identifiers) {
        const fuzzyMatches = this.findFuzzyMatches(identifier, index);
        matches.push(...fuzzyMatches);
      }
    }

    // Remove duplicates and sort by score
    const uniqueMatches = this.deduplicateMatches(matches);
    const sortedMatches = uniqueMatches
      .filter(match => match.score >= finalOptions.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, finalOptions.maxResults);

    this.log(`Found ${sortedMatches.length} file matches`);
    sortedMatches.forEach(match => {
      this.log(`  - ${match.file.relativePath} (${match.matchType}, score: ${match.score.toFixed(2)}) - ${match.matchReason}`);
    });

    return sortedMatches;
  }

  private extractIdentifiers(instruction: string): string[] {
    // Extract potential class names, function names, and file names
    const identifiers: string[] = [];
    
    // Common patterns for code elements
    const patterns = [
      // Class names (PascalCase)
      /\b[A-Z][a-zA-Z0-9]*(?:Service|Controller|Manager|Handler|Provider|Repository|Model|Entity|Component|Interface|Class)\b/g,
      // General PascalCase identifiers
      /\b[A-Z][a-zA-Z0-9]{2,}\b/g,
      // camelCase identifiers
      /\b[a-z][a-zA-Z0-9]{2,}\b/g,
      // snake_case identifiers
      /\b[a-z][a-z0-9_]+[a-z0-9]\b/g,
      // File names with extensions
      /\b[a-zA-Z0-9_-]+\.[a-zA-Z]{1,4}\b/g
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(instruction)) !== null) {
        identifiers.push(match[0]);
      }
    }

    // Also split by common delimiters
    const words = instruction.split(/[\s,\.;:!?\-_]+/);
    identifiers.push(...words.filter(word => word.length > 2));

    // Remove duplicates and common words
    const commonWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'among', 'update', 'add', 'remove', 'delete', 'create', 'modify', 'change', 'fix', 'implement', 'refactor']);
    
    return [...new Set(identifiers)]
      .filter(id => id.length > 2 && !commonWords.has(id.toLowerCase()));
  }

  private findExactFileMatches(identifier: string, index: ProjectIndex): FileMatch[] {
    const matches: FileMatch[] = [];
    
    Object.values(index).forEach(file => {
      const fileName = path.basename(file.path, path.extname(file.path));
      
      // Exact file name match
      if (fileName.toLowerCase() === identifier.toLowerCase()) {
        matches.push({
          file,
          score: 1.0,
          matchType: 'exact',
          matchReason: `Exact file name match: ${fileName}`
        });
      }
      
      // File name contains identifier
      else if (fileName.toLowerCase().includes(identifier.toLowerCase())) {
        const score = identifier.length / fileName.length;
        matches.push({
          file,
          score: score * 0.8, // Slightly lower than exact match
          matchType: 'exact',
          matchReason: `File name contains: ${identifier}`
        });
      }
    });

    return matches;
  }

  private findClassMatches(identifier: string, index: ProjectIndex): FileMatch[] {
    const matches: FileMatch[] = [];
    
    Object.values(index).forEach(file => {
      file.classes.forEach(className => {
        if (className.toLowerCase() === identifier.toLowerCase()) {
          matches.push({
            file,
            score: 0.9,
            matchType: 'class',
            matchReason: `Exact class match: ${className}`
          });
        } else if (className.toLowerCase().includes(identifier.toLowerCase())) {
          const score = (identifier.length / className.length) * 0.7;
          matches.push({
            file,
            score,
            matchType: 'class',
            matchReason: `Class contains: ${identifier} in ${className}`
          });
        }
      });
    });

    return matches;
  }

  private findFunctionMatches(identifier: string, index: ProjectIndex): FileMatch[] {
    const matches: FileMatch[] = [];
    
    Object.values(index).forEach(file => {
      file.functions.forEach(functionName => {
        if (functionName.toLowerCase() === identifier.toLowerCase()) {
          matches.push({
            file,
            score: 0.8,
            matchType: 'function',
            matchReason: `Exact function match: ${functionName}`
          });
        } else if (functionName.toLowerCase().includes(identifier.toLowerCase())) {
          const score = (identifier.length / functionName.length) * 0.6;
          matches.push({
            file,
            score,
            matchType: 'function',
            matchReason: `Function contains: ${identifier} in ${functionName}`
          });
        }
      });
    });

    return matches;
  }

  private findExportMatches(identifier: string, index: ProjectIndex): FileMatch[] {
    const matches: FileMatch[] = [];
    
    Object.values(index).forEach(file => {
      file.exports.forEach(exportName => {
        if (exportName.toLowerCase() === identifier.toLowerCase()) {
          matches.push({
            file,
            score: 0.85,
            matchType: 'export',
            matchReason: `Exact export match: ${exportName}`
          });
        } else if (exportName.toLowerCase().includes(identifier.toLowerCase())) {
          const score = (identifier.length / exportName.length) * 0.65;
          matches.push({
            file,
            score,
            matchType: 'export',
            matchReason: `Export contains: ${identifier} in ${exportName}`
          });
        }
      });
    });

    return matches;
  }

  private findFuzzyMatches(identifier: string, index: ProjectIndex): FileMatch[] {
    const matches: FileMatch[] = [];
    
    Object.values(index).forEach(file => {
      // Fuzzy match against file path
      const pathScore = this.calculateFuzzyScore(identifier, file.relativePath);
      if (pathScore > 0.3) {
        matches.push({
          file,
          score: pathScore * 0.5, // Lower weight for fuzzy matches
          matchType: 'fuzzy',
          matchReason: `Fuzzy path match: ${identifier} ~ ${file.relativePath}`
        });
      }

      // Fuzzy match against summary
      const summaryScore = this.calculateFuzzyScore(identifier, file.summary);
      if (summaryScore > 0.3) {
        matches.push({
          file,
          score: summaryScore * 0.4,
          matchType: 'fuzzy',
          matchReason: `Fuzzy summary match: ${identifier}`
        });
      }
    });

    return matches;
  }

  private calculateFuzzyScore(needle: string, haystack: string): number {
    if (!needle || !haystack) return 0;
    
    const needleLower = needle.toLowerCase();
    const haystackLower = haystack.toLowerCase();
    
    // Simple fuzzy scoring algorithm
    if (haystackLower.includes(needleLower)) {
      return needleLower.length / haystackLower.length;
    }
    
    // Character-by-character matching
    let matches = 0;
    let needleIndex = 0;
    
    for (let i = 0; i < haystackLower.length && needleIndex < needleLower.length; i++) {
      if (haystackLower[i] === needleLower[needleIndex]) {
        matches++;
        needleIndex++;
      }
    }
    
    return matches / needleLower.length * 0.8; // Scale down for character matching
  }

  private deduplicateMatches(matches: FileMatch[]): FileMatch[] {
    const seen = new Set<string>();
    const uniqueMatches: FileMatch[] = [];
    
    for (const match of matches) {
      const key = match.file.path;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueMatches.push(match);
      } else {
        // If we've seen this file before, keep the higher scoring match
        const existingIndex = uniqueMatches.findIndex(m => m.file.path === key);
        if (existingIndex !== -1 && match.score > uniqueMatches[existingIndex].score) {
          uniqueMatches[existingIndex] = match;
        }
      }
    }
    
    return uniqueMatches;
  }

  // Convenience methods for specific searches
  async findServiceFiles(serviceName: string): Promise<FileMatch[]> {
    return this.resolveFiles(`${serviceName} service`, {
      maxResults: 5,
      prioritizeExactMatches: true
    });
  }

  async findControllerFiles(controllerName: string): Promise<FileMatch[]> {
    return this.resolveFiles(`${controllerName} controller`, {
      maxResults: 5,
      prioritizeExactMatches: true
    });
  }

  async findUtilityFiles(utilName: string): Promise<FileMatch[]> {
    return this.resolveFiles(`${utilName} util utility helper`, {
      maxResults: 3,
      enableFuzzyMatching: true
    });
  }

  showDebugOutput() {
    this.outputChannel.show();
  }
}
