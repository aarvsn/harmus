import type { Message } from "../types/message.js";
import type { AnyToolDefinition } from "../types/tool.js";
import type { ModelInfo } from "../types/model.js";

export interface CompleteOptions {
  model: string;
  messages: Message[];
  system?: string;
  tools?: AnyToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  /** Called with incremental text as it streams in, if the provider supports streaming. */
  onTextDelta?: (delta: string) => void;
}

export interface CompleteResult {
  message: Message;
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "error";
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Unified interface every provider (Anthropic, OpenAI, Gemini, Ollama, etc.)
 * must implement. The rest of Harmus only ever talks to this interface,
 * never to a specific provider's SDK directly.
 */
export interface Provider {
  /** Unique id, e.g. "anthropic", "openai", "ollama" */
  readonly id: string;
  /** Human readable name, e.g. "Anthropic" */
  readonly name: string;

  /** Whether this provider is currently usable (API key present, endpoint reachable, etc). */
  isConfigured(): boolean;

  /** List models available from this provider. May hit network (e.g. models.dev) or be static. */
  listModels(): Promise<ModelInfo[]>;

  /** Run a single completion turn, possibly producing tool_use blocks. */
  complete(options: CompleteOptions): Promise<CompleteResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly cause?: unknown,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
