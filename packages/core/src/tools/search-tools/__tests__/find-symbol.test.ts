import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { findSymbolTool } from "../find-symbol.js";
import type { ToolExecutionContext } from "../../../types/tool.js";

// Use packages/core/src as our test corpus - we know exactly what's in it
const CORE_SRC = path.resolve(import.meta.dirname, "../../..");

function ctx(cwd = CORE_SRC): ToolExecutionContext {
  return { cwd, mode: "plan" };
}

test("find_symbol finds a class by name", async () => {
  const result = await findSymbolTool.execute({ name: "ToolRegistry" }, ctx());
  assert.match(result.content, /ToolRegistry/);
  assert.match(result.content, /\[class\]/);
});

test("find_symbol finds a function by name", async () => {
  const result = await findSymbolTool.execute({ name: "runAgentLoop" }, ctx());
  assert.match(result.content, /runAgentLoop/);
  assert.match(result.content, /\[function\]/);
});

test("find_symbol finds an interface by name", async () => {
  const result = await findSymbolTool.execute({ name: "CompleteOptions" }, ctx());
  assert.match(result.content, /CompleteOptions/);
  assert.match(result.content, /\[interface\]/);
});

test("find_symbol filters by kind - only classes", async () => {
  const result = await findSymbolTool.execute({ name: "Provider", kind: "class" }, ctx());
  // Should only return class declarations, not interface
  const lines = result.content.split("\n").filter((l) => l.includes("["));
  assert.ok(lines.every((l) => l.includes("[class]")));
});

test("find_symbol returns no-match message for unknown symbol", async () => {
  const result = await findSymbolTool.execute({ name: "XyzDoesNotExist_abc123" }, ctx());
  assert.match(result.content, /No symbols matching/);
});

test("find_symbol includes file path and line number", async () => {
  const result = await findSymbolTool.execute({ name: "ProviderRegistry" }, ctx());
  assert.match(result.content, /\.ts:\d+/);
});

test("find_symbol respects maxResults limit", async () => {
  // Search for something common like 'export' - should hit limit quickly
  const result = await findSymbolTool.execute({ name: "Tool", maxResults: 3 }, ctx());
  const matchLines = result.content.split("\n").filter((l) => l.match(/\[/));
  assert.ok(matchLines.length <= 3);
});

test("find_symbol is case-insensitive on the name", async () => {
  const lower = await findSymbolTool.execute({ name: "toolregistry" }, ctx());
  const upper = await findSymbolTool.execute({ name: "TOOLREGISTRY" }, ctx());
  assert.ok(lower.content.includes("ToolRegistry"));
  assert.ok(upper.content.includes("ToolRegistry"));
});

test("find_symbol works in plan mode (non-mutating)", async () => {
  const result = await findSymbolTool.execute({ name: "ModelInfo" }, { cwd: CORE_SRC, mode: "plan" });
  assert.equal(result.isError, undefined);
});

test("find_symbol refuses to escape the repo root", async () => {
  const result = await findSymbolTool.execute({ name: "x", path: "../../" }, ctx());
  assert.equal(result.isError, true);
  assert.match(result.content, /outside the repository root/);
});
