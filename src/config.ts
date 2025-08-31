import * as vscode from "vscode";

const SECRET_KEY = "codeit-api-key";
const CONFIG_SECTION = "codeit";

export class ConfigManager {
  private static instance: ConfigManager;
  private context: vscode.ExtensionContext;
  private configWatcher?: vscode.Disposable;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.setupConfigWatcher();
  }

  static getInstance(context: vscode.ExtensionContext): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(context);
    }
    return ConfigManager.instance;
  }

  // API Key Management
  async getApiKey(): Promise<string | undefined> {
    return await this.context.secrets.get(SECRET_KEY);
  }

  async setApiKey(apiKey: string): Promise<void> {
    await this.context.secrets.store(SECRET_KEY, apiKey);
  }

  async hasApiKey(): Promise<boolean> {
    const key = await this.getApiKey();
    return !!key && key.length > 0;
  }

  async clearApiKey(): Promise<void> {
    await this.context.secrets.delete(SECRET_KEY);
    vscode.window.showInformationMessage(
      "🗑️ codeIt API key cleared successfully"
    );
  }

  async promptForApiKey(): Promise<string | undefined> {
    const apiKey = await vscode.window.showInputBox({
      prompt: "Enter your Perplexity API key for codeIt",
      password: true,
      placeHolder: "pplx-... or pcl_...",
      validateInput: (value) => {
        if (!value) return "API key is required for codeIt to function";
        if (!value.startsWith("pplx-") && !value.startsWith("pcl_")) {
          return 'API key should start with "pplx-" or "pcl_"';
        }
        if (value.length < 10) return "API key appears to be too short";
        return null;
      },
      ignoreFocusOut: true,
    });

    if (apiKey) {
      await this.setApiKey(apiKey);
      vscode.window.showInformationMessage(
        "✅ codeIt API key saved successfully!"
      );
    }

    return apiKey;
  }

  async updateApiKey(): Promise<string | undefined> {
    const currentKey = await this.getApiKey();

    if (currentKey) {
      const action = await vscode.window.showWarningMessage(
        "codeIt API key is already configured. Replace it?",
        { modal: true },
        "Yes, Replace",
        "Cancel"
      );

      if (action !== "Yes, Replace") {
        return currentKey;
      }
    }

    return await this.promptForApiKey();
  }

  async validateApiKey(): Promise<boolean> {
    const apiKey = await this.getApiKey();

    if (!apiKey) {
      return false;
    }

    // Enhanced validation
    const isValidFormat =
      (apiKey.startsWith("pplx-") || apiKey.startsWith("pcl_")) &&
      apiKey.length >= 10;

    if (!isValidFormat) {
      return false;
    }

    // Additional validation: check for common invalid patterns
    const invalidPatterns = [
      /^(pplx-|pcl_)(test|demo|example|placeholder)/i,
      /^(pplx-|pcl_)(xxx|000|111|aaa)/i,
    ];

    return !invalidPatterns.some((pattern) => pattern.test(apiKey));
  }

  // Configuration Management
  getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_SECTION);
  }

  getConfigValue<T>(key: string, defaultValue: T): T {
    return this.getConfiguration().get<T>(key, defaultValue);
  }

  async setConfigValue(
    key: string,
    value: any,
    target?: vscode.ConfigurationTarget
  ): Promise<void> {
    await this.getConfiguration().update(
      key,
      value,
      target || vscode.ConfigurationTarget.Global
    );
  }

  // Core configuration options
  getMaxContextLines(): number {
    return this.getConfigValue("maxContextLines", 50);
  }

  getDefaultConfidenceThreshold(): number {
    return this.getConfigValue("confidenceThreshold", 0.7);
  }

  getAutoApplyChanges(): boolean {
    return this.getConfigValue("autoApplyChanges", false);
  }

  getShowDiffPreview(): boolean {
    return this.getConfigValue("showDiffPreview", true);
  }

  getValidateSyntax(): boolean {
    return this.getConfigValue("validateSyntax", true);
  }

  getTrackChanges(): boolean {
    return this.getConfigValue("trackChanges", true);
  }

  getShowAlternatives(): boolean {
    return this.getConfigValue("showAlternatives", true);
  }

  getTimeout(): number {
    return this.getConfigValue("requestTimeout", 30000);
  }

  // API configuration options
  getDefaultModel(): string {
    return this.getConfigValue("defaultModel", "sonar");
  }

  getDefaultTemperature(): number {
    return this.getConfigValue("defaultTemperature", 0.3);
  }

  getMaxTokens(): number {
    return this.getConfigValue("maxTokens", 10000);
  }

  getRetryAttempts(): number {
    return this.getConfigValue("retryAttempts", 3);
  }

  getRetryDelay(): number {
    return this.getConfigValue("retryDelay", 1000);
  }

  // Feature configuration options
  getEnableLogging(): boolean {
    return this.getConfigValue("enableLogging", false);
  }

  getAutoSaveChats(): boolean {
    return this.getConfigValue("autoSaveChats", true);
  }

  getChatHistoryLimit(): number {
    return this.getConfigValue("chatHistoryLimit", 100);
  }

  getShowNotifications(): boolean {
    return this.getConfigValue("showNotifications", true);
  }

  getEnableCodeContext(): boolean {
    return this.getConfigValue("enableCodeContext", true);
  }

  getIncludeGitInfo(): boolean {
    return this.getConfigValue("includeGitInfo", true);
  }

  getPreferredCodeStyle(): "preserve" | "format" | "optimize" {
    return this.getConfigValue("preferredCodeStyle", "preserve");
  }

  // NEW: Advanced prompt configuration options
  getEnableTokenOptimization(): boolean {
    return this.getConfigValue("enableTokenOptimization", true);
  }

  getPrioritizePrecision(): boolean {
    return this.getConfigValue("prioritizePrecision", true);
  }

  getUseMarkdownSections(): boolean {
    return this.getConfigValue("useMarkdownSections", true);
  }

  getIncludeFileMetadata(): boolean {
    return this.getConfigValue("includeFileMetadata", true);
  }

  getGenerateScopedInstructions(): boolean {
    return this.getConfigValue("generateScopedInstructions", true);
  }

  getStructuredFormat(): boolean {
    return this.getConfigValue("structuredFormat", true);
  }

  getIncludeBoundaries(): boolean {
    return this.getConfigValue("includeBoundaries", true);
  }

  getIncludeFileSummaries(): boolean {
    return this.getConfigValue("includeFileSummaries", true);
  }

  getMaxSummaryFiles(): number {
    return this.getConfigValue("maxSummaryFiles", 5);
  }

  // Get all current settings for debugging
  getAllSettings(): any {
    return {
      // Core settings
      maxContextLines: this.getMaxContextLines(),
      confidenceThreshold: this.getDefaultConfidenceThreshold(),
      autoApplyChanges: this.getAutoApplyChanges(),
      showDiffPreview: this.getShowDiffPreview(),
      validateSyntax: this.getValidateSyntax(),
      trackChanges: this.getTrackChanges(),
      showAlternatives: this.getShowAlternatives(),
      timeout: this.getTimeout(),

      // API settings
      defaultModel: this.getDefaultModel(),
      defaultTemperature: this.getDefaultTemperature(),
      maxTokens: this.getMaxTokens(),
      retryAttempts: this.getRetryAttempts(),
      retryDelay: this.getRetryDelay(),

      // Feature settings
      enableLogging: this.getEnableLogging(),
      autoSaveChats: this.getAutoSaveChats(),
      chatHistoryLimit: this.getChatHistoryLimit(),
      showNotifications: this.getShowNotifications(),
      enableCodeContext: this.getEnableCodeContext(),
      includeGitInfo: this.getIncludeGitInfo(),
      preferredCodeStyle: this.getPreferredCodeStyle(),

      // Advanced prompt settings
      enableTokenOptimization: this.getEnableTokenOptimization(),
      prioritizePrecision: this.getPrioritizePrecision(),
      useMarkdownSections: this.getUseMarkdownSections(),
      includeFileMetadata: this.getIncludeFileMetadata(),
      generateScopedInstructions: this.getGenerateScopedInstructions(),
      structuredFormat: this.getStructuredFormat(),
      includeBoundaries: this.getIncludeBoundaries(),
      includeFileSummaries: this.getIncludeFileSummaries(),
      maxSummaryFiles: this.getMaxSummaryFiles(),
    };
  }

  // Reset all settings to defaults
  async resetSettings(): Promise<void> {
    const config = this.getConfiguration();
    const keys = [
      "maxContextLines",
      "confidenceThreshold",
      "autoApplyChanges",
      "showDiffPreview",
      "validateSyntax",
      "trackChanges",
      "showAlternatives",
      "requestTimeout",
      "defaultModel",
      "defaultTemperature",
      "maxTokens",
      "enableLogging",
      "autoSaveChats",
      "chatHistoryLimit",
      "showNotifications",
      "enableCodeContext",
      "includeGitInfo",
      "preferredCodeStyle",
      "retryAttempts",
      "retryDelay",
      // Advanced prompt settings
      "enableTokenOptimization",
      "prioritizePrecision",
      "useMarkdownSections",
      "includeFileMetadata",
      "generateScopedInstructions",
      "structuredFormat",
      "includeBoundaries",
      "includeFileSummaries",
      "maxSummaryFiles",
    ];

    for (const key of keys) {
      await config.update(key, undefined, vscode.ConfigurationTarget.Global);
    }

    vscode.window.showInformationMessage(
      "✅ codeIt settings reset to defaults"
    );
  }

  // Enhanced configuration validation
  async validateConfiguration(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate numeric ranges
    const maxContextLines = this.getMaxContextLines();
    if (maxContextLines < 10 || maxContextLines > 500) {
      errors.push("maxContextLines should be between 10 and 500");
    }

    const confidenceThreshold = this.getDefaultConfidenceThreshold();
    if (confidenceThreshold < 0 || confidenceThreshold > 1) {
      errors.push("confidenceThreshold should be between 0 and 1");
    }

    const timeout = this.getTimeout();
    if (timeout < 5000 || timeout > 120000) {
      errors.push("requestTimeout should be between 5000ms and 120000ms");
    }

    const temperature = this.getDefaultTemperature();
    if (temperature < 0 || temperature > 2) {
      errors.push("defaultTemperature should be between 0 and 2");
    }

    const maxTokens = this.getMaxTokens();
    if (maxTokens < 1000 || maxTokens > 32000) {
      errors.push("maxTokens should be between 1000 and 32000");
    }

    const maxSummaryFiles = this.getMaxSummaryFiles();
    if (maxSummaryFiles < 1 || maxSummaryFiles > 20) {
      errors.push("maxSummaryFiles should be between 1 and 20");
    }

    const retryAttempts = this.getRetryAttempts();
    if (retryAttempts < 1 || retryAttempts > 10) {
      errors.push("retryAttempts should be between 1 and 10");
    }

    const retryDelay = this.getRetryDelay();
    if (retryDelay < 500 || retryDelay > 10000) {
      errors.push("retryDelay should be between 500ms and 10000ms");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Import/Export settings
  async exportSettings(): Promise<string> {
    const settings = this.getAllSettings();
    return JSON.stringify(settings, null, 2);
  }

  async importSettings(settingsJson: string): Promise<boolean> {
    try {
      const settings = JSON.parse(settingsJson);
      const config = this.getConfiguration();

      for (const [key, value] of Object.entries(settings)) {
        await config.update(key, value, vscode.ConfigurationTarget.Global);
      }

      vscode.window.showInformationMessage(
        "✅ codeIt settings imported successfully"
      );
      return true;
    } catch (error) {
      vscode.window.showErrorMessage(
        "❌ Failed to import settings: Invalid JSON format"
      );
      return false;
    }
  }

  // Configuration watcher for real-time updates
  private setupConfigWatcher() {
    this.configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        this.onConfigurationChanged();
      }
    });
  }

  private onConfigurationChanged() {
    // Validate configuration when it changes
    this.validateConfiguration().then((result) => {
      if (!result.valid && this.getShowNotifications()) {
        vscode.window.showWarningMessage(
          `codeIt configuration issues: ${result.errors.join(", ")}`
        );
      }
    });
  }

  // Cleanup
  dispose() {
    if (this.configWatcher) {
      this.configWatcher.dispose();
    }
  }

  // Helper methods for specific use cases
  async ensureApiKeyConfigured(): Promise<boolean> {
    if (await this.hasApiKey()) {
      return true;
    }

    const apiKey = await this.promptForApiKey();
    return !!apiKey;
  }

  // Workspace-specific settings
  getWorkspaceSpecificSetting<T>(key: string, defaultValue: T): T {
    const workspaceConfig = vscode.workspace.getConfiguration(
      CONFIG_SECTION,
      vscode.workspace.workspaceFolders?.[0]
    );
    const workspaceValue = workspaceConfig.get<T>(key);

    if (workspaceValue !== undefined) {
      return workspaceValue;
    }

    return this.getConfigValue(key, defaultValue);
  }

  async setWorkspaceSpecificSetting(key: string, value: any): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const config = vscode.workspace.getConfiguration(
        CONFIG_SECTION,
        workspaceFolder
      );
      await config.update(key, value, vscode.ConfigurationTarget.Workspace);
    } else {
      await this.setConfigValue(key, value, vscode.ConfigurationTarget.Global);
    }
  }

  // Updated config summary without manual processing
  async getConfigSummary(): Promise<string> {
    const apiKey = await this.context.secrets.get(SECRET_KEY);
    const hasApiKey = apiKey ? "✅" : "❌";
    const autoApply = this.getAutoApplyChanges() ? "🤖" : "👤";
    const model = this.getDefaultModel().replace("sonar-", "");
    const precision = this.getPrioritizePrecision() ? "🎯" : "📝";

    return `codeIt: API ${hasApiKey} | Mode ${autoApply} | Model ${model} | Precision ${precision}`;
  }

  // NEW: Get complete prompt configuration for easy use
  getPromptConfiguration() {
    return {
      includeWorkspaceContext: this.getEnableCodeContext(),
      includeGitContext: this.getIncludeGitInfo(),
      maxContextLines: this.getMaxContextLines(),
      responseStyle: "minimal" as const,
      toolUsage: true,
      structuredFormat: this.getStructuredFormat(),
      includeBoundaries: this.getIncludeBoundaries(),
      includeFileSummaries: this.getIncludeFileSummaries(),
      maxSummaryFiles: this.getMaxSummaryFiles(),
      useMarkdownSections: this.getUseMarkdownSections(),
      enableTokenOptimization: this.getEnableTokenOptimization(),
      maxTokens: this.getMaxTokens(),
      prioritizePrecision: this.getPrioritizePrecision(),
      includeFileMetadata: this.getIncludeFileMetadata(),
      generateScopedInstructions: this.getGenerateScopedInstructions(),
    };
  }
}
