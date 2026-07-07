import { test } from "node:test";
import assert from "node:assert/strict";
import { runCommandTool } from "../run-command.js";
import { makeTempRepo, cleanupTempRepo, buildCtx } from "../../fs-tools/__tests__/test-helpers.js";

test("run_command captures stdout and reports exit code 0", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await runCommandTool.execute({ command: "echo hello" }, buildCtx(repo));
    assert.equal(result.isError, undefined);
    assert.match(result.content, /hello/);
    assert.match(result.content, /exit code: 0/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("run_command captures stderr and a non-zero exit code as an error", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await runCommandTool.execute({ command: "echo oops 1>&2; exit 3" }, buildCtx(repo));
    assert.equal(result.isError, true);
    assert.match(result.content, /oops/);
    assert.match(result.content, /exit code: 3/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("run_command runs in the repository root by default", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await runCommandTool.execute({ command: "pwd" }, buildCtx(repo));
    // Resolve any symlink differences (e.g. /tmp vs /private/tmp on macOS) by just checking suffix
    assert.ok(result.content.includes(repo.split("/").pop()!));
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("run_command respects the cwd parameter for a subdirectory", async () => {
  const repo = await makeTempRepo();
  try {
    await runCommandTool.execute({ command: "mkdir subdir" }, buildCtx(repo));
    const result = await runCommandTool.execute({ command: "pwd", cwd: "subdir" }, buildCtx(repo));
    assert.match(result.content, /subdir/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test(
  "run_command enforces a timeout and kills long-running commands",
  async () => {
    const repo = await makeTempRepo();
    try {
      const result = await runCommandTool.execute({ command: "sleep 5", timeoutSeconds: 1 }, buildCtx(repo));
      assert.equal(result.isError, true);
      assert.match(result.content, /timeout/);
    } finally {
      await cleanupTempRepo(repo);
    }
  },
  { timeout: 10_000 },
);

test("run_command is refused in plan mode and does not execute", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await runCommandTool.execute(
      { command: "echo should-not-run > marker.txt" },
      buildCtx(repo, "plan"),
    );
    assert.equal(result.isError, true);
    assert.match(result.content, /Plan Mode/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("run_command allows arbitrary commands without filtering (trusted model)", async () => {
  const repo = await makeTempRepo();
  try {
    // Demonstrates the "fully trusted" design: no blocklist/allowlist checks.
    const result = await runCommandTool.execute({ command: "echo first && echo second" }, buildCtx(repo));
    assert.match(result.content, /first/);
    assert.match(result.content, /second/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("run_command reports spawn errors cleanly for a nonexistent shell builtin path", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await runCommandTool.execute(
      { command: "this_command_does_not_exist_xyz" },
      buildCtx(repo),
    );
    assert.equal(result.isError, true);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("run_command truncates very large output", async () => {
  const repo = await makeTempRepo();
  try {
    // Generate well over 200KB of output
    const result = await runCommandTool.execute(
      { command: "for i in $(seq 1 50000); do echo 'this is a line of output padding'; done" },
      buildCtx(repo),
    );
    assert.match(result.content, /truncated/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("run_command onProgress callback receives streamed chunks", async () => {
  const repo = await makeTempRepo();
  try {
    const chunks: string[] = [];
    const ctx = { ...buildCtx(repo), onProgress: (chunk: string) => chunks.push(chunk) };
    await runCommandTool.execute({ command: "echo streamed-output" }, ctx);
    assert.ok(chunks.join("").includes("streamed-output"));
  } finally {
    await cleanupTempRepo(repo);
  }
});
