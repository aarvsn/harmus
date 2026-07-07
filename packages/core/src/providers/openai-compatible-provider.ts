import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import type { Provider, CompleteOptions, CompleteResult } from "./provider.js";
import { ProviderError } from "./provider.js";
import type { Message, ContentBlock } from "../types/message.js";
import type { AnyToolDefinition } from "../types/tool.js";
import type { ModelInfo } from "../types/model.js";
import { ModelRegistry } from "./model-registry.js";
import { zodToJsonSchema } from "../tools/zod-to-json-schema.js";

export interface OpenAICompatibleProviderOptions {
  apiKey?: string | undefined;
  baseURL: string;
  providerId: string;
  providerName: string;
  envVar?: string;
  defaultModels?: ModelInfo[];
  modelRegistry?: ModelRegistry;
  client?: OpenAI;
}

/**
 * Generic OpenAI-compatible provider.
 *
 * All of the following use the OpenAI chat completions API with a different
 * base URL (and sometimes different model IDs), so they share this one class:
 *
 *   OpenRouter    → https://openrouter.ai/api/v1
 *   Groq          → https://api.groq.com/openai/v1
 *   Together AI   → https://api.together.xyz/v1
 *   Fireworks AI  → https://api.fireworks.ai/inference/v1
 *   xAI           → https://api.x.ai/v1
 *   NVIDIA NIM    → https://integrate.api.nvidia.com/v1
 *   Moonshot AI   → https://api.moonshot.cn/v1
 *   Ollama        → http://localhost:11434/v1
 *   LM Studio     → http://localhost:1234/v1
 */
export class OpenAICompatibleProvider implements Provider {
  readonly id: string;
  readonly name: string;

  private readonly client: OpenAI | undefined;
  private readonly registry: ModelRegistry;
  private readonly defaultModels: ModelInfo[];

  constructor(options: OpenAICompatibleProviderOptions) {
    this.id = options.providerId;
    this.name = options.providerName;
    this.registry = options.modelRegistry ?? new ModelRegistry({ offline: true });
    this.defaultModels = options.defaultModels ?? [];

    const apiKey =
      options.apiKey ??
      (options.envVar ? process.env[options.envVar] : undefined) ??
      "none"; // Ollama/LM Studio don't need a key

    if (options.client) {
      this.client = options.client;
    } else {
      this.client = new OpenAI({ apiKey, baseURL: options.baseURL });
    }
  }

  isConfigured(): boolean {
    return this.client !== undefined;
  }

  async listModels(): Promise<ModelInfo[]> {
    const fromRegistry = await this.registry.listByProvider(this.id);
    return fromRegistry.length > 0 ? fromRegistry : this.defaultModels;
  }

  async complete(options: CompleteOptions): Promise<CompleteResult> {
    if (!this.client) {
      throw new ProviderError(
        `${this.name} provider is not configured`,
        this.id,
        undefined,
        false,
      );
    }

    const messages = toOpenAIMessages(options);
    const tools = options.tools?.map(toOpenAITool);

    try {
      if (options.onTextDelta) {
        return await this.completeStreaming(options, messages, tools);
      }
      return await this.completeNonStreaming(options, messages, tools);
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  private async completeNonStreaming(
    options: CompleteOptions,
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[] | undefined,
  ): Promise<CompleteResult> {
    const response = await this.client!.chat.completions.create({
      model: options.model,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    });

    const choice = response.choices[0];
    if (!choice) throw new ProviderError(`${this.name} returned no choices`, this.id);

    return {
      message: fromOpenAIMessage(choice.message),
      stopReason: mapFinishReason(choice.finish_reason),
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  private async completeStreaming(
    options: CompleteOptions,
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[] | undefined,
  ): Promise<CompleteResult> {
    const stream = this.client!.chat.completions.stream({
      model: options.model,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    });

    stream.on("content.delta", (event) => {
      options.onTextDelta?.(event.delta);
    });

    const final = await stream.finalChatCompletion();
    const choice = final.choices[0];
    if (!choice) throw new ProviderError(`${this.name} returned no choices`, this.id);

    return {
      message: fromOpenAIMessage(choice.message),
      stopReason: mapFinishReason(choice.finish_reason),
      usage: {
        inputTokens: final.usage?.prompt_tokens ?? 0,
        outputTokens: final.usage?.completion_tokens ?? 0,
      },
    };
  }

  private wrapError(err: unknown): ProviderError {
    if (err instanceof OpenAI.APIError) {
      const retryable = err.status === 429 || (err.status !== undefined && err.status >= 500);
      return new ProviderError(`${this.name} API error: ${err.message}`, this.id, err, retryable);
    }
    return new ProviderError(
      `${this.name} provider failed: ${(err as Error).message}`,
      this.id,
      err,
      false,
    );
  }
}

// ─── Shared translation helpers (same as OpenAIProvider) ──────────────────────

function mapFinishReason(reason: string | null): CompleteResult["stopReason"] {
  switch (reason) {
    case "tool_calls": return "tool_use";
    case "length": return "max_tokens";
    default: return "end_turn";
  }
}

function toOpenAITool(tool: AnyToolDefinition): ChatCompletionTool {
  return {
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: zodToJsonSchema(tool.schema) },
  };
}

function toOpenAIMessages(options: CompleteOptions): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [];
  if (options.system) result.push({ role: "system", content: options.system });
  for (const message of options.messages) result.push(...toOpenAIMessage(message));
  return result;
}

function toOpenAIMessage(message: Message): ChatCompletionMessageParam[] {
  if (message.role === "tool") {
    return message.content
      .filter((b): b is Extract<ContentBlock, { type: "tool_result" }> => b.type === "tool_result")
      .map((b) => ({ role: "tool" as const, tool_call_id: b.toolUseId, content: b.content }));
  }

  if (message.role === "assistant") {
    const text = message.content
      .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text).join("");
    const toolCalls: ChatCompletionMessageToolCall[] = message.content
      .filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use")
      .map((b) => ({
        id: b.id,
        type: "function" as const,
        function: { name: b.name, arguments: JSON.stringify(b.input) },
      }));
    return [{ role: "assistant", content: text || null, ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}) }];
  }

  const parts = message.content
    .map((block): { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } } | null => {
      if (block.type === "text") return { type: "text", text: block.text };
      if (block.type === "image") return { type: "image_url", image_url: { url: `data:${block.mimeType};base64,${block.data}` } };
      return null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return [{ role: "user", content: parts }];
}

function fromOpenAIMessage(message: OpenAI.Chat.Completions.ChatCompletionMessage): Message {
  const blocks: ContentBlock[] = [];
  if (message.content) blocks.push({ type: "text", text: message.content });
  for (const call of message.tool_calls ?? []) {
    if (call.type !== "function") continue;
    let input: Record<string, unknown>;
    try { input = JSON.parse(call.function.arguments); } catch { input = {}; }
    blocks.push({ type: "tool_use", id: call.id, name: call.function.name, input });
  }
  return { role: "assistant", content: blocks };
}
