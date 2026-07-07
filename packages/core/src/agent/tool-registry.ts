import type { AnyToolDefinition, ToolExecutionContext } from "../types/tool.js";
import type { ToolUseBlock, ToolResultBlock } from "../types/message.js";

export class ToolRegistry {
  private readonly tools = new Map<string, AnyToolDefinition>();

  constructor(tools: AnyToolDefinition[] = []) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: AnyToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): AnyToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): AnyToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** Tools available in the given mode - Plan Mode excludes mutating tools entirely from the model's view. */
  listForMode(mode: "plan" | "build"): AnyToolDefinition[] {
    if (mode === "build") return this.list();
    return this.list().filter((t) => !t.mutates);
  }
}

/**
 * Executes a single tool_use block against the registry, always returning a
 * tool_result block rather than throwing - schema validation failures,
 * unknown tool names, and execution errors are all reported back to the
 * model as an error result so it can self-correct instead of crashing the run.
 */
export async function executeToolUse(
  block: ToolUseBlock,
  registry: ToolRegistry,
  ctx: ToolExecutionContext,
): Promise<ToolResultBlock> {
  const tool = registry.get(block.name);

  if (!tool) {
    return {
      type: "tool_result",
      toolUseId: block.id,
      content: `Error: no tool named "${block.name}" is registered`,
      isError: true,
    };
  }

  if (tool.mutates && ctx.mode === "plan") {
    return {
      type: "tool_result",
      toolUseId: block.id,
      content: `Error: "${block.name}" cannot be used in Plan Mode because it modifies the repository`,
      isError: true,
    };
  }

  const parsed = tool.schema.safeParse(block.input);
  if (!parsed.success) {
    return {
      type: "tool_result",
      toolUseId: block.id,
      content: `Error: invalid input for tool "${block.name}": ${parsed.error.message}`,
      isError: true,
    };
  }

  try {
    const result = await tool.execute(parsed.data, ctx);
    return {
      type: "tool_result",
      toolUseId: block.id,
      content: result.content,
      ...(result.isError ? { isError: true } : {}),
    };
  } catch (err) {
    return {
      type: "tool_result",
      toolUseId: block.id,
      content: `Error: tool "${block.name}" threw an unexpected error: ${(err as Error).message}`,
      isError: true,
    };
  }
}
