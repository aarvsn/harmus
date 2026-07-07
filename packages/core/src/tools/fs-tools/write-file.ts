import { z } from "zod";
import { writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "../../types/tool.js";
import { resolveSafePath, PathSecurityError } from "./safe-path.js";

const WriteFileSchema = z.object({
  path: z.string().describe("Path to the file, relative to the repository root"),
  content: z.string().describe("Full content to write to the file"),
  createDirectories: z
    .boolean()
    .optional()
    .describe("Create parent directories if they don't exist (default: true)"),
});

export type WriteFileInput = z.infer<typeof WriteFileSchema>;

export const writeFileTool: ToolDefinition<WriteFileInput> = {
  name: "write_file",
  description:
    "Create a new file or overwrite an existing file with the given content. " +
    "Use edit_file instead if you only need to change part of an existing file.",
  mutates: true,
  schema: WriteFileSchema,
  async execute(input, ctx) {
    if (ctx.mode === "plan") {
      return {
        content: "Error: write_file is unavailable in Plan Mode. Switch to Build Mode to modify files.",
        isError: true,
      };
    }

    try {
      const target = resolveSafePath(ctx.cwd, input.path);

      const existing = await stat(target).catch(() => null);
      if (existing?.isDirectory()) {
        return { content: `Error: "${input.path}" is a directory, cannot write a file there`, isError: true };
      }

      if (input.createDirectories !== false) {
        await mkdir(path.dirname(target), { recursive: true });
      }

      await writeFile(target, input.content, "utf-8");

      const verb = existing ? "Overwrote" : "Created";
      const lineCount = input.content.split("\n").length;
      return { content: `${verb} ${input.path} (${lineCount} lines)` };
    } catch (err) {
      if (err instanceof PathSecurityError) {
        return { content: `Error: ${err.message}`, isError: true };
      }
      return { content: `Error writing file: ${(err as Error).message}`, isError: true };
    }
  },
};
