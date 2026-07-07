import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { LogEntryView } from "../components/LogEntryView.js";
import { renderForTest } from "./test-helpers.js";

test("LogEntryView renders a user message with > prefix", (t) => {
  const { lastFrame } = renderForTest(t, (
    <LogEntryView entry={{ type: "user", id: "u1", text: "add OAuth login" }} />
  ));
  assert.match(lastFrame()!, />.*add OAuth login/);
});

test("LogEntryView renders assistant text", (t) => {
  const { lastFrame } = renderForTest(t, (
    <LogEntryView entry={{ type: "assistant_text", id: "a1", text: "Here is the plan." }} />
  ));
  assert.match(lastFrame()!, /Here is the plan\./);
});

test("LogEntryView renders a system info message", (t) => {
  const { lastFrame } = renderForTest(t, (
    <LogEntryView entry={{ type: "system", id: "s1", text: "Connected to repo", level: "info" }} />
  ));
  assert.match(lastFrame()!, /Connected to repo/);
});

test("LogEntryView renders a system error message", (t) => {
  const { lastFrame } = renderForTest(t, (
    <LogEntryView entry={{ type: "system", id: "s2", text: "API key missing", level: "error" }} />
  ));
  assert.match(lastFrame()!, /API key missing/);
});

test("LogEntryView renders a pending tool call", (t) => {
  const { lastFrame } = renderForTest(t, (
    <LogEntryView
      entry={{ type: "tool_call", id: "t1", toolName: "grep_files", input: { pattern: "TODO" } }}
    />
  ));
  assert.match(lastFrame()!, /grep_files/);
  assert.match(lastFrame()!, /TODO/);
});
