import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { findFilesTool } from "../find-files.js";
import { makeTempRepo, cleanupTempRepo, buildCtx } from "../../fs-tools/__tests__/test-helpers.js";

async function buildSampleTree(repo: string) {
  await mkdir(path.join(repo, "src"), { recursive: true });
  await mkdir(path.join(repo, "node_modules", "dep"), { recursive: true });
  await writeFile(path.join(repo, "README.md"), "# readme");
  await writeFile(path.join(repo, "src", "index.ts"), "// entry");
  await writeFile(path.join(repo, "src", "index.test.ts"), "// test");
  await writeFile(path.join(repo, "src", "util.test.ts"), "// test");
  await writeFile(path.join(repo, "node_modules", "dep", "index.test.ts"), "// dep test");
}

test("find_files matches a trailing-wildcard pattern", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await findFilesTool.execute({ namePattern: "*.test.ts" }, buildCtx(repo));
    assert.match(result.content, /index\.test\.ts/);
    assert.match(result.content, /util\.test\.ts/);
    assert.doesNotMatch(result.content, /[\\/]index\.ts\b/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("find_files matches a leading-wildcard pattern", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await findFilesTool.execute({ namePattern: "README*" }, buildCtx(repo));
    assert.match(result.content, /README\.md/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("find_files matches exact filenames with no wildcard", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await findFilesTool.execute({ namePattern: "README.md" }, buildCtx(repo));
    assert.match(result.content, /README\.md/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("find_files excludes node_modules automatically", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await findFilesTool.execute({ namePattern: "*.test.ts" }, buildCtx(repo));
    assert.doesNotMatch(result.content, /node_modules/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("find_files reports no matches cleanly", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await findFilesTool.execute({ namePattern: "nonexistent*" }, buildCtx(repo));
    assert.match(result.content, /No files found/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("find_files can scope to a subdirectory", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await findFilesTool.execute({ namePattern: "index.ts", path: "src" }, buildCtx(repo));
    // Use a separator-agnostic regex
    assert.match(result.content, /src[\\/]index\.ts/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("find_files works in plan mode (non-mutating)", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await findFilesTool.execute({ namePattern: "README.md" }, buildCtx(repo, "plan"));
    assert.match(result.content, /README\.md/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("find_files refuses to escape the repo root", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    // Path resolution might be absolute, so resolve repo first
    const absRepo = path.resolve(repo);
    const result = await findFilesTool.execute({ namePattern: "*", path: "../../" }, buildCtx(absRepo));
    assert.match(result.content, /outside the repository root/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("find_files errors on missing search path", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await findFilesTool.execute({ namePattern: "*", path: "nonexistent" }, buildCtx(repo));
    assert.match(result.content, /path not found/i);
  } finally {
    await cleanupTempRepo(repo);
  }
});
