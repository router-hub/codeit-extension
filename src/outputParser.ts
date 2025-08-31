export interface ParsedOutput {
  code: string;
  explanation?: string;
  hasCodeBlocks: boolean;
  language?: string;
  confidence: number;
  patchType: 'inline' | 'generation' | 'refactor' | 'multifile';
  metadata: {
    responseType: 'code_only' | 'code_with_explanation' | 'explanation_only' | 'multifile';
    codeBlockCount: number;
    hasInlineComments: boolean;
    preservesFormatting: boolean;
    containsImports: boolean;
  };
  alternatives?: Array<{
    code: string;
    language?: string;
    label?: string;
    confidence: number;
  }>;
}

export interface MultiFileChange {
  filePath: string;
  type: 'create' | 'modify' | 'delete';
  content: string;
  originalContent?: string;
  startLine?: number;
  endLine?: number;
  language?: string;
}

export interface CodeBlock {
  code: string;
  language?: string;
  label?: string;
  confidence: number;
  lineCount: number;
  hasComments: boolean;
  imports: string[];
}

export class OutputParser {
  private static readonly CONFIDENCE_THRESHOLDS = {
    HIGH: 0.8,
    MEDIUM: 0.6,
    LOW: 0.4
  };

  private static readonly LANGUAGE_ALIASES: { [key: string]: string } = {
    'js': 'javascript',
    'ts': 'typescript',
    'jsx': 'javascript',
    'tsx': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'sh': 'bash',
    'yml': 'yaml',
    'md': 'markdown'
  };

  static parseAIResponse(response: string, context?: {
    originalLanguage?: string;
    expectMultiFile?: boolean;
    instruction?: string;
  }): ParsedOutput {
    const trimmed = response.trim();
    
    // Detect response type early
    const responseType = this.detectResponseType(trimmed);
    const isMultiFile = responseType === 'multifile' || context?.expectMultiFile;
    
    if (isMultiFile) {
      return this.parseMultiFileResponseData(trimmed, context);
    }
  
    // Parse code blocks
    const codeBlocks = this.extractEnhancedCodeBlocks(trimmed);
    const hasCodeBlocks = codeBlocks.length > 0;
    
    if (!hasCodeBlocks) {
      return this.parseCodeOnlyResponse(trimmed, context);
    }
  
    // Select primary code block
    const primaryBlock = this.selectPrimaryCodeBlock(codeBlocks, context);
    
    // Safety check - if no primary block found, fallback to code-only parsing
    if (!primaryBlock) {
      return this.parseCodeOnlyResponse(trimmed, context);
    }
    
    const alternatives = codeBlocks.filter(block => block !== primaryBlock);
    
    // Extract explanation
    const explanation = this.extractSmartExplanation(trimmed, codeBlocks, context);
    
    // Calculate confidence
    const confidence = this.calculateResponseConfidence(primaryBlock, explanation, context);
    
    // Determine patch type
    const patchType = this.determinePatchType(primaryBlock, explanation, context);
    
    // Analyze metadata
    const metadata = this.analyzeResponseMetadata(trimmed, codeBlocks);
  
    return {
      code: primaryBlock.code,
      explanation,
      hasCodeBlocks: true,
      language: primaryBlock.language || context?.originalLanguage,
      confidence,
      patchType,
      metadata,
      alternatives: alternatives.length > 0 ? alternatives.map(alt => ({
        code: alt.code,
        language: alt.language,
        label: alt.label,
        confidence: alt.confidence
      })) : undefined
    };
  }
  
  

  static parseMultiFileResponseData(response: string, context?: any): ParsedOutput {
    const multiFileChanges = this.extractMultiFileChanges(response);
    
    if (multiFileChanges.length === 0) {
      // Fallback to single file parsing
      return this.parseAIResponse(response, { ...context, expectMultiFile: false });
    }

    const explanation = this.extractMultiFileExplanation(response, multiFileChanges);
    const confidence = this.calculateMultiFileConfidence(multiFileChanges);

    return {
      code: this.serializeMultiFileChanges(multiFileChanges),
      explanation,
      hasCodeBlocks: true,
      language: 'multifile',
      confidence,
      patchType: 'multifile',
      metadata: {
        responseType: 'multifile',
        codeBlockCount: multiFileChanges.length,
        hasInlineComments: false,
        preservesFormatting: true,
        containsImports: multiFileChanges.some(change => this.containsImports(change.content))
      }
    };
  }

