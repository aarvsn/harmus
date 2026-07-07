import { z } from "zod";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "../../types/tool.js";
import { resolveSafePath, PathSecurityError } from "./safe-path.js";

const DEFAULT_IGNORED = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  "__pycache__",
  ".venv",
]);

const ListDirectorySchema = z.object({
  path: z.string().optional().describe("Directory path relative to repository root (default: root)"),
  recursive: z.boolean().optional().describe("List subdirectories recursively (default: false)"),
  maxDepth: z.number().optional().describe("Max recursion depth when recursive=true (default: 5)"),
});

export type ListDirectoryInput = z.infer<typeof ListDirectorySchema>;

export const listDirectoryTool: ToolDefinition<ListDirectoryInput> = {
  name: "list_directory",
  description:
    "List files and directories. Skips node_modules, .git, dist, build, and similar noise " +
    "directories automatically. Use recursive=true to see the full tree under a path.",
  mutates: false,
  schema: ListDirectorySchema,
  async execute(input, ctx) {
    try {
      const target = resolveSafePath(ctx.cwd, input.path ?? ".");
      const stats = await stat(target).catch(() => null);
      if (!stats) {
        return { content: `Error: path not found: ${input.path ?? "."}`, isError: true };
      }
      if (!stats.isDirectory()) {
        return { content: `Error: "${input.path}" is a file, not a directory`, isError: true };
      }

      const lines: string[] = [];
      const maxDepth = input.maxDepth ?? 5;
      await walk(target, target, input.recursive ?? false, 0, maxDepth, lines);

      if (lines.length === 0) {
        return { content: "(empty directory)" };
      }

      return { content: lines.join("\n") };
    } catch (err) {
      if (err instanceof PathSecurityError) {
        return { content: `Error: ${err.message}`, isError: true };
      }
      return { content: `Error listing directory: ${(err as Error).message}`, isError: true };
    }
  },
};

async function walk(
  root: string,
  dir: string,
  recursive: boolean,
  depth: number,
  maxDepth: number,
  out: string[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (DEFAULT_IGNORED.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".env") continue;

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(root, fullPath);
    const indent = "  ".repeat(depth);

    if (entry.isDirectory()) {
      out.push(`${indent}${relativePath}/`);
      if (recursive && depth < maxDepth) {
        await walk(root, fullPath, recursive, depth + 1, maxDepth, out);
      }
    } else {
      out.push(`${indent}${relativePath}`);
    }
  }
}
