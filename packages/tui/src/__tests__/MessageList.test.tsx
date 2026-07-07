import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { MessageList } from "../components/MessageList.js";
import { renderForTest } from "./test-helpers.js";
import type { LogEntry } from "../log-entry.js";

test("MessageList renders nothing for an empty log", (t) => {
  const { lastFrame } = renderForTest(t, <MessageList log={[]} />);
  assert.equal(lastFrame()!.trim(), "");
});

test("MessageList renders user and assistant entries in order", (t) => {
  const log: LogEntry[] = [
    { type: "user", id: "u1", text: "fix the bug" },
    { type: "assistant_text", id: "a1", text: "I found the issue." },
  ];
  const { lastFrame } = renderForTest(t, <MessageList log={log} />);
  const frame = lastFrame()!;
  const userIdx = frame.indexOf("fix the bug");
  const asstIdx = frame.indexOf("I found the issue.");
  assert.ok(userIdx < asstIdx, "user message should appear before assistant response");
});

test("MessageList renders tool calls inline between messages", (t) => {
  const log: LogEntry[] = [
    { type: "user", id: "u1", text: "search for TODO" },
    { type: "tool_call", id: "t1", toolName: "grep_files", input: { pattern: "TODO" }, result: { content: "found 3", isError: false } },
    { type: "assistant_text", id: "a1", text: "Found 3 TODOs." },
  ];
  const { lastFrame } = renderForTest(t, <MessageList log={log} />);
  const frame = lastFrame()!;
  assert.match(frame, /grep_files/);
  assert.match(frame, /found 3/);
  assert.match(frame, /Found 3 TODOs\./);
});

test("MessageList renders system messages", (t) => {
  const log: LogEntry[] = [
    { type: "system", id: "s1", text: "Session started", level: "info" },
  ];
  const { lastFrame } = renderForTest(t, <MessageList log={log} />);
  assert.match(lastFrame()!, /Session started/);
});
