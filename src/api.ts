import axios, { AxiosResponse } from "axios";
import * as vscode from "vscode";
import { PromptBuilder, CodeContext, PromptConfig } from "./promptBuilder";
import { ConfigManager } from "./config";

export interface PerplexityResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model?: string;
  finish_reason?: string;
}

export interface PerplexityError {
  message: string;
  code?: string;
  retryable: boolean;
  status?: number;
}

export interface APIRequestOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  stream?: boolean;
}

export interface PreparedRequest {
  prompt: string;
  requestBody: any;
  context: CodeContext;
  model: string;
  temperature: number;
  maxTokens: number;
}

export class PerplexityAPI {
  private static readonly BASE_URL =
    "https://api.perplexity.ai/chat/completions";
  private static readonly DEFAULT_MODEL = "sonar"; // Most cost-effective
  private static readonly FALLBACK_MODEL = "sonar-pro"; // More advanced
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000; // 1 second
  private static readonly MAX_TOKENS = 4000;

  private configManager: ConfigManager;
  private outputChannel: vscode.OutputChannel;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    this.outputChannel = vscode.window.createOutputChannel("codeIt API Debug");
    console.log("PerplexityAPI initialized");
  }

  private log(
    message: string,
    level: "info" | "warn" | "error" | "debug" = "info"
  ) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [PerplexityAPI] ${message}`;

    this.outputChannel.appendLine(logMessage);

    switch (level) {
      case "error":
        console.error(logMessage);
        break;
      case "warn":
        console.warn(logMessage);
        break;
      case "debug":
        if (this.configManager.getEnableLogging()) {
          console.log(logMessage);
        }
        break;
      default:
        console.log(logMessage);
    }
  }

  private logPromptDetails(
    prompt: { system: string; user: string },
    context: CodeContext
  ) {
    console.log("=== PROMPT GENERATION DETAILS ===", "debug");
    console.log(`File: ${context.filePath}`, "debug");
    console.log(`Language: ${context.language}`, "debug");
    console.log(`User Instruction: ${context.userInstruction}`, "debug");
    console.log(
      `Selected Code Length: ${context.selectedCode?.length || 0} chars`,
      "debug"
    );
    console.log(
      `File Content Length: ${context.fileContent?.length || 0} chars`,
      "debug"
    );
    console.log(
      `Additional Files: ${context.additionalFiles?.length || 0}`,
      "debug"
    );
    console.log(
      `Custom Code Blocks: ${context.customCode?.length || 0}`,
      "debug"
    );

    console.log("=== SYSTEM PROMPT ===", "debug");
    console.log(prompt.system, "debug");

    console.log("=== USER PROMPT ===", "debug");
    console.log(prompt.user, "debug");

    console.log("=== END PROMPT DETAILS ===", "debug");
  }

  private logRequestDetails(requestBody: any, apiKey: string) {
    console.log("=== API REQUEST DETAILS ===", "debug");
    console.log(`URL: ${PerplexityAPI.BASE_URL}`, "debug");
    console.log(`Model: ${requestBody.model}`, "debug");
    console.log(`Temperature: ${requestBody.temperature}`, "debug");
    console.log(`Max Tokens: ${requestBody.max_tokens}`, "debug");
    console.log(
      `Messages Count: ${requestBody.messages?.length || 0}`,
      "debug"
    );
    console.log(
      `API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(
        apiKey.length - 4
      )}`,
      "debug"
    );

    console.log("=== FULL REQUEST BODY ===", "debug");
    console.log(JSON.stringify(requestBody, null, 2), "debug");

    console.log("=== END REQUEST DETAILS ===", "debug");
  }

  private logResponseDetails(response: PerplexityResponse) {
    console.log("=== API RESPONSE DETAILS ===", "debug");
    console.log(`Model Used: ${response.model || "unknown"}`, "debug");
    console.log(
      `Finish Reason: ${response.finish_reason || "unknown"}`,
      "debug"
    );
    console.log(
      `Content Length: ${response.content?.length || 0} chars`,
      "debug"
    );

    if (response.usage) {
      console.log(
        `Tokens - Prompt: ${response.usage.prompt_tokens}, Completion: ${response.usage.completion_tokens}, Total: ${response.usage.total_tokens}`,
        "debug"
      );
    }

    console.log("=== RESPONSE CONTENT ===", "debug");
    console.log(response.content, "debug");

    console.log("=== END RESPONSE DETAILS ===", "debug");
  }

  async callAPI(
    context: CodeContext,
    options: APIRequestOptions = {}
  ): Promise<PerplexityResponse> {
    console.log(`Starting API call for ${context.filePath}`);

    const apiKey = await this.configManager.getApiKey();
    if (!apiKey) {
      const error =
        "API key not configured. Please configure your Perplexity API key for codeIt.";
      console.log(error, "error");
      throw new Error(error);
    }

    // Build enhanced prompts with configuration
   const promptConfig: PromptConfig = {
  includeWorkspaceContext: !!context.workspaceFiles?.length,
  includeGitContext: !!context.gitDiff || !!context.gitBranch,
  maxContextLines: this.configManager.getMaxContextLines(),
  responseStyle: "minimal",
  toolUsage: true,
  structuredFormat: true,
  includeBoundaries: true,
  includeFileSummaries: true,
  maxSummaryFiles: 5,
  // Add the missing advanced configuration properties
  useMarkdownSections: true,
  enableTokenOptimization: true,
  maxTokens: this.configManager.getMaxTokens() || 10000,
  prioritizePrecision: true,
  includeFileMetadata: true,
  generateScopedInstructions: true,
};

    console.log(`Prompt config: ${JSON.stringify(promptConfig)}`, "debug");

    const prompts = PromptBuilder.buildFullPrompt(context, promptConfig);

    // Log detailed prompt information
    console.log("Prompts:", prompts);
    console.log("Context:", context);

    // Prepare request with enhanced options
    const requestBody = {
      model: options.model || this.getOptimalModel(context),
      messages: [
        { role: "system", content: prompts.system },
        { role: "user", content: prompts.user },
      ],
      temperature: options.temperature ?? this.getOptimalTemperature(context),
      max_tokens: options.maxTokens || PerplexityAPI.MAX_TOKENS,
      stream: options.stream ?? false,
      // Add codeIt-specific parameters
      top_p: 0.9,
      frequency_penalty: 0.1,
    };

    const timeout = options.timeout || this.configManager.getTimeout();

    // Log request details
    console.log("Request Body:", requestBody);

    const response = await this.makeRequest(requestBody, apiKey, timeout);

    // Log response details
    console.log("response: ", response);

    console.log(`API call completed successfully`);
    return response;
  }


  // Enhanced chat mode for codeIt with detailed logging
  async chatWithCode(
    context: CodeContext,
    conversationHistory: Array<{
      role: "user" | "assistant";
      content: string;
    }> = []
  ): Promise<PerplexityResponse> {
    console.log(`Starting chat with code for ${context.filePath}`);

    const apiKey = await this.configManager.getApiKey();
    if (!apiKey) {
      const error = "API key not configured for codeIt chat.";
      console.log(error, "error");
      throw new Error(error);
    }

    // Build chat prompt with enhanced logging
    const chatPrompt = PromptBuilder.buildChatPrompt(
      context,
      conversationHistory
    );

    console.log("=== CHAT WITH CODE DETAILS ===", "debug");
    console.log(`Context File: ${context.filePath}`, "debug");
    console.log(
      `Selected Code: ${
        context.selectedCode
          ? "Yes (" + context.selectedCode.length + " chars)"
          : "No"
      }`,
      "debug"
    );
    console.log(
      `Conversation History: ${conversationHistory.length} messages`,
      "debug"
    );
    console.log(`Chat Prompt Length: ${chatPrompt.length} chars`, "debug");

    // Ensure conversation history is properly formatted
    const validHistory = this.validateConversationHistory(conversationHistory);
    console.log(`Valid history messages: ${validHistory.length}`, "debug");

    const systemPrompt =
      "You are codeIt, an AI coding assistant. Help explain and discuss code. Be concise but helpful. Format your responses with proper markdown when needed.";

    const messages = [
      { role: "system", content: systemPrompt },
      ...validHistory,
      { role: "user", content: chatPrompt },
    ];

    const requestBody = {
      model: PerplexityAPI.DEFAULT_MODEL, // Use cost-effective sonar model for chat
      messages,
      temperature: 0.5, // Slightly more conversational
      max_tokens: 2000,
      stream: false,
    };

    console.log("=== CHAT REQUEST MESSAGES ===", "debug");
    messages.forEach((msg, index) => {
      console.log(
        `Message ${index + 1} (${msg.role}): ${msg.content.substring(0, 300)}${
          msg.content.length > 300 ? "..." : ""
        }`,
        "debug"
      );
    });

    // Log full request
    console.log("Request Body:", requestBody);

    const response = await this.makeRequest(
      requestBody,
      apiKey,
      this.configManager.getTimeout()
    );

    // Log response
    console.log("Response:", response);

    console.log(`Chat with code completed successfully`);
    return response;
  }

  private async makeRequest(
    requestBody: any,
    apiKey: string,
    timeout: number,
    retryCount = 0
  ): Promise<PerplexityResponse> {
    const startTime = Date.now();
    console.log(
      `Making API request (attempt ${retryCount + 1}/${
        PerplexityAPI.MAX_RETRIES + 1
      })`
    );

    try {
      console.log(`Sending request to ${PerplexityAPI.BASE_URL}`, "debug");
      console.log(`Request timeout: ${timeout}ms`, "debug");

      const response: AxiosResponse = await axios.post(
        PerplexityAPI.BASE_URL,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          timeout,
        }
      );

      const responseTime = Date.now() - startTime;
      console.log(`Request completed in ${responseTime}ms`);

      console.log("=== RAW API RESPONSE ===", "debug");
      console.log(JSON.stringify(response.data, null, 2), "debug");

      const data = response.data;
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        const error = "Invalid response format from Perplexity API";
        console.log(
          `Response validation failed: ${JSON.stringify(data)}`,
          "error"
        );
        throw new Error(error);
      }

      const choice = data.choices[0];
      const result = {
        content: choice.message.content,
        usage: data.usage,
        model: data.model,
        finish_reason: choice.finish_reason,
      };

      console.log(`Successfully parsed API response`);
      console.log(
        `Response content length: ${result.content?.length || 0} characters`
      );

      return result;
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      console.log(
        `Request failed after ${responseTime}ms: ${error.message}`,
        "error"
      );

      const perplexityError = this.handleError(error, retryCount);

      // Enhanced retry logic with model fallback
      if (perplexityError.retryable && retryCount < PerplexityAPI.MAX_RETRIES) {
        console.log(
          `Retrying request (attempt ${retryCount + 2}/${
            PerplexityAPI.MAX_RETRIES + 1
          })`,
          "warn"
        );

        // If model-related error, try fallback model
        if (
          perplexityError.code === "MODEL_ERROR" &&
          requestBody.model !== PerplexityAPI.FALLBACK_MODEL
        ) {
          console.log(
            `Switching to fallback model: ${PerplexityAPI.FALLBACK_MODEL}`,
            "warn"
          );
          requestBody.model = PerplexityAPI.FALLBACK_MODEL;
        }

        const delayTime = PerplexityAPI.RETRY_DELAY * Math.pow(2, retryCount);
        console.log(`Waiting ${delayTime}ms before retry`, "debug");

        await this.delay(delayTime);
        return this.makeRequest(requestBody, apiKey, timeout, retryCount + 1);
      }

      console.log(
        `Request permanently failed: ${perplexityError.message}`,
        "error"
      );
      throw perplexityError;
    }
  }

  private handleError(error: any, retryCount: number): PerplexityError {
    console.log(`Handling error: ${error.message}`, "debug");

    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.error?.message || error.message;
      const errorCode = error.response?.data?.error?.code;

      console.log(
        `HTTP Error - Status: ${status}, Code: ${errorCode}, Message: ${message}`,
        "debug"
      );

      // Rate limiting
      if (status === 429) {
        console.log("Rate limit exceeded", "warn");
        return {
          message:
            "codeIt request rate limit exceeded. Please try again in a moment.",
          code: "RATE_LIMIT",
          retryable: retryCount < 2,
          status,
        };
      }

      // Authentication errors
      if (status === 401 || status === 403) {
        console.log("Authentication error", "error");
        return {
          message:
            "Invalid API key for codeIt. Please check your Perplexity API key configuration.",
          code: "AUTH_ERROR",
          retryable: false,
          status,
        };
      }

      // Model errors
      if (
        status === 400 &&
        (message.includes("model") || errorCode === "invalid_model")
      ) {
        console.log("Model error detected", "warn");
        return {
          message: `Model error: ${message}. Trying fallback model...`,
          code: "MODEL_ERROR",
          retryable: true,
          status,
        };
      }

      // Context length errors
      if (
        status === 400 &&
        (message.includes("context") || message.includes("token"))
      ) {
        console.log("Context length error", "error");
        return {
          message:
            "Request too large. Try selecting less code or reducing context.",
          code: "CONTEXT_LENGTH_ERROR",
          retryable: false,
          status,
        };
      }

      // Server errors
      if (status && status >= 500) {
        console.log(`Server error: ${status}`, "error");
        return {
          message: `Perplexity server error (${status}): ${message}`,
          code: "SERVER_ERROR",
          retryable: true,
          status,
        };
      }

      // Network errors
      if (error.code === "ECONNABORTED") {
        console.log("Request timeout", "warn");
        return {
          message:
            "Request timeout. Try again or increase timeout in codeIt settings.",
          code: "TIMEOUT_ERROR",
          retryable: true,
          status,
        };
      }

      if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
        console.log("Network error", "error");
        return {
          message: "Network error. Please check your internet connection.",
          code: "NETWORK_ERROR",
          retryable: true,
          status,
        };
      }

      return {
        message: `API Error (${status || "unknown"}): ${message}`,
        code: "API_ERROR",
        retryable: false,
        status: status || 0,
      };
    }

    return {
      message: error.message || "Unknown error occurred in codeIt",
      code: "UNKNOWN_ERROR",
      retryable: false,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getOptimalModel(context: CodeContext): string {
    const model = PerplexityAPI.DEFAULT_MODEL;
    console.log(`Selected model: ${model}`, "debug");
    return model;
  }

  private getOptimalTemperature(context: CodeContext): number {
    const instruction = context.userInstruction.toLowerCase();

    let temperature = 0.3; // Default

    if (
      instruction.includes("refactor") ||
      instruction.includes("fix") ||
      instruction.includes("bug")
    ) {
      temperature = 0.2; // More deterministic for refactoring
    } else if (
      instruction.includes("create") ||
      instruction.includes("generate") ||
      instruction.includes("write")
    ) {
      temperature = 0.4; // More creative for generation
    }

    console.log(
      `Selected temperature: ${temperature} for instruction: ${instruction.substring(
        0,
        50
      )}`,
      "debug"
    );
    return temperature;
  }

  private validateConversationHistory(
    history: Array<{ role: "user" | "assistant"; content: string }>
  ): Array<{ role: "user" | "assistant"; content: string }> {
    // Remove any trailing user messages to ensure we don't have consecutive user messages
    const filteredHistory = history.filter((message, index) => {
      // If this is a user message and it's the last one, remove it
      if (message.role === "user" && index === history.length - 1) {
        return false;
      }
      return true;
    });

    console.log(
      `Conversation history validated: ${history.length} -> ${filteredHistory.length} messages`,
      "debug"
    );
    return filteredHistory;
  }

  async testConnection(): Promise<boolean> {
    console.log("Testing API connection");

    try {
      const apiKey = await this.configManager.getApiKey();
      if (!apiKey) {
        console.log("No API key available for test", "warn");
        return false;
      }

      // Minimal test request with smallest model
      const testRequestBody = {
        model: "sonar",
        messages: [
          {
            role: "user",
            content: "Hi",
          },
        ],
        max_tokens: 10, // Minimal tokens
        temperature: 0.1,
      };

      console.log("=== TEST CONNECTION REQUEST ===", "debug");
      console.log(JSON.stringify(testRequestBody, null, 2), "debug");

      const response = await this.makeRequest(testRequestBody, apiKey, 5000);
      const success = !!(
        response.content && response.content.trim().length > 0
      );

      console.log(`Connection test ${success ? "successful" : "failed"}`);
      return success;
    } catch (error: any) {
      console.log(`Test connection failed: ${error.message}`, "error");
      return false;
    }
  }

  async validateAPIKey(): Promise<{ valid: boolean; error?: string }> {
    console.log("Validating API key");

    try {
      const isValid = await this.testConnection();
      console.log(`API key validation ${isValid ? "passed" : "failed"}`);
      return { valid: isValid };
    } catch (error: any) {
      console.log(`API key validation error: ${error.message}`, "error");
      return {
        valid: false,
        error: error.message || "Failed to validate API key",
      };
    }
  }

  // Get current API usage stats (if available)
  getLastUsage(): {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null {
    // This would be enhanced to track usage across requests
    return null; // Placeholder
  }

  // Model availability check
  async checkModelAvailability(model: string): Promise<boolean> {
    console.log(`Checking availability of model: ${model}`);

    try {
      const testContext: CodeContext = {
        selectedCode: "test",
        userInstruction: "test",
        filePath: "test.txt",
        language: "text",
        fileContent: "test",
      };

      await this.callAPI(testContext, {
        model,
        maxTokens: 10,
        timeout: 5000,
      });

      console.log(`Model ${model} is available`);
      return true;
    } catch (error: any) {
      if (error.code === "MODEL_ERROR") {
        console.log(`Model ${model} is not available`, "warn");
        return false;
      }

      console.log(
        `Error checking model availability: ${error.message}`,
        "error"
      );
      throw error; // Re-throw non-model errors
    }
  }

  // Show debug output channel
  showDebugOutput() {
    this.outputChannel.show();
  }

  // Clear debug logs
  clearDebugLogs() {
    this.outputChannel.clear();
    console.log("Debug logs cleared");
  }
}
