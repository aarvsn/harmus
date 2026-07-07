import type { AnyToolDefinition } from "../../types/tool.js";
import { grepFilesTool } from "./grep-files.js";
import { findFilesTool } from "./find-files.js";
import { findSymbolTool } from "./find-symbol.js";

export * from "./walk.js";
export * from "./grep-files.js";
export * from "./find-files.js";
export * from "./find-symbol.js";

/** All search/discovery tools, ready to register with an agent. */
export const SEARCH_TOOLS: AnyToolDefinition[] = [grepFilesTool, findFilesTool, findSymbolTool];
