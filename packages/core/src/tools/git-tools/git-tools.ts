import { z } from "zod";
import type { ToolDefinition } from "../../types/tool.js";
import { runGit, isGitRepo } from "./git-exec.js";

async function guardGit(cwd: string): Promise<string | null> {
  if (!(await isGitRepo(cwd))) {
    return `Error: "${cwd}" is not inside a git repository`;
  }
  return null;
}

// ─── git_status ───────────────────────────────────────────────────────────────
export const gitStatusTool: ToolDefinition<{}> = {
  name: "git_status",
  description: "Show the working tree status (staged, unstaged, untracked files).",
  mutates: false,
  schema: z.object({}),
  async execute(_input, ctx) {
    const guard = await guardGit(ctx.cwd);
    if (guard) return { content: guard, isError: true };
    try {
      const { stdout } = await runGit(["status", "--short", "--branch"], ctx.cwd);
      return { content: stdout.trim() || "(nothing to commit, working tree clean)" };
    } catch (err) {
      return { content: `Error: ${(err as Error).message}`, isError: true };
    }
  },
};

// ─── git_diff ─────────────────────────────────────────────────────────────────
const GitDiffSchema = z.object({
  staged: z.boolean().optional().describe("Show staged (--cached) diff instead of unstaged (default: false)"),
  path: z.string().optional().describe("Limit diff to a specific file or directory"),
});

export const gitDiffTool: ToolDefinition<z.infer<typeof GitDiffSchema>> = {
  name: "git_diff",
  description:
    "Show changes not yet staged (or staged changes with staged=true). " +
    "Essential for reviewing what the agent has changed before committing.",
  mutates: false,
  schema: GitDiffSchema,
  async execute(input, ctx) {
    const guard = await guardGit(ctx.cwd);
    if (guard) return { content: guard, isError: true };
    try {
      const args = ["diff"];
      if (input.staged) args.push("--cached");
      if (input.path) args.push("--", input.path);
      const { stdout } = await runGit(args, ctx.cwd);
      return { content: stdout.trim() || "(no changes)" };
    } catch (err) {
      return { content: `Error: ${(err as Error).message}`, isError: true };
    }
  },
};

// ─── git_log ──────────────────────────────────────────────────────────────────
const GitLogSchema = z.object({
  n: z.number().optional().describe("Number of commits to show (default: 10)"),
  oneline: z.boolean().optional().describe("Show one line per commit (default: true)"),
});

export const gitLogTool: ToolDefinition<z.infer<typeof GitLogSchema>> = {
  name: "git_log",
  description: "Show recent commit history.",
  mutates: false,
  schema: GitLogSchema,
  async execute(input, ctx) {
    const guard = await guardGit(ctx.cwd);
    if (guard) return { content: guard, isError: true };
    try {
      const n = input.n ?? 10;
      const format = input.oneline !== false ? ["--oneline"] : ["--format=%h %s (%an, %ar)"];
      const { stdout } = await runGit(["log", `--max-count=${n}`, ...format], ctx.cwd);
      return { content: stdout.trim() || "(no commits yet)" };
    } catch (err) {
      return { content: `Error: ${(err as Error).message}`, isError: true };
    }
  },
};

// ─── git_commit ───────────────────────────────────────────────────────────────
const GitCommitSchema = z.object({
  message: z.string().describe("Commit message"),
  addAll: z.boolean().optional().describe("Stage all tracked changes before committing (git add -u). Default: true"),
});

export const gitCommitTool: ToolDefinition<z.infer<typeof GitCommitSchema>> = {
  name: "git_commit",
  description:
    "Stage and commit changes. By default stages all modified tracked files (-u). " +
    "Use git_status first to review what will be committed.",
  mutates: true,
  schema: GitCommitSchema,
  async execute(input, ctx) {
    if (ctx.mode === "plan") {
      return { content: "Error: git_commit is unavailable in Plan Mode.", isError: true };
    }
    const guard = await guardGit(ctx.cwd);
    if (guard) return { content: guard, isError: true };
    try {
      if (input.addAll !== false) {
        await runGit(["add", "-u"], ctx.cwd);
      }
      const { stdout } = await runGit(["commit", "-m", input.message], ctx.cwd);
      return { content: stdout.trim() };
    } catch (err) {
      return { content: `Error: ${(err as Error).message}`, isError: true };
    }
  },
};

// ─── git_branch ───────────────────────────────────────────────────────────────
const GitBranchSchema = z.object({
  action: z.enum(["list", "create", "switch", "delete"]).describe("What to do with the branch"),
  name: z.string().optional().describe("Branch name (required for create, switch, delete)"),
});

export const gitBranchTool: ToolDefinition<z.infer<typeof GitBranchSchema>> = {
  name: "git_branch",
  description: "List, create, switch, or delete branches.",
  mutates: true,
  schema: GitBranchSchema,
  async execute(input, ctx) {
    if (ctx.mode === "plan" && input.action !== "list") {
      return { content: "Error: git_branch (create/switch/delete) is unavailable in Plan Mode.", isError: true };
    }
    const guard = await guardGit(ctx.cwd);
    if (guard) return { content: guard, isError: true };

    try {
      switch (input.action) {
        case "list": {
          const { stdout } = await runGit(["branch", "--list", "-v"], ctx.cwd);
          return { content: stdout.trim() || "(no branches)" };
        }
        case "create": {
          if (!input.name) return { content: "Error: name is required for create", isError: true };
          const { stdout } = await runGit(["checkout", "-b", input.name], ctx.cwd);
          return { content: stdout.trim() || `Created branch ${input.name}` };
        }
        case "switch": {
          if (!input.name) return { content: "Error: name is required for switch", isError: true };
          const { stdout } = await runGit(["checkout", input.name], ctx.cwd);
          return { content: stdout.trim() || `Switched to ${input.name}` };
        }
        case "delete": {
          if (!input.name) return { content: "Error: name is required for delete", isError: true };
          const { stdout } = await runGit(["branch", "-d", input.name], ctx.cwd);
          return { content: stdout.trim() || `Deleted branch ${input.name}` };
        }
      }
    } catch (err) {
      return { content: `Error: ${(err as Error).message}`, isError: true };
    }
  },
};
