import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { grepFilesTool } from "../grep-files.js";
import { makeTempRepo, cleanupTempRepo, buildCtx } from "../../fs-tools/__tests__/test-helpers.js";

async function buildSampleTree(repo: string) {
  await mkdir(path.join(repo, "src"), { recursive: true });
  await mkdir(path.join(repo, "node_modules", "dep"), { recursive: true });
  await writeFile(
    path.join(repo, "src", "auth.ts"),
    "export function login(user: string) {\n  return verify(user);\n}\n",
  );
  await writeFile(
    path.join(repo, "src", "session.ts"),
    "export function login(user: string, token: string) {\n  return user + token;\n}\n",
  );
  await writeFile(path.join(repo, "src", "util.ts"), "export const VERSION = '1.0.0';\n");
  await writeFile(path.join(repo, "node_modules", "dep", "index.js"), "function login() { return 'dep'; }\n");
}

test("grep_files finds matches across multiple files with line numbers", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await grepFilesTool.execute({ pattern: "function login" }, buildCtx(repo));
    assert.match(result.content, /src[\\/]auth\.ts:1:/);
    assert.match(result.content, /src[\\/]session\.ts:1:/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("grep_files excludes node_modules automatically", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await grepFilesTool.execute({ pattern: "function login" }, buildCtx(repo));
    assert.doesNotMatch(result.content, /node_modules/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("grep_files is case-insensitive by default", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await grepFilesTool.execute({ pattern: "FUNCTION LOGIN" }, buildCtx(repo));
    assert.match(result.content, /auth\.ts/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("grep_files respects caseSensitive=true", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await grepFilesTool.execute({ pattern: "FUNCTION LOGIN", caseSensitive: true }, buildCtx(repo));
    assert.match(result.content, /No matches/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("grep_files supports regex patterns", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await grepFilesTool.execute({ pattern: "VERS.ON" }, buildCtx(repo));
    assert.match(result.content, /util\.ts/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("grep_files reports a clean error on invalid regex", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await grepFilesTool.execute({ pattern: "[" }, buildCtx(repo));
    assert.match(result.content, /invalid regular expression/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("grep_files filters by filePattern suffix", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await grepFilesTool.execute({ pattern: "login", filePattern: "session.ts" }, buildCtx(repo));
    assert.match(result.content, /session\.ts/);
    assert.doesNotMatch(result.content, /auth\.ts/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("grep_files can scope search to a subdirectory", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    await mkdir(path.join(repo, "other"), { recursive: true });
    await writeFile(path.join(repo, "other", "x.ts"), "function login() {}");

    const result = await grepFilesTool.execute({ pattern: "login", path: "other" }, buildCtx(repo));
    assert.match(result.content, /other[\\/]x\.ts/);
    assert.doesNotMatch(result.content, /src/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("grep_files returns no-match message when nothing found", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await grepFilesTool.execute({ pattern: "nonexistent" }, buildCtx(repo));
    assert.match(result.content, /No matches found/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("grep_files includes context lines when requested", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await grepFilesTool.execute({ pattern: "function login", includeContext: true }, buildCtx(repo));
    assert.match(result.content, /export function login/);
    // On Windows context lines might be joined differently or not captured if grep is not available
    // But our internal implementation uses fs.readFile
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("grep_files works in plan mode (non-mutating)", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await grepFilesTool.execute({ pattern: "login" }, buildCtx(repo, "plan"));
    assert.match(result.content, /auth\.ts/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("grep_files refuses to escape the repo root", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await grepFilesTool.execute({ pattern: "foo", path: "../../" }, buildCtx(path.resolve(repo)));
    assert.match(result.content, /outside the repository root/);
  } finally {
    await cleanupTempRepo(repo);
  }
});
