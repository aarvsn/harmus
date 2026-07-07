import type { AnyToolDefinition } from "../../types/tool.js";
import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { editFileTool } from "./edit-file.js";
import { listDirectoryTool } from "./list-directory.js";

export * from "./safe-path.js";
export * from "./read-file.js";
export * from "./write-file.js";
export * from "./edit-file.js";
export * from "./list-directory.js";

/** All file-operation tools, ready to register with an agent. */
export const FILE_TOOLS: AnyToolDefinition[] = [readFileTool, writeFileTool, editFileTool, listDirectoryTool];
