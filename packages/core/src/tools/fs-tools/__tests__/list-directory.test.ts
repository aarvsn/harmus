import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { listDirectoryTool } from "../list-directory.js";
import { makeTempRepo, cleanupTempRepo, buildCtx } from "./test-helpers.js";

async function buildSampleTree(repo: string) {
  await mkdir(path.join(repo, "src"), { recursive: true });
  await mkdir(path.join(repo, "node_modules", "some-pkg"), { recursive: true });
  await mkdir(path.join(repo, ".git"), { recursive: true });
  await writeFile(path.join(repo, "package.json"), "{}");
  await writeFile(path.join(repo, "src", "index.ts"), "// entry");
  await writeFile(path.join(repo, "src", "util.ts"), "// util");
  await writeFile(path.join(repo, "node_modules", "some-pkg", "index.js"), "// dep");
}

test("list_directory lists top-level entries non-recursively by default", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await listDirectoryTool.execute({}, buildCtx(repo));
    assert.match(result.content, /package\.json/);
    assert.match(result.content, /src\//);
    assert.doesNotMatch(result.content, /index\.ts/); // not recursive, so nested file shouldn't show
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("list_directory excludes node_modules and .git automatically", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await listDirectoryTool.execute({ recursive: true }, buildCtx(repo));
    assert.doesNotMatch(result.content, /node_modules/);
    assert.doesNotMatch(result.content, /\.git/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("list_directory recursive=true descends into subdirectories", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await listDirectoryTool.execute({ recursive: true }, buildCtx(repo));
    assert.match(result.content, /index\.ts/);
    assert.match(result.content, /util\.ts/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("list_directory can target a specific subdirectory", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await listDirectoryTool.execute({ path: "src" }, buildCtx(repo));
    assert.match(result.content, /index\.ts/);
    assert.match(result.content, /util\.ts/);
    assert.doesNotMatch(result.content, /package\.json/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("list_directory reports empty directory clearly", async () => {
  const repo = await makeTempRepo();
  try {
    await mkdir(path.join(repo, "empty"));
    const result = await listDirectoryTool.execute({ path: "empty" }, buildCtx(repo));
    assert.match(result.content, /empty directory/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("list_directory errors on missing path", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await listDirectoryTool.execute({ path: "nope" }, buildCtx(repo));
    assert.equal(result.isError, true);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("list_directory errors when given a file path instead of directory", async () => {
  const repo = await makeTempRepo();
  try {
    await writeFile(path.join(repo, "f.txt"), "x");
    const result = await listDirectoryTool.execute({ path: "f.txt" }, buildCtx(repo));
    assert.equal(result.isError, true);
    assert.match(result.content, /file, not a directory/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("list_directory works in plan mode (non-mutating)", async () => {
  const repo = await makeTempRepo();
  try {
    await buildSampleTree(repo);
    const result = await listDirectoryTool.execute({}, buildCtx(repo, "plan"));
    assert.equal(result.isError, undefined);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("list_directory refuses to escape the repo root", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await listDirectoryTool.execute({ path: "../../" }, buildCtx(repo));
    assert.equal(result.isError, true);
    assert.match(result.content, /outside the repository root/);
  } finally {
    await cleanupTempRepo(repo);
  }
});
