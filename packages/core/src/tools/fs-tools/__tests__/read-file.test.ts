import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { readFileTool } from "../read-file.js";
import { makeTempRepo, cleanupTempRepo, buildCtx } from "./test-helpers.js";

test("read_file reads full file content with line numbers", async () => {
  const repo = await makeTempRepo();
  try {
    await writeFile(path.join(repo, "a.txt"), "line one\nline two\nline three");
    const result = await readFileTool.execute({ path: "a.txt" }, buildCtx(repo));
    assert.equal(result.isError, undefined);
    assert.match(result.content, /1\t/);
    assert.match(result.content, /line one/);
    assert.match(result.content, /line three/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("read_file respects startLine/endLine range", async () => {
  const repo = await makeTempRepo();
  try {
    await writeFile(path.join(repo, "a.txt"), "1\n2\n3\n4\n5");
    const result = await readFileTool.execute({ path: "a.txt", startLine: 2, endLine: 3 }, buildCtx(repo));
    assert.match(result.content, /2/);
    assert.match(result.content, /3/);
    assert.doesNotMatch(result.content, /\t4/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("read_file errors cleanly on missing file", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await readFileTool.execute({ path: "nope.txt" }, buildCtx(repo));
    assert.equal(result.isError, true);
    assert.match(result.content, /not found/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("read_file errors when given a directory", async () => {
  const repo = await makeTempRepo();
  try {
    await mkdir(path.join(repo, "subdir"));
    const result = await readFileTool.execute({ path: "subdir" }, buildCtx(repo));
    assert.equal(result.isError, true);
    assert.match(result.content, /directory/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("read_file refuses to escape the repo root", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await readFileTool.execute({ path: "../../../etc/passwd" }, buildCtx(repo));
    assert.equal(result.isError, true);
    assert.match(result.content, /outside the repository root/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("read_file works identically in plan mode (non-mutating)", async () => {
  const repo = await makeTempRepo();
  try {
    await writeFile(path.join(repo, "a.txt"), "hello");
    const result = await readFileTool.execute({ path: "a.txt" }, buildCtx(repo, "plan"));
    assert.equal(result.isError, undefined);
    assert.match(result.content, /hello/);
  } finally {
    await cleanupTempRepo(repo);
  }
});
