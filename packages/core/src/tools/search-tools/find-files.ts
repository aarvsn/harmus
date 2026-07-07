import { z } from "zod";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "../../types/tool.js";
import { resolveSafePath, PathSecurityError } from "../fs-tools/safe-path.js";
import { walkFiles } from "./walk.js";

const FindFilesSchema = z.object({
  namePattern: z
    .string()
    .describe('Pattern to match against the filename, e.g. "*.test.ts", "README*", or "config"'),
  path: z.string().optional().describe("Directory to search within, relative to repo root (default: root)"),
  maxResults: z.number().optional().describe("Max number of file paths to return (default: 200)"),
});

export type FindFilesInput = z.infer<typeof FindFilesSchema>;

export const findFilesTool: ToolDefinition<FindFilesInput> = {
  name: "find_files",
  description:
    "Find files by name across the repository (or a subdirectory) without searching contents. " +
    "Supports simple glob patterns with a leading or trailing *, e.g. \"*.test.ts\" or \"README*\". " +
    "Use grep_files instead if you need to search file contents.",
  mutates: false,
  schema: FindFilesSchema,
  async execute(input, ctx) {
    try {
      const searchRoot = resolveSafePath(ctx.cwd, input.path ?? ".");
      const rootStat = await stat(searchRoot).catch(() => null);
      if (!rootStat) {
        return { content: `Error: path not found: ${input.path ?? "."}`, isError: true };
      }
      if (!rootStat.isDirectory()) {
        return { content: `Error: "${input.path}" is not a directory`, isError: true };
      }

      const matcher = compileNameMatcher(input.namePattern);
      const maxResults = input.maxResults ?? 200;
      const matches: string[] = [];
      let truncated = false;

      for await (const filePath of walkFiles(searchRoot)) {
        if (matches.length >= maxResults) {
          truncated = true;
          break;
        }
        if (matcher(path.basename(filePath))) {
          matches.push(path.relative(ctx.cwd, filePath));
        }
      }

      if (matches.length === 0) {
        return { content: `No files found matching "${input.namePattern}"` };
      }

      const header = truncated
        ? `Showing first ${maxResults} results (more exist):\n`
        : `${matches.length} file(s) found:\n`;
      return { content: header + matches.join("\n") };
    } catch (err) {
      if (err instanceof PathSecurityError) {
        return { content: `Error: ${err.message}`, isError: true };
      }
      return { content: `Error finding files: ${(err as Error).message}`, isError: true };
    }
  },
};

/**
 * Compiles a simple glob pattern (supporting leading/trailing/middle "*")
 * into a matcher function tested against a bare filename. Intentionally
 * minimal - not a full glob implementation, just enough for "*.ts",
 * "README*", "*.test.*", and exact names.
 */
function compileNameMatcher(pattern: string): (filename: string) => boolean {
  if (!pattern.includes("*")) {
    return (filename) => filename === pattern;
  }
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const regex = new RegExp(`^${escaped}$`);
  return (filename) => regex.test(filename);
}
