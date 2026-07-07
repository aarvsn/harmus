import type { AnyToolDefinition } from "../types/tool.js";
import { FILE_TOOLS } from "./fs-tools/index.js";
import { SEARCH_TOOLS } from "./search-tools/index.js";
import { SHELL_TOOLS } from "./shell-tools/index.js";
import { GIT_TOOLS } from "./git-tools/index.js";

export * from "./zod-to-json-schema.js";
export * from "./diff.js";
export * from "./fs-tools/index.js";
export * from "./search-tools/index.js";
export * from "./shell-tools/index.js";
export * from "./git-tools/index.js";

/** Every built-in tool Harmus ships with, ready to register with an agent. */
export const ALL_TOOLS: AnyToolDefinition[] = [...FILE_TOOLS, ...SEARCH_TOOLS, ...SHELL_TOOLS, ...GIT_TOOLS];
