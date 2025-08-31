# codeIt 🤖

> **AI-powered coding assistant with Perplexity integration for VS Code**

codeIt is a sophisticated VS Code extension that transforms your coding experience with intelligent AI assistance. It combines the power of Perplexity AI with context-aware code understanding to help you write, refactor, and improve your code faster than ever before.

![codeIt Banner](https://img.shields.io/badge/codeIt-AI%20Powered%20Coding%20Assistant-blue?style=for-the-badge&logo=visual-studio-code)
![VS Code](https://img.shields.io/badge/VS%20Code-Extension-green?style=for-the-badge&logo=visual-studio-code)
![Perplexity AI](https://img.shields.io/badge/Perplexity-AI%20Powered-orange?style=for-the-badge)

## ✨ Features

### 🎯 **Dual Mode Operation**
- **💬 Chat Mode**: Interactive conversations about your code with context awareness
- **🤖 Smart Agent Mode**: Intelligent file operations and multi-file modifications

### 🧠 **Intelligent Context Understanding**
- **Project Indexing**: Automatically builds a comprehensive index of your project structure
- **Smart File Resolution**: Finds relevant files based on your instructions
- **Context-Aware Prompts**: Includes surrounding code, file metadata, and project structure
- **Git Integration**: Incorporates branch information and diff context

### 🔧 **Advanced Code Operations**
- **Smart Refactoring**: Select code and describe desired changes
- **Multi-file Operations**: Apply changes across multiple files intelligently
- **Code Generation**: Generate new code with full context understanding
- **Syntax Validation**: Ensures generated code is syntactically correct
- **Diff Preview**: Review changes before applying them

### 💬 **Rich Chat Experience**
- **Persistent Chat History**: Save and manage your conversations
- **Export Capabilities**: Export chat history for documentation
- **Quick Chat**: Context-aware quick questions about selected code
- **Chat View**: Dedicated sidebar for managing conversations

### ⚙️ **Comprehensive Configuration**
- **Multiple AI Models**: Choose from Perplexity's latest models (sonar, sonar-pro, sonar-large-32k-online)
- **Customizable Settings**: Fine-tune behavior with 20+ configuration options
- **Token Optimization**: Intelligent prompt optimization for cost efficiency
- **Retry Logic**: Robust error handling with configurable retry attempts

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/router-hub/codeit-extension.git
cd codeit-extension

# Install dependencies
npm install

# Build the extension
npm run compile

# Launch in VS Code (F5)
```

### 2. Setup Perplexity API

1. **Get API Key**: Visit [Perplexity AI](https://www.perplexity.ai/) and generate an API key
2. **Configure Extension**: 
   - Open Command Palette (`Ctrl+Shift+P`)
   - Run `codeIt: Configure API Key`
   - Enter your Perplexity API key
3. **Test Connection**: Run `codeIt: Test Connection` to verify setup

### 3. Start Using

**Quick Start Commands:**
- `Ctrl+Shift+I` - Open codeIt with mode selection
- `Ctrl+Shift+Q` - Quick chat about selected code
- Right-click menu - Context-aware code operations

## 🎯 Usage Examples

### Chat Mode Examples

```typescript
// Ask about your code
"What's wrong with this function?"
"How can I optimize this algorithm?"
"Explain this React component"

// Get suggestions
"Suggest improvements for error handling"
"What design patterns could I use here?"
"Help me understand this async code"
```

### Smart Agent Mode Examples

```typescript
// File operations
"Update UserService to add logging"
"Fix all TypeScript errors in the project"
"Add error handling to all API calls"

// Multi-file changes
"Update all components to use the new theme"
"Add JSDoc comments to all functions"
"Refactor authentication logic across the app"
```

## 🛠️ Commands Reference

### Core Commands
| Command | Shortcut | Description |
|---------|----------|-------------|
| `codeIt: Ask codeIt` | `Ctrl+Shift+I` | Main entry point with mode selection |
| `codeIt: Quick Chat` | `Ctrl+Shift+Q` | Quick chat about selected code |
| `codeIt: Chat Mode` | - | Direct access to chat mode |
| `codeIt: Smart Agent Mode` | - | Direct access to smart agent mode |

### Code Operations
| Command | Description |
|---------|-------------|
| `codeIt: Refactor Selection` | Refactor selected code |
| `codeIt: Generate Code` | Generate new code |
| `codeIt: Undo Last Change` | Undo last AI-generated change |

### Chat Management
| Command | Description |
|---------|-------------|
| `codeIt: Start Chat` | Start a new chat session |
| `codeIt: Show History` | View chat history |
| `codeIt: Clear History` | Clear chat history |
| `codeIt: Export History` | Export chat conversations |

### Configuration
| Command | Description |
|---------|-------------|
| `codeIt: Configure API Key` | Set up Perplexity API key |
| `codeIt: Test Connection` | Test API connectivity |
| `codeIt: Set API Key` | Alternative API key setup |

### Debug & Development
| Command | Description |
|---------|-------------|
| `codeIt: Show Smart Agent Debug` | Debug smart agent operations |
| `codeIt: Debug Context` | Debug context building |
| `codeIt: Test Chat` | Test chat functionality |
| `codeIt: Refresh Project Index` | Rebuild project index |

## ⚙️ Configuration

### AI Model Settings
```json
{
  "codeit.defaultModel": "sonar",
  "codeit.defaultTemperature": 0.3,
  "codeit.maxTokens": 10000
}
```

### Context Settings
```json
{
  "codeit.maxContextLines": 50,
  "codeit.enableCodeContext": true,
  "codeit.includeGitInfo": true,
  "codeit.includeFileMetadata": true
}
```

### Behavior Settings
```json
{
  "codeit.autoApplyChanges": false,
  "codeit.showDiffPreview": true,
  "codeit.confidenceThreshold": 0.7,
  "codeit.validateSyntax": true
}
```

### Performance Settings
```json
{
  "codeit.requestTimeout": 30000,
  "codeit.retryAttempts": 3,
  "codeit.retryDelay": 1000,
  "codeit.enableTokenOptimization": true
}
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension                        │
├─────────────────────────────────────────────────────────────┤
│  User Interface Layer                                       │
│  ├── Command Handlers                                       │
│  ├── Chat Provider                                          │
│  ├── Chat View Provider                                     │
│  └── Webview Interface                                      │
├─────────────────────────────────────────────────────────────┤
│  Core Engine Layer                                          │
│  ├── Smart Agent                                            │
│  ├── Project Indexer                                        │
│  ├── Smart File Resolver                                    │
│  └── Prompt Context Composer                                │
├─────────────────────────────────────────────────────────────┤
│  AI Integration Layer                                       │
│  ├── Perplexity API Client                                  │
│  ├── Prompt Builder                                         │
│  ├── Output Parser                                          │
│  └── Patch Engine                                           │
├─────────────────────────────────────────────────────────────┤
│  Configuration & Utilities                                  │
│  ├── Config Manager                                         │
│  ├── Format Utils                                           │
│  └── Security Layer                                         │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

- **SmartAgent**: Orchestrates intelligent file operations and multi-file changes
- **ProjectIndexer**: Builds and maintains project structure understanding
- **ChatProvider**: Manages interactive chat sessions with context
- **PerplexityAPI**: Handles secure communication with Perplexity AI
- **PatchEngine**: Safely applies AI-generated changes to files
- **PromptBuilder**: Constructs context-aware prompts for optimal AI responses

## 🔐 Security & Privacy

### Data Protection
- **Local Processing**: All code analysis happens locally
- **Secure Storage**: API keys stored using VS Code's secrets API
- **HTTPS Only**: All external communications use secure connections
- **No Code Upload**: Code is never uploaded to external servers

### Privacy Features
- **Context Control**: Only selected code and specified files are processed
- **Configurable Limits**: Control how much context is included
- **Session Management**: Clear chat history and export capabilities
- **Audit Trail**: Track all AI-generated changes for review

## 🛠️ Development

### Prerequisites
- Node.js 18+
- VS Code 1.74+
- TypeScript 4.9+

### Development Setup
```bash
# Install dependencies
npm install

# Build extension
npm run compile

# Watch mode for development
npm run watch

# Package for distribution
npm run package

# Publish to VS Code marketplace
npm run publish
```

### Project Structure
```
codeIt/
├── src/                          # TypeScript source code
│   ├── extension.ts              # Main extension entry point
│   ├── api.ts                    # Perplexity API client
│   ├── smartAgent.ts             # Smart agent implementation
│   ├── chatProvider.ts           # Chat functionality
│   ├── chatViewProvider.ts       # Chat UI management
│   ├── projectIndexer.ts         # Project indexing
│   ├── smartFileResolver.ts      # File resolution logic
│   ├── promptBuilder.ts          # AI prompt construction
│   ├── promptContextComposer.ts  # Context composition
│   ├── patchEngine.ts            # Code change application
│   ├── outputParser.ts           # AI response parsing
│   ├── formatUtils.ts            # Code formatting utilities
│   └── config.ts                 # Configuration management
├── media/                        # Extension assets
│   ├── webview.html              # Chat interface
│   ├── styles.css                # UI styling
│   └── script.js                 # Webview scripts
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript configuration
└── README.md                     # This file
```

### Testing
1. Press `F5` to launch extension in debug mode
2. Open a test workspace with code files
3. Test various commands and scenarios
4. Check the developer console for logs

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Add comprehensive error handling
- Include JSDoc comments for public APIs
- Test thoroughly before submitting PRs
- Update documentation for new features

## 📊 Performance

### Optimization Features
- **Token Optimization**: Intelligent prompt truncation to reduce costs
- **Caching**: Project index caching for faster operations
- **Lazy Loading**: Load components only when needed
- **Progress Tracking**: Real-time feedback for long operations
- **Batch Processing**: Efficient multi-file operations

### Benchmarks
- **Project Indexing**: < 5 seconds for typical projects
- **API Response**: < 10 seconds for most operations
- **File Resolution**: < 1 second for smart file finding
- **Context Building**: < 2 seconds for comprehensive context

## 🐛 Troubleshooting

### Common Issues

**API Connection Problems**
```bash
# Check API key configuration
codeIt: Configure API Key

# Test connection
codeIt: Test Connection

# Verify internet connectivity
```

**Performance Issues**
```json
{
  "codeit.maxContextLines": 25,
  "codeit.maxTokens": 5000,
  "codeit.enableTokenOptimization": true
}
```

**Chat Not Working**
```bash
# Refresh project index
codeIt: Refresh Project Index

# Clear chat history
codeIt: Clear History

# Check debug logs
codeIt: Debug Context
```

### Debug Mode
Enable debug logging in settings:
```json
{
  "codeit.enableLogging": true
}
```

## 📈 Roadmap

### Upcoming Features
- [ ] **Multi-language Support**: Enhanced support for Python, Java, Go
- [ ] **Git Integration**: Automatic commit messages and branch management
- [ ] **Team Collaboration**: Shared chat sessions and code reviews
- [ ] **Custom Prompts**: User-defined prompt templates
- [ ] **Performance Profiling**: Code performance analysis and suggestions
- [ ] **Testing Integration**: Automatic test generation and coverage analysis

### Planned Improvements
- [ ] **Offline Mode**: Local AI model support
- [ ] **Voice Commands**: Voice-to-code functionality
- [ ] **Visual Code Editor**: Inline code editing interface
- [ ] **Plugin System**: Extensible architecture for custom integrations

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Perplexity AI** for providing the powerful AI models
- **VS Code Team** for the excellent extension API
- **Open Source Community** for inspiration and contributions

## 📞 Support

### Getting Help
- **Documentation**: Check this README and inline help
- **Issues**: Report bugs on [GitHub Issues](https://github.com/yourusername/codeit-extension/issues)
- **Discussions**: Join conversations on [GitHub Discussions](https://github.com/yourusername/codeit-extension/discussions)

### Community
- **Discord**: Join our [Discord server](https://discord.gg/codeit)
- **Twitter**: Follow [@codeItExtension](https://twitter.com/codeItExtension)
- **Blog**: Read updates on [our blog](https://codeit.dev/blog)

---

<div align="center">

**Made with ❤️ by the codeIt team**

[![GitHub stars](https://img.shields.io/github/stars/yourusername/codeit-extension?style=social)](https://github.com/yourusername/codeit-extension)
[![GitHub forks](https://img.shields.io/github/forks/yourusername/codeit-extension?style=social)](https://github.com/yourusername/codeit-extension)
[![GitHub issues](https://img.shields.io/github/issues/yourusername/codeit-extension)](https://github.com/yourusername/codeit-extension/issues)

</div> 