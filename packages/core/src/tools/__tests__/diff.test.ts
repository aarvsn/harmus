import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDiff, formatDiff } from "../diff.js";

test("computeDiff returns isEmpty=true for identical content", () => {
  const diff = computeDiff("a.ts", "const x = 1;\n", "const x = 1;\n");
  assert.equal(diff.isEmpty, true);
  assert.equal(diff.additions, 0);
  assert.equal(diff.deletions, 0);
});

test("computeDiff detects a single line change", () => {
  const before = "const x = 1;\n";
  const after = "const x = 2;\n";
  const diff = computeDiff("a.ts", before, after);
  assert.equal(diff.isEmpty, false);
  assert.equal(diff.additions, 1);
  assert.equal(diff.deletions, 1);
  const types = diff.lines.map((l) => l.type);
  assert.ok(types.includes("added"));
  assert.ok(types.includes("removed"));
});

test("computeDiff detects an added line", () => {
  const before = "line1\nline2\n";
  const after = "line1\nnew line\nline2\n";
  const diff = computeDiff("a.ts", before, after);
  assert.equal(diff.additions, 1);
  assert.equal(diff.deletions, 0);
  assert.ok(diff.lines.some((l) => l.type === "added" && l.content === "new line"));
});

test("computeDiff detects a removed line", () => {
  const before = "line1\nremove me\nline2\n";
  const after = "line1\nline2\n";
  const diff = computeDiff("a.ts", before, after);
  assert.equal(diff.additions, 0);
  assert.equal(diff.deletions, 1);
  assert.ok(diff.lines.some((l) => l.type === "removed" && l.content === "remove me"));
});

test("computeDiff preserves context lines around changes", () => {
  const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
  const after = [...lines];
  after[10] = "CHANGED";
  const diff = computeDiff("a.ts", lines.join("\n"), after.join("\n"));
  const contextLines = diff.lines.filter((l) => l.type === "context");
  assert.ok(contextLines.length >= 3); // at least 3 lines of context on each side
});

test("formatDiff produces unified diff format with --- and +++ headers", () => {
  const diff = computeDiff("foo.ts", "old\n", "new\n");
  const text = formatDiff(diff);
  assert.match(text, /^--- foo\.ts/m);
  assert.match(text, /^\+\+\+ foo\.ts/m);
  assert.match(text, /^@@/m);
  assert.match(text, /^\+new/m);
  assert.match(text, /^-old/m);
});

test("formatDiff returns '(no changes)' for an empty diff", () => {
  const diff = computeDiff("a.ts", "same\n", "same\n");
  assert.equal(formatDiff(diff), "(no changes)");
});

test("computeDiff handles empty before (pure addition)", () => {
  const diff = computeDiff("new.ts", "", "hello\nworld\n");
  assert.equal(diff.deletions, 0);
  assert.ok(diff.additions >= 2);
});

test("computeDiff handles empty after (pure deletion)", () => {
  const diff = computeDiff("del.ts", "gone\nbye\n", "");
  assert.ok(diff.deletions >= 2);
  assert.equal(diff.additions, 0);
});

test("computeDiff diff path shows the provided filename", () => {
  const diff = computeDiff("src/auth/login.ts", "a\n", "b\n");
  assert.equal(diff.path, "src/auth/login.ts");
  const text = formatDiff(diff);
  assert.match(text, /src\/auth\/login\.ts/);
});
