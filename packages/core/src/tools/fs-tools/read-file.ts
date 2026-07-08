import { z } from "zod";
import { readFile, stat } from "node:fs/promises";
import type { ToolDefinition } from "../../types/tool.js";
import { resolveSafePath, PathSecurityError } from "./safe-path.js";

const ReadFileSchema = z.object({
  path: z.string().describe("Path to the file, relative to the repository root"),
  startLine: z.number().optional().describe("1-indexed line to start reading from"),
  endLine: z.number().optional().describe("1-indexed line to stop reading at (inclusive)"),
});

export type ReadFileInput = z.infer<typeof ReadFileSchema>;

export const readFileTool: ToolDefinition<ReadFileInput> = {
  name: "read_file",
  description:
    "Read the contents of a file in the repository. Returns line-numbered content. " +
    "Optionally restrict to a line range with startLine/endLine for large files.",
  mutates: false,
  schema: ReadFileSchema,
  async execute(input, ctx) {
    try {
      const target = resolveSafePath(ctx.cwd, input.path);
      const stats = await stat(target).catch(() => null);
      if (!stats) {
        return { content: `Error: file not found: ${input.path}`, isError: true };
      }
      if (stats.isDirectory()) {
        return { content: `Error: "${input.path}" is a directory, not a file`, isError: true };
      }

      const raw = await readFile(target, "utf-8");
      const lines = raw.split("\n");

      const start = input.startLine ? Math.max(1, input.startLine) : 1;
      const end = input.endLine ? Math.min(lines.length, input.endLine) : lines.length;

      if (start > lines.length) {
        return {
          content: `Error: startLine ${start} is beyond end of file (${lines.length} lines)`,
          isError: true,
        };
      }

      const numbered = lines
        .slice(start - 1, end)
        .map((line, i) => `${String(start + i).padStart(5, " ")}\t${line}`)
        .join("\n");

      return { content: numbered };
    } catch (err) {
      if (err instanceof PathSecurityError) {
        return { content: `Error: ${err.message}`, isError: true };
      }
      return { content: `Error reading file: ${(err as Error).message}`, isError: true };
    }
  },
};
