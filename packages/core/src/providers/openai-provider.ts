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

export interface OpenAIProviderOptions {
  apiKey?: string;
  modelRegistry?: ModelRegistry;
  /** Override the SDK client entirely, for testing. */
  client?: OpenAI;
}

/**
 * OpenAI provider implementing the unified Provider interface.
 *
 * OpenAI's chat completions API differs structurally from Anthropic's in a
 * few important ways that this class bridges:
 *  - system prompt is a normal message in the array, not a separate param
 *  - tool calls live in a separate `tool_calls` array, not inline in `content`
 *  - tool call arguments are a JSON-encoded string, not a parsed object
 *  - tool results are individual `role: "tool"` messages (one per call),
 *    not grouped content blocks within a single message
 */
export class OpenAIProvider implements Provider {
  readonly id = "openai";
  readonly name = "OpenAI";

  private readonly client: OpenAI | undefined;
  private readonly registry: ModelRegistry;

  constructor(options: OpenAIProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.registry = options.modelRegistry ?? new ModelRegistry();
    if (options.client) {
      this.client = options.client;
    } else if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  isConfigured(): boolean {
    return this.client !== undefined;
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.registry.listByProvider("openai");
  }

  async complete(options: CompleteOptions): Promise<CompleteResult> {
    if (!this.client) {
      throw new ProviderError(
        "OpenAI provider is not configured: missing OPENAI_API_KEY",
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
      ...(tools ? { tools } : {}),
      ...(options.maxTokens !== undefined ? { max_completion_tokens: options.maxTokens } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new ProviderError("OpenAI returned no choices", this.id);
    }

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
      ...(tools ? { tools } : {}),
      ...(options.maxTokens !== undefined ? { max_completion_tokens: options.maxTokens } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    });

    stream.on("content.delta", (event) => {
      options.onTextDelta?.(event.delta);
    });

    const finalCompletion = await stream.finalChatCompletion();
    const choice = finalCompletion.choices[0];
    if (!choice) {
      throw new ProviderError("OpenAI returned no choices", this.id);
    }

    return {
      message: fromOpenAIMessage(choice.message),
      stopReason: mapFinishReason(choice.finish_reason),
      usage: {
        inputTokens: finalCompletion.usage?.prompt_tokens ?? 0,
        outputTokens: finalCompletion.usage?.completion_tokens ?? 0,
      },
    };
  }

  private wrapError(err: unknown): ProviderError {
    if (err instanceof OpenAI.APIError) {
      const retryable = err.status === 429 || (err.status !== undefined && err.status >= 500);
      return new ProviderError(`OpenAI API error: ${err.message}`, this.id, err, retryable);
    }
    return new ProviderError(`OpenAI provider failed: ${(err as Error).message}`, this.id, err, false);
  }
}

function mapFinishReason(reason: string | null): CompleteResult["stopReason"] {
  switch (reason) {
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "stop":
      return "end_turn";
    default:
      return "end_turn";
  }
}

function toOpenAITool(tool: AnyToolDefinition): ChatCompletionTool {
  const jsonSchema = zodToJsonSchema(tool.schema);
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: jsonSchema,
    },
  };
}

/**
 * Builds the full OpenAI message array, prepending the system prompt as a
 * regular message since OpenAI has no separate `system` param.
 */
function toOpenAIMessages(options: CompleteOptions): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [];
  if (options.system) {
    result.push({ role: "system", content: options.system });
  }
  for (const message of options.messages) {
    result.push(...toOpenAIMessage(message));
  }
  return result;
}

/**
 * A single internal Message can expand into MULTIPLE OpenAI messages:
 * our "tool" role message holds an array of tool_result blocks, but OpenAI
 * requires one role:"tool" message per tool_call_id.
 */
function toOpenAIMessage(message: Message): ChatCompletionMessageParam[] {
  if (message.role === "tool") {
    return message.content
      .filter((b): b is Extract<ContentBlock, { type: "tool_result" }> => b.type === "tool_result")
      .map((b) => ({
        role: "tool" as const,
        tool_call_id: b.toolUseId,
        content: b.content,
      }));
  }

  if (message.role === "assistant") {
    const textParts = message.content.filter(
      (b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text",
    );
    const toolUseParts = message.content.filter(
      (b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use",
    );

    const text = textParts.map((b) => b.text).join("");
    const toolCalls: ChatCompletionMessageToolCall[] = toolUseParts.map((b) => ({
      id: b.id,
      type: "function" as const,
      function: { name: b.name, arguments: JSON.stringify(b.input) },
    }));

    return [
      {
        role: "assistant",
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
    ];
  }

  // user role: OpenAI supports multi-part content; we map text/image blocks straight across.
  const parts = message.content
    .map((block): OpenAIUserContentPart | null => {
      if (block.type === "text") return { type: "text", text: block.text };
      if (block.type === "image") {
        return {
          type: "image_url",
          image_url: { url: `data:${block.mimeType};base64,${block.data}` },
        };
      }
      return null;
    })
    .filter((p): p is OpenAIUserContentPart => p !== null);

  return [{ role: "user", content: parts }];
}

type OpenAIUserContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function fromOpenAIMessage(message: OpenAI.Chat.Completions.ChatCompletionMessage): Message {
  const blocks: ContentBlock[] = [];

  if (message.content) {
    blocks.push({ type: "text", text: message.content });
  }

  for (const call of message.tool_calls ?? []) {
    if (call.type !== "function") continue; // custom tool calls not supported yet
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(call.function.arguments);
    } catch {
      input = {};
    }
    blocks.push({ type: "tool_use", id: call.id, name: call.function.name, input });
  }

  return { role: "assistant", content: blocks };
}
