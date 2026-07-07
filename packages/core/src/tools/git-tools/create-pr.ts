import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDefinition } from "../../types/tool.js";
import { runGit, isGitRepo } from "./git-exec.js";

const execFileAsync = promisify(execFile);

const CreatePRSchema = z.object({
  title: z.string().describe("Pull request title"),
  body: z.string().describe("Pull request description (markdown supported)"),
  base: z.string().optional().describe("Base branch to merge into (default: main or master)"),
  draft: z.boolean().optional().describe("Create as a draft PR (default: false)"),
});

export const createPRTool: ToolDefinition<z.infer<typeof CreatePRSchema>> = {
  name: "create_pr",
  description:
    "Create a GitHub pull request for the current branch using the 'gh' CLI. " +
    "If gh is not installed, outputs the PR title, body, and a manual creation URL instead.",
  mutates: true,
  schema: CreatePRSchema,
  async execute(input, ctx) {
    if (ctx.mode === "plan") {
      return { content: "Error: create_pr is unavailable in Plan Mode.", isError: true };
    }
    if (!(await isGitRepo(ctx.cwd))) {
      return { content: `Error: "${ctx.cwd}" is not inside a git repository`, isError: true };
    }

    // Push current branch
    try {
      const { stdout: branchOut } = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], ctx.cwd);
      const branch = branchOut.trim();

      await runGit(["push", "--set-upstream", "origin", branch], ctx.cwd);

      // Try gh CLI first
      const ghAvailable = await checkGhCli();
      if (ghAvailable) {
        const args = ["pr", "create", "--title", input.title, "--body", input.body];
        if (input.base) args.push("--base", input.base);
        if (input.draft) args.push("--draft");
        const { stdout } = await execFileAsync("gh", args, { cwd: ctx.cwd });
        return { content: `Pull request created:\n${stdout.trim()}` };
      }

      // Fallback: construct GitHub URL from remote
      const { stdout: remoteOut } = await runGit(["remote", "get-url", "origin"], ctx.cwd);
      const repoUrl = gitRemoteToHttps(remoteOut.trim());
      const base = input.base ?? "main";
      const prUrl = repoUrl
        ? `${repoUrl}/compare/${base}...${branch}?quick_pull=1&title=${encodeURIComponent(input.title)}`
        : null;

      const lines = [
        "gh CLI not found. Create the PR manually:",
        "",
        `Title: ${input.title}`,
        "",
        `Body:\n${input.body}`,
        "",
        prUrl ? `Open this URL to create the PR:\n${prUrl}` : "Push the branch and open a PR on GitHub.",
      ];
      return { content: lines.join("\n") };
    } catch (err) {
      return { content: `Error: ${(err as Error).message}`, isError: true };
    }
  },
};

async function checkGhCli(): Promise<boolean> {
  try {
    await execFileAsync("gh", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

function gitRemoteToHttps(remote: string): string | null {
  // SSH: git@github.com:org/repo.git → https://github.com/org/repo
  const sshMatch = remote.match(/git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}`;
  // HTTPS: already a URL
  if (remote.startsWith("https://")) return remote.replace(/\.git$/, "");
  return null;
}
