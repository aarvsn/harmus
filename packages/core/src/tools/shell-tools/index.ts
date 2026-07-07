import type { AnyToolDefinition } from "../../types/tool.js";
import { runCommandTool } from "./run-command.js";

export * from "./run-command.js";

/** All shell/command-execution tools, ready to register with an agent. */
export const SHELL_TOOLS: AnyToolDefinition[] = [runCommandTool];
