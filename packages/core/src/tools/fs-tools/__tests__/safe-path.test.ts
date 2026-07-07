import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveSafePath, PathSecurityError } from "../safe-path.js";

const ROOT = "/home/claude/some-repo";

test("resolves a simple relative path under root", () => {
  const result = resolveSafePath(ROOT, "src/index.ts");
  assert.equal(result, path.join(ROOT, "src/index.ts"));
});

test("resolves nested relative paths with ./ correctly", () => {
  const result = resolveSafePath(ROOT, "./src/./index.ts");
  assert.equal(result, path.join(ROOT, "src/index.ts"));
});

test("rejects simple ../ traversal escaping the root", () => {
  assert.throws(() => resolveSafePath(ROOT, "../etc/passwd"), PathSecurityError);
});

test("rejects deep traversal that eventually escapes root", () => {
  assert.throws(() => resolveSafePath(ROOT, "src/../../etc/passwd"), PathSecurityError);
});

test("allows traversal that stays within root", () => {
  const result = resolveSafePath(ROOT, "src/../lib/index.ts");
  assert.equal(result, path.join(ROOT, "lib/index.ts"));
});

test("rejects absolute paths outside the root", () => {
  assert.throws(() => resolveSafePath(ROOT, "/etc/passwd"), PathSecurityError);
});

test("allows absolute paths that are inside the root", () => {
  const result = resolveSafePath(ROOT, path.join(ROOT, "src/index.ts"));
  assert.equal(result, path.join(ROOT, "src/index.ts"));
});

test("allows the root itself", () => {
  const result = resolveSafePath(ROOT, ".");
  assert.equal(result, ROOT);
});
