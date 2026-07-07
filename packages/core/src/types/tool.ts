import type { z } from "zod";

/**
 * A tool definition that can be passed to a model and executed locally.
 * `schema` is a Zod schema; we derive the JSON schema sent to providers
 * from it, and use it to validate/parse model-provided input at execution time.
 */
export interface ToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<TInput>;
  /** Whether this tool mutates the filesystem or runs commands. Plan Mode refuses these. */
  mutates: boolean;
  execute: (input: TInput, ctx: ToolExecutionContext) => Promise<ToolExecutionResult>;
}

export interface ToolExecutionContext {
  /** Absolute path to the repository root the agent is operating in. */
  cwd: string;
  /** "plan" | "build" - tools that mutate must check this and refuse in plan mode. */
  mode: "plan" | "build";
  /** Called by long-running tools to stream progress back to the UI. */
  onProgress?: (chunk: string) => void;
}

export interface ToolExecutionResult {
  content: string;
  isError?: boolean;
}

/** A tool definition with its schema erased, for storage in heterogeneous collections. */
export type AnyToolDefinition = ToolDefinition<any>;
