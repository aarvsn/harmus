import { z } from "zod";
import { readFile, writeFile, stat } from "node:fs/promises";
import type { ToolDefinition } from "../../types/tool.js";
import { resolveSafePath, PathSecurityError } from "./safe-path.js";
import { computeDiff, formatDiff } from "../diff.js";

const EditFileSchema = z.object({
  path: z.string().describe("Path to the file, relative to the repository root"),
  oldStr: z.string().describe("Exact text to find. Must appear exactly once in the file."),
  newStr: z.string().optional().describe("Text to replace it with. Omit/empty to delete oldStr."),
});

export type EditFileInput = z.infer<typeof EditFileSchema>;

export const editFileTool: ToolDefinition<EditFileInput> = {
  name: "edit_file",
  description:
    "Replace an exact, unique block of text in an existing file. " +
    "oldStr must match the file's current content exactly and appear exactly once - " +
    "include enough surrounding context to make it unique. Fails if oldStr is not found " +
    "or appears more than once, so the model can retry with more context instead of " +
    "silently editing the wrong location.",
  mutates: true,
  schema: EditFileSchema,
  async execute(input, ctx) {
    if (ctx.mode === "plan") {
      return {
        content: "Error: edit_file is unavailable in Plan Mode. Switch to Build Mode to modify files.",
        isError: true,
      };
    }

    try {
      const target = resolveSafePath(ctx.cwd, input.path);
      const stats = await stat(target).catch(() => null);
      if (!stats) {
        return { content: `Error: file not found: ${input.path}`, isError: true };
      }
      if (stats.isDirectory()) {
        return { content: `Error: "${input.path}" is a directory, not a file`, isError: true };
      }

      const original = await readFile(target, "utf-8");
      const occurrences = countOccurrences(original, input.oldStr);

      if (occurrences === 0) {
        return {
          content:
            `Error: oldStr was not found in ${input.path}. No changes were made. ` +
            `Double-check whitespace and exact wording, or read the file again to get current content.`,
          isError: true,
        };
      }
      if (occurrences > 1) {
        return {
          content:
            `Error: oldStr appears ${occurrences} times in ${input.path}, but must be unique. ` +
            `Include more surrounding context in oldStr to uniquely identify the location.`,
          isError: true,
        };
      }

      const updated = original.replace(input.oldStr, input.newStr ?? "");
      await writeFile(target, updated, "utf-8");

      // Include a diff in the result so the model and TUI can see exactly what changed
      const diff = computeDiff(input.path, original, updated);
      const diffText = formatDiff(diff);
      return { content: `Edited ${input.path}\n\n${diffText}` };
    } catch (err) {
      if (err instanceof PathSecurityError) {
        return { content: `Error: ${err.message}`, isError: true };
      }
      return { content: `Error editing file: ${(err as Error).message}`, isError: true };
    }
  },
};

function countOccurrences(haystack: string, needle: string): number {
  if (needle === "") return 0;
  let count = 0;
  let index = 0;
  while (true) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    count++;
    index = found + needle.length;
  }
  return count;
}
