import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve(import.meta.dirname, "../../dist/index.js");

async function runCli(args: string[], env: NodeJS.ProcessEnv = {}) {
  try {
    const result = await execFileAsync("node", [CLI_PATH, ...args], {
      env: { ...process.env, ...env, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY ?? "" },
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", exitCode: err.code ?? 1 };
  }
}

test("CLI --help lists plan and build commands", async () => {
  const result = await runCli(["--help"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /plan \[options\] <goal>/);
  assert.match(result.stdout, /build \[options\] <goal>/);
});

test("CLI --version prints a version number", async () => {
  const result = await runCli(["--version"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test("CLI plan --help shows goal argument and model/iteration options", async () => {
  const result = await runCli(["plan", "--help"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /<goal>/);
  assert.match(result.stdout, /--model/);
  assert.match(result.stdout, /--max-iterations/);
});

test("CLI plan with no API key exits 1 with an actionable error, no crash", async () => {
  const result = await runCli(["plan", "add a health check endpoint"]);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /ANTHROPIC_API_KEY/);
  assert.doesNotMatch(result.stderr, /at Object\.<anonymous>/); // no raw stack trace dumped
});

test("CLI build with no API key exits 1 with an actionable error", async () => {
  const result = await runCli(["build", "fix the bug"]);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /ANTHROPIC_API_KEY/);
});

test("CLI with no arguments shows help rather than crashing", async () => {
  const result = await runCli([]);
  // commander exits 0 and prints help when no subcommand is given in our config,
  // or exits non-zero with usage - either way it must not throw a raw JS error.
  assert.doesNotMatch(result.stderr, /TypeError|ReferenceError/);
});

test("CLI rejects an unknown command", async () => {
  const result = await runCli(["frobnicate", "something"]);
  assert.notEqual(result.exitCode, 0);
});

test("CLI plan requires the goal argument", async () => {
  const result = await runCli(["plan"]);
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /missing required argument|goal/i);
});
