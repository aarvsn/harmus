import { z } from "zod";
import { spawn } from "node:child_process";
import type { ToolDefinition } from "../../types/tool.js";

const RunCommandSchema = z.object({
  command: z.string().describe('The shell command to execute, e.g. "npm test" or "git status"'),
  cwd: z
    .string()
    .optional()
    .describe("Working directory relative to the repository root to run the command in (default: repo root)"),
  timeoutSeconds: z.number().optional().describe("Max time to allow the command to run (default: 120)"),
});

export type RunCommandInput = z.infer<typeof RunCommandSchema>;

const DEFAULT_TIMEOUT_SECONDS = 120;
const MAX_OUTPUT_BYTES = 200_000; // ~200KB cap so a noisy command can't blow up context

export const runCommandTool: ToolDefinition<RunCommandInput> = {
  name: "run_command",
  description:
    "Execute a shell command (e.g. running tests, installing dependencies, git operations, linters). " +
    "Runs with the user's full shell privileges - the same as typing it into a terminal. " +
    "Output is captured and truncated if very large. Long-running commands are killed after the timeout.",
  mutates: true,
  schema: RunCommandSchema,
  async execute(input, ctx) {
    if (ctx.mode === "plan") {
      return {
        content: "Error: run_command is unavailable in Plan Mode. Switch to Build Mode to run commands.",
        isError: true,
      };
    }

    const timeoutMs = (input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;
    const workDir = input.cwd ? `${ctx.cwd}/${input.cwd}` : ctx.cwd;

    return new Promise((resolve) => {
      const child = spawn(input.command, {
        cwd: workDir,
        shell: true,
        env: process.env,
      });

      let stdout = "";
      let stderr = "";
      let outputBytes = 0;
      let truncated = false;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      const append = (chunk: Buffer, target: "stdout" | "stderr") => {
        if (truncated) return;
        outputBytes += chunk.length;
        if (outputBytes > MAX_OUTPUT_BYTES) {
          truncated = true;
          return;
        }
        const text = chunk.toString("utf-8");
        ctx.onProgress?.(text);
        if (target === "stdout") stdout += text;
        else stderr += text;
      };

      child.stdout?.on("data", (chunk: Buffer) => append(chunk, "stdout"));
      child.stderr?.on("data", (chunk: Buffer) => append(chunk, "stderr"));

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ content: `Error spawning command: ${err.message}`, isError: true });
      });

      child.on("close", (code, signal) => {
        clearTimeout(timer);

        const parts: string[] = [];
        if (stdout) parts.push(stdout.trimEnd());
        if (stderr) parts.push(`--- stderr ---\n${stderr.trimEnd()}`);
        if (truncated) parts.push(`[output truncated at ${MAX_OUTPUT_BYTES} bytes]`);

        if (timedOut) {
          parts.push(`[command killed after exceeding ${timeoutMs / 1000}s timeout]`);
          resolve({ content: parts.join("\n\n") || "(no output)", isError: true });
          return;
        }

        const exitCode = code ?? (signal ? -1 : 0);
        const summary = `[exit code: ${exitCode}${signal ? `, signal: ${signal}` : ""}]`;
        parts.push(summary);

        resolve({
          content: parts.join("\n\n") || summary,
          ...(exitCode !== 0 ? { isError: true } : {}),
        });
      });
    });
  },
};
