/**
 * Formatting utilities for codeIt chat interface
 */

export interface FormatOptions {
  enableCodeBlocks?: boolean;
  enableInlineCode?: boolean;
  enableBold?: boolean;
  enableItalic?: boolean;
  enableLinks?: boolean;
}

export class FormatUtils {
  /**
   * Format text with markdown-like formatting
   */
  static formatText(text: string, options: FormatOptions = {}): string {
    const {
      enableCodeBlocks = true,
      enableInlineCode = true,
      enableBold = true,
      enableItalic = true,
      enableLinks = true
    } = options;
  
    let formatted = text;
  
    // Handle code blocks first (3 backticks, not 6)
    if (enableCodeBlocks) {
      formatted = formatted.replace(/``````/g, (match, lang, code) => {
        const langClass = lang ? ` language-${lang}` : '';
        return `<div class="code-block${langClass}">${FormatUtils.escapeHtml(code.trim())}</div>`;
      });
    }
  
    // Handle inline code
    if (enableInlineCode) {
      formatted = formatted.replace(/`([^`\n]+)`/g, (match, code) => {
        return `<code style="background: var(--vscode-textPreformat-background); padding: 2px 4px; border-radius: 3px;">${FormatUtils.escapeHtml(code)}</code>`;
      });
    }
  
    // Handle bold text
    if (enableBold) {
      formatted = formatted.replace(/\*\*([^*\n]+?)\*\*/g, (match, text) => {
        return `<strong>${FormatUtils.escapeHtml(text)}</strong>`;
      });
    }
  
    // Handle italic text (simple approach without negative lookbehind)
    if (enableItalic) {
      // First replace bold markers temporarily
      formatted = formatted.replace(/\*\*([^*\n]+?)\*\*/g, '___BOLD_START___$1___BOLD_END___');
      // Then handle single asterisks
      formatted = formatted.replace(/\*([^*\n]+?)\*/g, (match, text) => {
        return `<em>${FormatUtils.escapeHtml(text)}</em>`;
      });
      // Restore bold markers
      formatted = formatted.replace(/___BOLD_START___([^_]+?)___BOLD_END___/g, '<strong>$1</strong>');
    }
  
    // Handle links
    if (enableLinks) {
      formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
        return `<a href="${FormatUtils.escapeHtml(url)}" target="_blank" style="color: var(--vscode-textLink-foreground);">${FormatUtils.escapeHtml(linkText)}</a>`;
      });
    }
  
    return formatted;
  }
  

  /**
   * Escape HTML characters to prevent XSS
   */
  static escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Format code blocks with language detection
   */
  static formatCodeBlock(code: string, language?: string): string {
    const langClass = language ? ` language-${language}` : '';
    return `<div class="code-block${langClass}">${this.escapeHtml(code)}</div>`;
  }

  /**
   * Format inline code
   */
  static formatInlineCode(code: string): string {
    return `<code style="background: var(--vscode-textPreformat-background); padding: 2px 4px; border-radius: 3px;">${this.escapeHtml(code)}</code>`;
  }

  /**
   * Format bold text
   */
  static formatBold(text: string): string {
    return `<strong>${this.escapeHtml(text)}</strong>`;
  }

  /**
   * Format italic text
   */
  static formatItalic(text: string): string {
    return `<em>${this.escapeHtml(text)}</em>`;
  }

  /**
   * Format links
   */
  static formatLink(text: string, url: string): string {
    return `<a href="${this.escapeHtml(url)}" target="_blank" style="color: var(--vscode-textLink-foreground);">${this.escapeHtml(text)}</a>`;
  }

  /**
   * Detect and format markdown in text
   */
  static detectAndFormat(text: string): string {
    // Simple approach: apply formatting directly
    return FormatUtils.formatText(text);
  }
  


  /**
   * Create a formatted message HTML
   */
  static createMessageHtml(content: string, timestamp: Date, metadata?: any): string {
    const formattedContent = this.detectAndFormat(content);
    
    let metadataHtml = '';
    if (metadata) {
      const parts = [];
      if (metadata.modelUsed) parts.push(`Model: ${metadata.modelUsed}`);
      if (metadata.tokensUsed) parts.push(`Tokens: ${metadata.tokensUsed}`);
      if (metadata.responseTime) parts.push(`Time: ${metadata.responseTime}ms`);
      
      if (parts.length > 0) {
        metadataHtml = `<div class="metadata">${parts.join(' • ')}</div>`;
      }
    }

    return `
      <div class="message-content">${formattedContent}</div>
      <div class="timestamp">${timestamp.toLocaleTimeString()}</div>
      ${metadataHtml}
    `;
  }
} 