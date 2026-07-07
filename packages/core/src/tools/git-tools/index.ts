import type { AnyToolDefinition } from "../../types/tool.js";
import { gitStatusTool, gitDiffTool, gitLogTool, gitCommitTool, gitBranchTool } from "./git-tools.js";
import { createPRTool } from "./create-pr.js";

export * from "./git-exec.js";
export * from "./git-tools.js";
export * from "./create-pr.js";

export const GIT_TOOLS: AnyToolDefinition[] = [
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
  gitCommitTool,
  gitBranchTool,
  createPRTool,
];
