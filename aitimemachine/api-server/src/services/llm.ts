/**
 * LLM Service
 *
 * Provides a centralized abstraction for LLM completions with multiple provider support:
 * - OpenAI (gpt-4o-mini)
 * - Anthropic (claude-3-5-haiku-20241022)
 * - None (fallback text response when no API key is available)
 *
 * Provider is auto-detected from environment variables:
 * - OPENAI_API_KEY → openai
 * - ANTHROPIC_API_KEY → anthropic
 * - else → none
 */

// ============================================================================
// Types
// ============================================================================

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMCompletionResult {
  content: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export type LLMProvider = "openai" | "anthropic" | "none";

// ============================================================================
// Default models
// ============================================================================

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-20241022",
};

// ============================================================================
// LLM Service
// ============================================================================

export class LLMService {
  private provider: LLMProvider;
  private apiKey?: string;

  constructor() {
    this.provider = this.detectProvider();
    this.apiKey = this.getApiKey();
  }

  /**
   * Auto-detect available LLM provider from environment variables
   */
  private detectProvider(): LLMProvider {
    if (process.env.OPENAI_API_KEY) return "openai";
    if (process.env.ANTHROPIC_API_KEY) return "anthropic";
    return "none";
  }

  /**
   * Get API key for current provider
   */
  private getApiKey(): string | undefined {
    switch (this.provider) {
      case "openai":
        return process.env.OPENAI_API_KEY;
      case "anthropic":
        return process.env.ANTHROPIC_API_KEY;
      default:
        return undefined;
    }
  }

  /**
   * Send a completion request to the configured LLM provider
   */
  async complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult> {
    switch (this.provider) {
      case "openai":
        return this.completeOpenAI(messages, options);
      case "anthropic":
        return this.completeAnthropic(messages, options);
      case "none":
      default:
        return this.completeFallback(messages);
    }
  }

  /**
   * OpenAI chat completion
   */
  private async completeOpenAI(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult> {
    const model = options?.model || DEFAULT_MODELS.openai;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options?.maxTokens ?? 2000,
        temperature: options?.temperature ?? 0.7,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status} ${res.statusText}`);
    }

    const data: any = await res.json();
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || "Unable to generate response.",
      model: data.model || model,
      provider: "openai",
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
          }
        : undefined,
    };
  }

  /**
   * Anthropic messages completion
   */
  private async completeAnthropic(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult> {
    const model = options?.model || DEFAULT_MODELS.anthropic;

    // Anthropic requires system message to be separate, and doesn't allow system role in messages
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    // If there's a system message, prepend its content to the first user message
    if (systemMsg && chatMessages.length > 0 && chatMessages[0].role === "user") {
      chatMessages[0] = {
        role: "user",
        content: `${systemMsg.content}\n\n${chatMessages[0].content}`,
      };
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: options?.maxTokens ?? 2000,
        messages: chatMessages,
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status} ${res.statusText}`);
    }

    const data: any = await res.json();

    return {
      content: data.content?.[0]?.text || "Unable to generate response.",
      model: data.model || model,
      provider: "anthropic",
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
          }
        : undefined,
    };
  }

  /**
   * Fallback when no LLM provider is available
   */
  private completeFallback(messages: LLMMessage[]): Promise<LLMCompletionResult> {
    const userMessage = messages.filter((m) => m.role === "user").pop();
    const content = userMessage
      ? `No LLM provider available. Raw input: ${userMessage.content.slice(0, 500)}`
      : "No LLM provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.";

    return Promise.resolve({
      content,
      model: "none",
      provider: "none",
    });
  }

  /**
   * Check if an LLM provider is available
   */
  isAvailable(): boolean {
    return this.provider !== "none";
  }

  /**
   * Get current provider info
   */
  getProviderInfo(): { provider: LLMProvider; hasApiKey: boolean } {
    return {
      provider: this.provider,
      hasApiKey: !!this.apiKey,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: LLMService | null = null;

export function getLLMService(): LLMService {
  if (!instance) {
    instance = new LLMService();
  }
  return instance;
}
