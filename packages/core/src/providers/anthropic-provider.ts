import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ContentBlockParam,
  ToolUnion,
  Tool as AnthropicTool,
} from "@anthropic-ai/sdk/resources/messages";
import type { Provider, CompleteOptions, CompleteResult } from "./provider.js";
import { ProviderError } from "./provider.js";
import type { Message, ContentBlock } from "../types/message.js";
import type { AnyToolDefinition } from "../types/tool.js";
import type { ModelInfo } from "../types/model.js";
import { ModelRegistry } from "./model-registry.js";
import { zodToJsonSchema, withDescription } from "../tools/zod-to-json-schema.js";

export interface AnthropicProviderOptions {
  apiKey?: string;
  /** Inject a registry for testing or shared use; otherwise a private one is created. */
  modelRegistry?: ModelRegistry;
  /** Override the SDK client entirely, for testing. */
  client?: Anthropic;
}

export class AnthropicProvider implements Provider {
  readonly id = "anthropic";
  readonly name = "Anthropic";

  private readonly client: Anthropic | undefined;
  private readonly registry: ModelRegistry;

  constructor(options: AnthropicProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.registry = options.modelRegistry ?? new ModelRegistry();
    if (options.client) {
      this.client = options.client;
    } else if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
    // If neither a client nor an apiKey is available, this.client stays
    // undefined and isConfigured() reports false; complete() throws clearly.
  }

  isConfigured(): boolean {
    return this.client !== undefined;
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.registry.listByProvider("anthropic");
  }

  async complete(options: CompleteOptions): Promise<CompleteResult> {
    if (!this.client) {
      throw new ProviderError(
        "Anthropic provider is not configured: missing ANTHROPIC_API_KEY",
        this.id,
        undefined,
        false,
      );
    }

    const anthropicMessages = options.messages.map(toAnthropicMessage);
    const anthropicTools = options.tools?.map(toAnthropicTool);

    try {
      if (options.onTextDelta) {
        return await this.completeStreaming(options, anthropicMessages, anthropicTools);
      }
      return await this.completeNonStreaming(options, anthropicMessages, anthropicTools);
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  private async completeNonStreaming(
    options: CompleteOptions,
    messages: MessageParam[],
    tools: ToolUnion[] | undefined,
  ): Promise<CompleteResult> {
    const response = await this.client!.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      messages,
      ...(options.system ? { system: options.system } : {}),
      ...(tools ? { tools } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    });

    return {
      message: fromAnthropicContent("assistant", response.content),
      stopReason: mapStopReason(response.stop_reason),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  private async completeStreaming(
    options: CompleteOptions,
    messages: MessageParam[],
    tools: ToolUnion[] | undefined,
  ): Promise<CompleteResult> {
    const stream = this.client!.messages.stream({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      messages,
      ...(options.system ? { system: options.system } : {}),
      ...(tools ? { tools } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    });

    stream.on("text", (delta) => {
      options.onTextDelta?.(delta);
    });

    const finalMessage = await stream.finalMessage();

    return {
      message: fromAnthropicContent("assistant", finalMessage.content),
      stopReason: mapStopReason(finalMessage.stop_reason),
      usage: {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
      },
    };
  }

  private wrapError(err: unknown): ProviderError {
    if (err instanceof Anthropic.APIError) {
      const retryable = err.status === 429 || (err.status !== undefined && err.status >= 500);
      return new ProviderError(`Anthropic API error: ${err.message}`, this.id, err, retryable);
    }
    return new ProviderError(`Anthropic provider failed: ${(err as Error).message}`, this.id, err, false);
  }
}

function mapStopReason(reason: string | null): CompleteResult["stopReason"] {
  switch (reason) {
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "end_turn":
    case "stop_sequence":
      return "end_turn";
    default:
      return "end_turn";
  }
}

function toAnthropicTool(tool: AnyToolDefinition): AnthropicTool {
  const jsonSchema = withDescription(zodToJsonSchema(tool.schema), tool.description);
  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object",
      properties: (jsonSchema.properties as Record<string, unknown>) ?? {},
      required: (jsonSchema.required as string[]) ?? [],
    },
  };
}

function toAnthropicMessage(message: Message): MessageParam {
  // Anthropic's API only accepts "user" | "assistant" roles in `messages`;
  // "system" goes in the separate `system` param and is handled by the
  // caller before reaching here. "tool" results are represented as
  // tool_result content blocks on a user message.
  const role = message.role === "assistant" ? "assistant" : "user";
  return {
    role,
    content: message.content.map(toAnthropicContentBlock),
  };
}

function toAnthropicContentBlock(block: ContentBlock): ContentBlockParam {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "image":
      return {
        type: "image",
        source: { type: "base64", media_type: block.mimeType as any, data: block.data },
      };
    case "tool_use":
      return { type: "tool_use", id: block.id, name: block.name, input: block.input };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: block.toolUseId,
        content: block.content,
        ...(block.isError ? { is_error: true } : {}),
      };
  }
}

function fromAnthropicContent(role: "assistant", content: Anthropic.ContentBlock[]): Message {
  const blocks: ContentBlock[] = [];
  for (const block of content) {
    if (block.type === "text") {
      blocks.push({ type: "text", text: block.text });
    } else if (block.type === "tool_use") {
      blocks.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
    // Other block types (thinking, server tool use, etc.) are intentionally
    // dropped for now - they'll be added as Harmus grows support for them.
  }
  return { role, content: blocks };
}
