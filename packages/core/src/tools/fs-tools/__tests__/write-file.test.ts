import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { writeFileTool } from "../write-file.js";
import { makeTempRepo, cleanupTempRepo, buildCtx } from "./test-helpers.js";

test("write_file creates a new file", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await writeFileTool.execute({ path: "new.txt", content: "hello world" }, buildCtx(repo));
    assert.equal(result.isError, undefined);
    assert.match(result.content, /Created/);
    const written = await readFile(path.join(repo, "new.txt"), "utf-8");
    assert.equal(written, "hello world");
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("write_file overwrites an existing file", async () => {
  const repo = await makeTempRepo();
  try {
    await writeFileTool.execute({ path: "a.txt", content: "v1" }, buildCtx(repo));
    const result = await writeFileTool.execute({ path: "a.txt", content: "v2" }, buildCtx(repo));
    assert.match(result.content, /Overwrote/);
    const written = await readFile(path.join(repo, "a.txt"), "utf-8");
    assert.equal(written, "v2");
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("write_file creates parent directories by default", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await writeFileTool.execute(
      { path: "deep/nested/dir/file.txt", content: "x" },
      buildCtx(repo),
    );
    assert.equal(result.isError, undefined);
    const written = await readFile(path.join(repo, "deep/nested/dir/file.txt"), "utf-8");
    assert.equal(written, "x");
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("write_file refuses to create parent dirs when createDirectories=false", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await writeFileTool.execute(
      { path: "missing/file.txt", content: "x", createDirectories: false },
      buildCtx(repo),
    );
    assert.equal(result.isError, true);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("write_file is refused in plan mode and does not touch disk", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await writeFileTool.execute({ path: "a.txt", content: "x" }, buildCtx(repo, "plan"));
    assert.equal(result.isError, true);
    assert.match(result.content, /Plan Mode/);
    await assert.rejects(() => readFile(path.join(repo, "a.txt"), "utf-8"));
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("write_file errors when target path is an existing directory", async () => {
  const repo = await makeTempRepo();
  try {
    await mkdir(path.join(repo, "adir"));
    const result = await writeFileTool.execute({ path: "adir", content: "x" }, buildCtx(repo));
    assert.equal(result.isError, true);
    assert.match(result.content, /directory/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("write_file refuses to escape the repo root", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await writeFileTool.execute(
      { path: "../escape.txt", content: "x" },
      buildCtx(repo),
    );
    assert.equal(result.isError, true);
    assert.match(result.content, /outside the repository root/);
  } finally {
    await cleanupTempRepo(repo);
  }
});
