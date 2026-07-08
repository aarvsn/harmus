import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { realpathSync } from "node:fs";
import { runCommandTool } from "../run-command.js";
import { makeTempRepo, cleanupTempRepo, buildCtx } from "../../fs-tools/__tests__/test-helpers.js";

test("run_command captures stdout and reports exit code 0", async () => {
  const repo = await makeTempRepo();
  try {
    const command = process.platform === "win32" ? "cmd /c echo hello" : "echo hello";
    const result = await runCommandTool.execute({ command }, buildCtx(repo));
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
    const command = process.platform === "win32"
      ? "cmd /c \"echo oops 1>&2 & exit 3\""
      : "echo oops 1>&2; exit 3";
    const result = await runCommandTool.execute({ command }, buildCtx(repo));
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
    const command = process.platform === "win32" ? "cmd /c cd" : "pwd";
    const result = await runCommandTool.execute({ command }, buildCtx(repo));
    const actualCwd = result.content.split('\n')[0].trim();
    // Use realpathSync to resolve /var vs /private/var on macOS
    assert.equal(realpathSync(actualCwd).toLowerCase(), realpathSync(repo).toLowerCase());
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("run_command respects the cwd parameter for a subdirectory", async () => {
  const repo = await makeTempRepo();
  try {
    const sub = path.join(repo, "subdir");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(sub);

    const command = process.platform === "win32" ? "cmd /c cd" : "pwd";
    const result = await runCommandTool.execute({ command, cwd: "subdir" }, buildCtx(repo));
    const actualCwd = result.content.split('\n')[0].trim();
    assert.equal(realpathSync(actualCwd).toLowerCase(), realpathSync(sub).toLowerCase());
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("run_command enforces a timeout and kills long-running commands", async () => {
  const repo = await makeTempRepo();
  try {
    const command = process.platform === "win32" ? "powershell -Command Start-Sleep 10" : "sleep 10";
    const result = await runCommandTool.execute({ command, timeoutSeconds: 1 }, buildCtx(repo));
    assert.equal(result.isError, true);
    assert.match(result.content, /timeout/i);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("run_command is refused in plan mode and does not execute", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await runCommandTool.execute({ command: "echo should-not-run" }, buildCtx(repo, "plan"));
    assert.equal(result.isError, true);
    assert.match(result.content, /unavailable in Plan Mode/i);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("run_command allows arbitrary commands without filtering (trusted model)", async () => {
  const repo = await makeTempRepo();
  try {
    const command = process.platform === "win32" ? "cmd /c \"echo test\"" : "ls -la";
    const result = await runCommandTool.execute({ command }, buildCtx(repo));
    assert.equal(result.isError, undefined);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("run_command reports spawn errors cleanly for a nonexistent shell builtin path", async () => {
  const repo = await makeTempRepo();
  try {
    const command = "non-existent-command-12345";
    const result = await runCommandTool.execute({ command }, buildCtx(repo));
    assert.equal(result.isError, true);
    assert.match(result.content, /exit code: [1-9]/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("run_command truncates very large output", async () => {
  const repo = await makeTempRepo();
  try {
    const command = process.platform === "win32"
      ? "powershell -Command \"1..3000 | ForEach-Object { 'a' * 100 }\""
      : "for i in $(seq 1 3000); do printf 'a%.0s' $(seq 1 100); echo; done";

    const result = await runCommandTool.execute({ command }, buildCtx(repo));
    assert.match(result.content, /truncated/i);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("run_command onProgress callback receives streamed chunks", async () => {
  const repo = await makeTempRepo();
  try {
    let output = "";
    const command = process.platform === "win32" ? "cmd /c echo hello" : "echo hello";
    const ctx = buildCtx(repo);
    ctx.onProgress = (chunk) => { output += chunk; };

    await runCommandTool.execute({ command }, ctx);
    assert.match(output, /hello/);
  } finally {
    await cleanupTempRepo(repo);
  }
});
