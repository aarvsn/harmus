import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runGit, isGitRepo } from "../git-exec.js";
import { gitStatusTool, gitDiffTool, gitLogTool, gitCommitTool, gitBranchTool } from "../git-tools.js";
import type { ToolExecutionContext } from "../../../types/tool.js";

async function makeTempGitRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "harmus-git-test-"));
  await runGit(["init"], dir);
  await runGit(["config", "user.email", "test@harmus.dev"], dir);
  await runGit(["config", "user.name", "Harmus Test"], dir);
  return dir;
}

async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

function buildCtx(cwd: string, mode: "plan" | "build" = "build"): ToolExecutionContext {
  return { cwd, mode };
}

async function makeInitialCommit(repo: string): Promise<void> {
  await writeFile(path.join(repo, "README.md"), "# Test Repo\n");
  await runGit(["add", "README.md"], repo);
  await runGit(["commit", "-m", "initial commit"], repo);
}

// ─── isGitRepo ────────────────────────────────────────────────────────────────

test("isGitRepo returns true inside a git repo", async () => {
  const repo = await makeTempGitRepo();
  try {
    assert.equal(await isGitRepo(repo), true);
  } finally {
    await cleanup(repo);
  }
});

test("isGitRepo returns false outside a git repo", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "harmus-nogit-"));
  try {
    assert.equal(await isGitRepo(dir), false);
  } finally {
    await cleanup(dir);
  }
});

// ─── git_status ───────────────────────────────────────────────────────────────

test("git_status reports untracked files", async () => {
  const repo = await makeTempGitRepo();
  try {
    await writeFile(path.join(repo, "a.ts"), "const x = 1;");
    const result = await gitStatusTool.execute({}, buildCtx(repo));
    assert.match(result.content, /a\.ts/);
  } finally {
    await cleanup(repo);
  }
});

test("git_status reports clean state", async () => {
  const repo = await makeTempGitRepo();
  try {
    await makeInitialCommit(repo);
    const result = await gitStatusTool.execute({}, buildCtx(repo));
    // --short --branch shows "## branchname" with no file lines when clean
    assert.doesNotMatch(result.content, /\? |M |A /); // no file status markers
  } finally {
    await cleanup(repo);
  }
});

test("git_status errors cleanly outside a git repo", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "h-ng-"));
  try {
    const result = await gitStatusTool.execute({}, buildCtx(dir));
    assert.equal(result.isError, true);
    assert.match(result.content, /not inside a git repository/);
  } finally {
    await cleanup(dir);
  }
});

// ─── git_diff ─────────────────────────────────────────────────────────────────

test("git_diff shows unstaged changes", async () => {
  const repo = await makeTempGitRepo();
  try {
    await makeInitialCommit(repo);
    await writeFile(path.join(repo, "README.md"), "# Modified\n");
    const result = await gitDiffTool.execute({}, buildCtx(repo));
    assert.match(result.content, /Modified/);
    assert.match(result.content, /@@/);
  } finally {
    await cleanup(repo);
  }
});

test("git_diff shows nothing when working tree is clean", async () => {
  const repo = await makeTempGitRepo();
  try {
    await makeInitialCommit(repo);
    const result = await gitDiffTool.execute({}, buildCtx(repo));
    assert.match(result.content, /no changes/i);
  } finally {
    await cleanup(repo);
  }
});

test("git_diff staged=true shows staged changes", async () => {
  const repo = await makeTempGitRepo();
  try {
    await makeInitialCommit(repo);
    await writeFile(path.join(repo, "NEW.md"), "new file");
    await runGit(["add", "NEW.md"], repo);
    const result = await gitDiffTool.execute({ staged: true }, buildCtx(repo));
    assert.match(result.content, /NEW\.md/);
  } finally {
    await cleanup(repo);
  }
});

// ─── git_log ──────────────────────────────────────────────────────────────────

test("git_log shows commit history", async () => {
  const repo = await makeTempGitRepo();
  try {
    await makeInitialCommit(repo);
    const result = await gitLogTool.execute({}, buildCtx(repo));
    assert.match(result.content, /initial commit/);
  } finally {
    await cleanup(repo);
  }
});

test("git_log respects n limit", async () => {
  const repo = await makeTempGitRepo();
  try {
    await makeInitialCommit(repo);
    await writeFile(path.join(repo, "b.ts"), "x");
    await runGit(["add", "b.ts"], repo);
    await runGit(["commit", "-m", "second commit"], repo);
    const result = await gitLogTool.execute({ n: 1 }, buildCtx(repo));
    assert.match(result.content, /second commit/);
    assert.doesNotMatch(result.content, /initial commit/);
  } finally {
    await cleanup(repo);
  }
});

// ─── git_commit ───────────────────────────────────────────────────────────────

test("git_commit is refused in plan mode", async () => {
  const repo = await makeTempGitRepo();
  try {
    const result = await gitCommitTool.execute({ message: "test" }, buildCtx(repo, "plan"));
    assert.equal(result.isError, true);
    assert.match(result.content, /Plan Mode/);
  } finally {
    await cleanup(repo);
  }
});

test("git_commit creates a commit from modified tracked files", async () => {
  const repo = await makeTempGitRepo();
  try {
    await makeInitialCommit(repo);
    await writeFile(path.join(repo, "README.md"), "# Updated\n");
    const result = await gitCommitTool.execute({ message: "update readme" }, buildCtx(repo));
    assert.equal(result.isError, undefined);
    const log = await gitLogTool.execute({ n: 1 }, buildCtx(repo));
    assert.match(log.content, /update readme/);
  } finally {
    await cleanup(repo);
  }
});

// ─── git_branch ───────────────────────────────────────────────────────────────

test("git_branch list shows existing branches", async () => {
  const repo = await makeTempGitRepo();
  try {
    await makeInitialCommit(repo);
    const result = await gitBranchTool.execute({ action: "list" }, buildCtx(repo));
    assert.equal(result.isError, undefined);
    assert.match(result.content, /master|main/);
  } finally {
    await cleanup(repo);
  }
});

test("git_branch create makes a new branch", async () => {
  const repo = await makeTempGitRepo();
  try {
    await makeInitialCommit(repo);
    await gitBranchTool.execute({ action: "create", name: "feature/oauth" }, buildCtx(repo));
    const list = await gitBranchTool.execute({ action: "list" }, buildCtx(repo));
    assert.match(list.content, /feature\/oauth/);
  } finally {
    await cleanup(repo);
  }
});

test("git_branch create is refused in plan mode", async () => {
  const repo = await makeTempGitRepo();
  try {
    await makeInitialCommit(repo);
    const result = await gitBranchTool.execute({ action: "create", name: "x" }, buildCtx(repo, "plan"));
    assert.equal(result.isError, true);
  } finally {
    await cleanup(repo);
  }
});

test("git_branch list works in plan mode", async () => {
  const repo = await makeTempGitRepo();
  try {
    await makeInitialCommit(repo);
    const result = await gitBranchTool.execute({ action: "list" }, buildCtx(repo, "plan"));
    assert.equal(result.isError, undefined);
  } finally {
    await cleanup(repo);
  }
});
