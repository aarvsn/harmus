import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { ToolCallLine } from "../components/ToolCallLine.js";
import type { ToolCallLogEntry } from "../log-entry.js";
import { renderForTest } from "./test-helpers.js";

test("ToolCallLine renders the tool name and args while pending", (t) => {
  const entry: ToolCallLogEntry = {
    type: "tool_call",
    id: "t1",
    toolName: "read_file",
    input: { path: "src/index.ts" },
  };
  const { lastFrame } = renderForTest(t, <ToolCallLine entry={entry} />);
  const frame = lastFrame();
  assert.match(frame!, /read_file/);
  assert.match(frame!, /path=src\/index\.ts/);
});

test("ToolCallLine renders result preview once completed", (t) => {
  const entry: ToolCallLogEntry = {
    type: "tool_call",
    id: "t1",
    toolName: "read_file",
    input: { path: "a.ts" },
    result: { content: "line one\nline two", isError: false },
  };
  const { lastFrame } = renderForTest(t, <ToolCallLine entry={entry} />);
  const frame = lastFrame();
  assert.match(frame!, /line one/);
  assert.match(frame!, /line two/);
});

test("ToolCallLine truncates long result output with a remaining-lines indicator", (t) => {
  const longContent = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");
  const entry: ToolCallLogEntry = {
    type: "tool_call",
    id: "t1",
    toolName: "grep_files",
    input: {},
    result: { content: longContent, isError: false },
  };
  const { lastFrame } = renderForTest(t, <ToolCallLine entry={entry} />);
  const frame = lastFrame();
  assert.match(frame!, /more lines/);
});

test("ToolCallLine truncates long argument values", (t) => {
  const entry: ToolCallLogEntry = {
    type: "tool_call",
    id: "t1",
    toolName: "write_file",
    input: { content: "x".repeat(200) },
  };
  const { lastFrame } = renderForTest(t, <ToolCallLine entry={entry} />);
  const frame = lastFrame();
  assert.match(frame!, /\.\.\./);
  assert.ok(frame!.length < 300);
});

test("ToolCallLine shows error result content", (t) => {
  const entry: ToolCallLogEntry = {
    type: "tool_call",
    id: "t1",
    toolName: "edit_file",
    input: { path: "a.ts" },
    result: { content: "Error: oldStr not found", isError: true },
  };
  const { lastFrame } = renderForTest(t, <ToolCallLine entry={entry} />);
  const frame = lastFrame();
  assert.match(frame!, /Error: oldStr not found/);
});

test("ToolCallLine with no input args renders without crashing", (t) => {
  const entry: ToolCallLogEntry = {
    type: "tool_call",
    id: "t1",
    toolName: "list_directory",
    input: {},
    result: { content: "src/\npackage.json", isError: false },
  };
  const { lastFrame } = renderForTest(t, <ToolCallLine entry={entry} />);
  const frame = lastFrame();
  assert.match(frame!, /list_directory/);
});
