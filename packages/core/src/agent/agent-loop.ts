import type { Provider } from "../providers/provider.js";
import type { Message, ContentBlock, ToolUseBlock } from "../types/message.js";
import type { ToolExecutionContext } from "../types/tool.js";
import { ToolRegistry, executeToolUse } from "./tool-registry.js";

export type AgentMode = "plan" | "build";

export interface AgentRunOptions {
  provider: Provider;
  model: string;
  /** The repository root the agent operates against. */
  cwd: string;
  mode: AgentMode;
  system?: string;
  tools?: ToolRegistry;
  maxTokens?: number;
  temperature?: number;
  /** Hard ceiling on model<->tool round trips, to prevent infinite loops. */
  maxIterations?: number;
  /** Streamed text deltas from the model, forwarded from the underlying provider call. */
  onTextDelta?: (delta: string) => void;
  /** Called whenever a tool is about to run, useful for UI/logging. */
  onToolStart?: (block: ToolUseBlock) => void;
  /** Called with the result of a tool call. */
  onToolEnd?: (block: ToolUseBlock, resultContent: string, isError: boolean) => void;
  /** Forwarded into ToolExecutionContext for tools (e.g. run_command) that stream output. */
  onToolProgress?: (chunk: string) => void;
}

export interface AgentRunResult {
  /** All messages produced during this run (assistant + tool turns), in order. */
  messages: Message[];
  /** Why the loop stopped. */
  stopReason: "end_turn" | "max_iterations" | "max_tokens";
  iterations: number;
  totalUsage: { inputTokens: number; outputTokens: number };
}

const DEFAULT_MAX_ITERATIONS = 25;

/**
 * Runs the agent loop: send messages to the model, execute any tool calls
 * it requests, feed results back, and repeat until the model produces a
 * plain end_turn response or a safety limit is hit.
 *
 * `conversationHistory` is mutated by appending new messages, and is also
 * returned in the result for convenience - callers own message persistence.
 */
export async function runAgentLoop(
  conversationHistory: Message[],
  options: AgentRunOptions,
): Promise<AgentRunResult> {
  const registry = options.tools ?? new ToolRegistry();
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const toolsForMode = registry.listForMode(options.mode);

  const ctx: ToolExecutionContext = {
    cwd: options.cwd,
    mode: options.mode,
    onProgress: options.onToolProgress,
  };

  const produced: Message[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const result = await options.provider.complete({
      model: options.model,
      messages: conversationHistory,
      system: options.system,
      tools: toolsForMode.length > 0 ? toolsForMode : undefined,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      onTextDelta: options.onTextDelta,
    });

    totalInputTokens += result.usage.inputTokens;
    totalOutputTokens += result.usage.outputTokens;

    conversationHistory.push(result.message);
    produced.push(result.message);

    if (result.stopReason === "max_tokens") {
      return {
        messages: produced,
        stopReason: "max_tokens",
        iterations: iteration,
        totalUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    }

    const toolUseBlocks = result.message.content.filter((b): b is ToolUseBlock => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      // Plain end_turn with no further tool calls - the agent is done for this run.
      return {
        messages: produced,
        stopReason: "end_turn",
        iterations: iteration,
        totalUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    }

    const resultBlocks: ContentBlock[] = [];
    for (const block of toolUseBlocks) {
      options.onToolStart?.(block);
      const toolResult = await executeToolUse(block, registry, ctx);
      options.onToolEnd?.(block, toolResult.content, toolResult.isError ?? false);
      resultBlocks.push(toolResult);
    }

    const toolResultsMessage: Message = { role: "tool", content: resultBlocks };
    conversationHistory.push(toolResultsMessage);
    produced.push(toolResultsMessage);
  }

  return {
    messages: produced,
    stopReason: "max_iterations",
    iterations: maxIterations,
    totalUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  };
}