  static parseMultiFileResponse(response: string): MultiFileChange[] {
    const changes: MultiFileChange[] = [];
    
    // Pattern 1: File headers with paths
    const fileHeaderRegex = /(?:^|\n)(?:##?\s*)?(?:File:|Path:)\s*([^\n]+)\n``````/g;
    let match;
    
    while ((match = fileHeaderRegex.exec(response)) !== null) {
      const filePath = match[1].trim();
      const language = match[2] || this.detectLanguageFromPath(filePath);
      const content = match[3].trim();
      
      changes.push({
        filePath,
        type: 'modify',
        content,
        language
      });
    }

    // Pattern 2: Simple code blocks with file comments
    const simpleFileRegex = /``````/g;
    while ((match = simpleFileRegex.exec(response)) !== null) {
      const language = match[1];
      const filePath = match[2].trim();
      const content = match[3].trim();
      
      changes.push({
        filePath,
        type: 'modify',
        content,
        language
      });
    }

    // Pattern 3: Create/Delete annotations
    const actionRegex = /(?:CREATE|MODIFY|DELETE)\s+([^\n]+)\n``````/gi;
    while ((match = actionRegex.exec(response)) !== null) {
      const action = match[0].split(' ')[0].toLowerCase() as 'create' | 'modify' | 'delete';
      const filePath = match[1].trim();
      const language = match[2] || this.detectLanguageFromPath(filePath);
      const content = match[3].trim();
      
      changes.push({
        filePath,
        type: action,
        content,
        language
      });
    }

    return changes;
  }

  private static extractEnhancedCodeBlocks(response: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    
    // Standard code blocks pattern
    const codeBlockRegex = /``````/g;
    let match;
    
    while ((match = codeBlockRegex.exec(response)) !== null) {
      const language = match[1] || 'text';
      const code = match[2].trim();
      
      if (code.length === 0) continue;

      // Extract label if present
      const label = this.extractBlockLabel(response, match.index);
      
      // Calculate block-specific confidence
      const confidence = this.calculateBlockConfidence(code, language);
      
      // Analyze code structure
      const lineCount = code.split('\n').length;
      const hasComments = /\/\/|\/\*|\*\/|#|<!--/.test(code);
      const imports = this.extractImportsFromCode(code, language);

      blocks.push({
        code,
        language: this.normalizeLanguage(language),
        label,
        confidence,
        lineCount,
        hasComments,
        imports
      });
    }

    // Remove duplicates
    return this.deduplicateCodeBlocks(blocks);
  }

  private static selectPrimaryCodeBlock(blocks: CodeBlock[], context?: any): CodeBlock {
    if (blocks.length === 1) return blocks[0];

    // Scoring criteria for primary block selection
    const scoredBlocks = blocks.map(block => {
      let score = block.confidence;
      
      // Prefer blocks with matching language
      if (context?.originalLanguage && block.language === context.originalLanguage) {
        score += 0.2;
      }
      
      // Prefer blocks with more substantial code
      if (block.lineCount > 5) score += 0.1;
      if (block.lineCount > 20) score += 0.1;
      
      // Prefer blocks with imports (suggests complete code)
      if (block.imports.length > 0) score += 0.1;
      
      // Prefer labeled blocks (suggests intentional alternatives)
      if (block.label) score += 0.05;
      
      return { block, score };
    });

    scoredBlocks.sort((a, b) => b.score - a.score);
    return scoredBlocks[0].block;
  }

private static extractSmartExplanation(response: string, codeBlocks: CodeBlock[], context?: any): string | undefined {
  let explanation = response;
  
  // Remove all code blocks
  codeBlocks.forEach(block => {
    // Create a more flexible regex pattern to match code blocks
    const escapedCode = this.escapeRegex(block.code);
    const blockPattern = new RegExp(`\`\`\`\\w*\\n?${escapedCode}\\n?\`\`\``, 'g');
    explanation = explanation.replace(blockPattern, '');
    
    // Also try to match without language specifier
    const simpleBlockPattern = new RegExp(`\`\`\`\\n?${escapedCode}\\n?\`\`\``, 'g');
    explanation = explanation.replace(simpleBlockPattern, '');
    
    // Remove any remaining triple backticks that might be left over
    explanation = explanation.replace(/``````/g, '');
  });

  // Clean up explanation
  explanation = explanation.trim();
  
  // Remove common AI response patterns (apply to each line/paragraph)
  const cleanupPatterns = [
    /^(?:here'?s|this is|i'?ve|the following is)\s+(?:the\s+)?(?:improved|updated|refactored|fixed|modified)\s+(?:code|version):?\s*/gmi,
    /^(?:the\s+)?(?:improved|updated|refactored|fixed|modified)\s+code\s+(?:is|follows):?\s*/gmi,
    /^(?:improved|updated|refactored|fixed|modified)\s+(?:code|version):?\s*/gmi,
    /^here'?s\s+how\s+(?:you\s+can|to|i'?d)\s+(?:improve|update|refactor|fix)\s+(?:the\s+code|this|it):?\s*/gmi,
    /^(?:i'?ve|i\s+have)\s+(?:improved|updated|refactored|fixed|modified)\s+(?:the\s+code|your\s+code):?\s*/gmi,
    /^(?:codeit|code\s*it)\s+(?:suggests|recommends|proposes):?\s*/gmi
  ];

  cleanupPatterns.forEach(pattern => {
    explanation = explanation.replace(pattern, '');
  });

  // Remove empty lines and clean up whitespace
  explanation = explanation
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');

  // Extract meaningful explanation
  const meaningfulParts = explanation
    .split(/\n\s*\n/)
    .filter(part => part.trim().length > 10)
    .filter(part => !this.isCodeLike(part));

  if (meaningfulParts.length === 0) return undefined;

  return meaningfulParts.join('\n\n').trim();
}


  private static calculateResponseConfidence(block: CodeBlock, explanation?: string, context?: any): number {
    let confidence = block.confidence;
    
    // Factor in explanation quality
    if (explanation) {
      const explanationQuality = Math.min(explanation.length / 100, 1) * 0.1;
      confidence += explanationQuality;
    }
    
    // Factor in context matching
    if (context?.instruction) {
      const contextRelevance = this.assessContextRelevance(block.code, context.instruction);
      confidence += contextRelevance * 0.2;
    }
    
    return Math.min(confidence, 1.0);
  }

  private static determinePatchType(block: CodeBlock, explanation?: string, context?: any): 'inline' | 'generation' | 'refactor' | 'multifile' {
    // Check for refactoring indicators
    const refactorKeywords = ['refactor', 'restructure', 'reorganize', 'extract', 'rename'];
    if (explanation && refactorKeywords.some(keyword => explanation.toLowerCase().includes(keyword))) {
      return 'refactor';
    }
    
    // Check for generation indicators
    const generationKeywords = ['create', 'generate', 'add', 'implement', 'write'];
    if (context?.instruction && generationKeywords.some(keyword => context.instruction.toLowerCase().includes(keyword))) {
      return 'generation';
    }
    
    // Default to inline for modifications
    return 'inline';
  }

  private static analyzeResponseMetadata(response: string, codeBlocks: CodeBlock[]): ParsedOutput['metadata'] {
    const hasInlineComments = codeBlocks.some(block => block.hasComments);
    const containsImports = codeBlocks.some(block => block.imports.length > 0);
    
    let responseType: ParsedOutput['metadata']['responseType'] = 'code_only';
    if (codeBlocks.length === 0) responseType = 'explanation_only';
    else if (response.replace(/``````/g, '').trim().length > 50) responseType = 'code_with_explanation';
    
    return {
      responseType,
      codeBlockCount: codeBlocks.length,
      hasInlineComments,
      preservesFormatting: this.checkFormattingPreservation(codeBlocks),
      containsImports
    };
  }

  private static parseCodeOnlyResponse(response: string, context?: any): ParsedOutput {
    // Handle responses that are pure code without markdown blocks
    const language = context?.originalLanguage || this.detectLanguageFromCode(response);
    const confidence = this.calculateCodeOnlyConfidence(response, context);
    
    return {
      code: response,
      hasCodeBlocks: false,
      language,
      confidence,
      patchType: 'inline',
      metadata: {
        responseType: 'code_only',
        codeBlockCount: 0,
        hasInlineComments: /\/\/|\/\*|\*\/|#/.test(response),
        preservesFormatting: true,
        containsImports: this.containsImports(response)
      }
    };
  }

private static detectResponseType(response: string): 'code_only' | 'code_with_explanation' | 'explanation_only' | 'multifile' {
  const hasCodeBlocks = /``````/.test(response);
  const hasFileHeaders = /(?:^|\n)(?:##?\s*)?(?:File:|Path:)\s*[^\n]+/i.test(response);
  
  // Count code blocks by splitting on triple backticks
  const codeBlockParts = response.split('```');
  const hasMultipleCodeBlocks = codeBlockParts.length > 4; // More than 2 code blocks (each block uses 2 triple backticks)
  
  if (hasFileHeaders || hasMultipleCodeBlocks) {
    return 'multifile';
  }
  
  if (!hasCodeBlocks) {
    return this.isCodeLike(response) ? 'code_only' : 'explanation_only';
  }
  
  const textWithoutCode = response.replace(/``````/g, '');
  return textWithoutCode.trim().length > 50 ? 'code_with_explanation' : 'code_only';
}



private static extractBlockLabel(response: string, blockIndex: number): string | undefined {
  const beforeBlock = response.substring(Math.max(0, blockIndex - 200), blockIndex);
  const labelPatterns = [
    /(?:Option|Alternative|Solution)\s+(\d+):?\s*([^\n]*)/i,
    /(?:Version|Approach)\s+(\d+):?\s*([^\n]*)/i,
    /(\d+)\.\s*([^\n]*)/,
    /##\s*([^\n]+)/
  ];

  for (const pattern of labelPatterns) {
    const match = beforeBlock.match(pattern);
    if (match) {
      return match[0].trim(); 
    }
  }

  return undefined;
}


  private static calculateBlockConfidence(code: string, language: string): number {
    let confidence = 0.7;
    
    // Check syntax validity (simplified)
    if (this.hasValidSyntax(code, language)) confidence += 0.2;
    
    // Check code completeness
    if (this.isCompleteCode(code, language)) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  private static normalizeLanguage(language: string): string {
    return this.LANGUAGE_ALIASES[language.toLowerCase()] || language.toLowerCase();
  }

  private static extractImportsFromCode(code: string, language: string): string[] {
    const patterns: { [key: string]: RegExp[] } = {
      'javascript': [/^import\s+.*from\s+['"].*['"]$/gm, /^const\s+.*=\s*require$$['"].*['"]$$$/gm],
      'typescript': [/^import\s+.*from\s+['"].*['"]$/gm, /^import\s+type\s+.*from\s+['"].*['"]$/gm],
      'python': [/^import\s+.*$/gm, /^from\s+.*import\s+.*$/gm],
      'java': [/^import\s+.*$/gm],
      'csharp': [/^using\s+.*$/gm]
    };

    const langPatterns = patterns[language] || [];
    const imports: string[] = [];

    langPatterns.forEach(pattern => {
      const matches = code.match(pattern) || [];
      imports.push(...matches);
    });

    return imports;
  }

  private static deduplicateCodeBlocks(blocks: CodeBlock[]): CodeBlock[] {
    const unique: CodeBlock[] = [];
    const seen = new Set<string>();

    blocks.forEach(block => {
      const hash = this.hashCode(block.code);
      if (!seen.has(hash)) {
        seen.add(hash);
        unique.push(block);
      }
    });

    return unique;
  }

  private static isCodeLike(text: string): boolean {
    const codeIndicators = [
      /[{}();]/, // Common programming punctuation
      /^\s*(?:function|class|const|let|var|def|import|from)\s+/m,
      /^\s*(?:if|for|while|switch|try|catch)\s*$$/m,
      /^\s*\/\/|^\s*\/\*|^\s*#/m // Comments
    ];

    return codeIndicators.some(pattern => pattern.test(text));
  }

  private static assessContextRelevance(code: string, instruction: string): number {
    const instructionWords = instruction.toLowerCase().split(/\s+/);
    const codeWords = code.toLowerCase().split(/\s+/);
    
    const commonWords = instructionWords.filter(word => 
      word.length > 3 && codeWords.includes(word)
    );
    
    return Math.min(commonWords.length / instructionWords.length, 1);
  }

  private static checkFormattingPreservation(blocks: CodeBlock[]): boolean {
    return blocks.every(block => {
      const lines = block.code.split('\n');
      return lines.some(line => line.match(/^\s+/)); // Has indentation
    });
  }

  private static calculateCodeOnlyConfidence(code: string, context?: any): number {
    let confidence = 0.6;
    
    if (this.isCodeLike(code)) confidence += 0.2;
    if (context?.originalLanguage && this.detectLanguageFromCode(code) === context.originalLanguage) {
      confidence += 0.2;
    }
    
    return Math.min(confidence, 1.0);
  }

  private static detectLanguageFromCode(code: string): string {
    // Simple heuristics for language detection
    if (/^\s*import\s+.*from\s+['"].*['"]|^\s*const\s+.*=\s*require$$/m.test(code)) return 'javascript';
    if (/^\s*import\s+.*from\s+['"].*['"].*|^\s*interface\s+|^\s*type\s+/m.test(code)) return 'typescript';
    if (/^\s*def\s+|^\s*import\s+|^\s*from\s+.*import/m.test(code)) return 'python';
    if (/^\s*public\s+class\s+|^\s*import\s+java\./m.test(code)) return 'java';
    
    return 'text';
  }

  private static detectLanguageFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: { [key: string]: string } = {
      'js': 'javascript', 'ts': 'typescript', 'py': 'python', 'java': 'java',
      'cpp': 'cpp', 'c': 'c', 'cs': 'csharp', 'php': 'php', 'rb': 'ruby',
      'go': 'go', 'rs': 'rust', 'swift': 'swift', 'kt': 'kotlin'
    };
    return languageMap[ext || ''] || 'text';
  }

  private static containsImports(code: string): boolean {
    return /^\s*(?:import|from|using|include|require)\s+/m.test(code);
  }

  private static hasValidSyntax(code: string, language: string): boolean {
    // Simplified syntax validation
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
  }

  private static isCompleteCode(code: string, language: string): boolean {
    // Check for common completeness indicators
    const trimmed = code.trim();
    if (trimmed.length === 0) return false;
    
    // Language-specific completeness checks
    switch (language) {
      case 'javascript':
      case 'typescript':
        return !trimmed.endsWith(',') && !trimmed.endsWith('.');
      case 'python':
        return !/:\s*$/.test(trimmed);
      default:
        return !trimmed.endsWith(',') && !trimmed.endsWith(';');
    }
  }

  private static hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  private static escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Enhanced utility methods for multi-file support
  private static extractMultiFileChanges(response: string): MultiFileChange[] {
    return this.parseMultiFileResponse(response);
  }

private static extractMultiFileExplanation(response: string, changes: MultiFileChange[]): string | undefined {
  let explanation = response;
  
  // Remove file blocks
  changes.forEach(change => {
    const escapedFilePath = this.escapeRegex(change.filePath);
    const pattern = new RegExp(`(?:File:|Path:)\\s*${escapedFilePath}[\\s\\S]*?\`\`\`[\\s\\S]*?\`\`\``, 'g');
    explanation = explanation.replace(pattern, '');
  });
  
  // Clean up any remaining empty sections and extra whitespace
  explanation = explanation
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove multiple empty lines
    .trim();
  
  return explanation || undefined;
}


  private static calculateMultiFileConfidence(changes: MultiFileChange[]): number {
    const validChanges = changes.filter(change => change.content.trim().length > 0);
    return validChanges.length / changes.length * 0.8;
  }

  private static serializeMultiFileChanges(changes: MultiFileChange[]): string {
    return JSON.stringify(changes, null, 2);
  }

  // Public API methods
static cleanCode(code: string): string {
  return code
    .replace(/^```(\w*)\n/, '')
    .replace(/\n```$/g, '')
    .trim();
}


  static detectLanguageFromResponse(response: string): string | undefined {
    const match = response.match(/```(\w+)/);
    return match ? this.normalizeLanguage(match[1]) : undefined;
  }

static hasMultipleCodeBlocks(response: string): boolean {
  const matches = response.match(/```[\s\S]*?```/g);
  return matches ? matches.length > 1 : false;
}



  static extractAllCodeBlocks(response: string): Array<{ code: string; language?: string; label?: string }> {
    const blocks = this.extractEnhancedCodeBlocks(response);
    return blocks.map(block => ({
      code: block.code,
      language: block.language,
      label: block.label
    }));
  }
}
