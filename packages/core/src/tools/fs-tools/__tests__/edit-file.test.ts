import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { editFileTool } from "../edit-file.js";
import { makeTempRepo, cleanupTempRepo, buildCtx } from "./test-helpers.js";

test("edit_file replaces a unique match", async () => {
  const repo = await makeTempRepo();
  try {
    await writeFile(path.join(repo, "a.ts"), "const x = 1;\nconst y = 2;\n");
    const result = await editFileTool.execute(
      { path: "a.ts", oldStr: "const x = 1;", newStr: "const x = 100;" },
      buildCtx(repo),
    );
    assert.equal(result.isError, undefined);
    // Result now includes a diff
    assert.match(result.content, /Edited a\.ts/);
    assert.match(result.content, /const x = 100/);
    const updated = await readFile(path.join(repo, "a.ts"), "utf-8");
    assert.equal(updated, "const x = 100;\nconst y = 2;\n");
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("edit_file fails with no changes when oldStr is not found", async () => {
  const repo = await makeTempRepo();
  try {
    await writeFile(path.join(repo, "a.ts"), "const x = 1;\n");
    const result = await editFileTool.execute(
      { path: "a.ts", oldStr: "const z = 99;", newStr: "const z = 1;" },
      buildCtx(repo),
    );
    assert.equal(result.isError, true);
    assert.match(result.content, /not found/);
    const unchanged = await readFile(path.join(repo, "a.ts"), "utf-8");
    assert.equal(unchanged, "const x = 1;\n");
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("edit_file fails when oldStr is ambiguous (appears multiple times)", async () => {
  const repo = await makeTempRepo();
  try {
    await writeFile(path.join(repo, "a.ts"), "foo();\nfoo();\n");
    const result = await editFileTool.execute(
      { path: "a.ts", oldStr: "foo();", newStr: "bar();" },
      buildCtx(repo),
    );
    assert.equal(result.isError, true);
    assert.match(result.content, /appears 2 times/);
    const unchanged = await readFile(path.join(repo, "a.ts"), "utf-8");
    assert.equal(unchanged, "foo();\nfoo();\n");
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("edit_file can delete text when newStr is omitted", async () => {
  const repo = await makeTempRepo();
  try {
    await writeFile(path.join(repo, "a.ts"), "keep this\nremove this\nkeep this too\n");
    const result = await editFileTool.execute(
      { path: "a.ts", oldStr: "remove this\n" },
      buildCtx(repo),
    );
    assert.equal(result.isError, undefined);
    const updated = await readFile(path.join(repo, "a.ts"), "utf-8");
    assert.equal(updated, "keep this\nkeep this too\n");
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("edit_file is refused in plan mode and does not touch disk", async () => {
  const repo = await makeTempRepo();
  try {
    await writeFile(path.join(repo, "a.ts"), "const x = 1;\n");
    const result = await editFileTool.execute(
      { path: "a.ts", oldStr: "const x = 1;", newStr: "const x = 2;" },
      buildCtx(repo, "plan"),
    );
    assert.equal(result.isError, true);
    assert.match(result.content, /Plan Mode/);
    const unchanged = await readFile(path.join(repo, "a.ts"), "utf-8");
    assert.equal(unchanged, "const x = 1;\n");
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("edit_file errors cleanly on missing file", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await editFileTool.execute(
      { path: "missing.ts", oldStr: "x", newStr: "y" },
      buildCtx(repo),
    );
    assert.equal(result.isError, true);
    assert.match(result.content, /not found/);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("edit_file refuses to escape the repo root", async () => {
  const repo = await makeTempRepo();
  try {
    const result = await editFileTool.execute(
      { path: "../outside.ts", oldStr: "x", newStr: "y" },
      buildCtx(repo),
    );
    assert.equal(result.isError, true);
    assert.match(result.content, /outside the repository root/);
  } finally {
    await cleanupTempRepo(repo);
  }
});
