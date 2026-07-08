import { z } from "zod";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "../../types/tool.js";
import { resolveSafePath, PathSecurityError } from "../fs-tools/safe-path.js";
import { walkFiles } from "./walk.js";

const GrepFilesSchema = z.object({
  pattern: z.string().describe("Regular expression to search for (JavaScript regex syntax)"),
  path: z.string().optional().describe("Directory to search within, relative to repo root (default: root)"),
  filePattern: z
    .string()
    .optional()
    .describe('Glob-like suffix filter, e.g. "*.ts" or "*.test.ts", to only search matching files'),
  caseSensitive: z.boolean().optional().describe("Default: false (case-insensitive)"),
  maxResults: z.number().optional().describe("Max number of matching lines to return (default: 200)"),
  contextLines: z
    .number()
    .optional()
    .describe("Lines of context to show before/after each match (default: 0)"),
});

export type GrepFilesInput = z.infer<typeof GrepFilesSchema>;

const MAX_FILE_SIZE_BYTES = 2_000_000; // skip binary/huge files

export const grepFilesTool: ToolDefinition<GrepFilesInput> = {
  name: "grep_files",
  description:
    "Search file contents across the repository (or a subdirectory) using a regular expression. " +
    "Returns matching lines with file:line references. Use this to find where a symbol, string, " +
    "or pattern is used before editing.",
  mutates: false,
  schema: GrepFilesSchema,
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

      let regex: RegExp;
      try {
        regex = new RegExp(input.pattern, input.caseSensitive ? "g" : "gi");
      } catch (err) {
        return { content: `Error: invalid regular expression: ${(err as Error).message}`, isError: true };
      }

      const maxResults = input.maxResults ?? 200;
      const contextLines = input.contextLines ?? 0;
      const suffixFilter = globSuffixToTest(input.filePattern);

      const results: string[] = [];
      let filesSearched = 0;
      let truncated = false;

      for await (const filePath of walkFiles(searchRoot)) {
        if (results.length >= maxResults) {
          truncated = true;
          break;
        }
        if (suffixFilter && !suffixFilter(filePath)) continue;

        const fileStat = await stat(filePath).catch(() => null);
        if (!fileStat || fileStat.size > MAX_FILE_SIZE_BYTES) continue;

        const content = await readFile(filePath, "utf-8").catch(() => null);
        if (content === null || isLikelyBinary(content)) continue;

        filesSearched++;
        const lines = content.split("\n");
        const relPath = path.relative(ctx.cwd, filePath);

        for (let i = 0; i < lines.length; i++) {
          if (results.length >= maxResults) {
            truncated = true;
            break;
          }
          regex.lastIndex = 0;
          const line = lines[i] ?? "";
          if (regex.test(line)) {
            if (contextLines > 0) {
              const start = Math.max(0, i - contextLines);
              const end = Math.min(lines.length - 1, i + contextLines);
              for (let j = start; j <= end; j++) {
                const marker = j === i ? ":" : "-";
                results.push(`${relPath}${marker}${j + 1}${marker} ${lines[j]}`);
              }
              results.push("--");
            } else {
              results.push(`${relPath}:${i + 1}: ${line}`);
            }
          }
        }
      }

      if (results.length === 0) {
        return { content: `No matches found for /${input.pattern}/ (searched ${filesSearched} files)` };
      }

      const header = truncated
        ? `Showing first ${maxResults} matches (more exist, narrow your pattern or path):\n`
        : `${results.filter((r) => r !== "--").length} match(es) in ${filesSearched} files searched:\n`;

      return { content: header + results.join("\n") };
    } catch (err) {
      if (err instanceof PathSecurityError) {
        return { content: `Error: ${err.message}`, isError: true };
      }
      return { content: `Error searching files: ${(err as Error).message}`, isError: true };
    }
  },
};

/** Converts a simple "*.ts" / "*.test.ts" style pattern into a path-suffix test. */
function globSuffixToTest(pattern: string | undefined): ((filePath: string) => boolean) | null {
  if (!pattern) return null;
  if (pattern.startsWith("*")) {
    const suffix = pattern.slice(1);
    return (filePath) => filePath.endsWith(suffix);
  }
  // Fallback: treat as a literal substring match on the filename.
  return (filePath) => path.basename(filePath).includes(pattern);
}

function isLikelyBinary(content: string): boolean {
  // Cheap heuristic: presence of a NUL byte in the first 8KB strongly implies binary.
  const sample = content.slice(0, 8000);
  return sample.includes("\u0000");
}
