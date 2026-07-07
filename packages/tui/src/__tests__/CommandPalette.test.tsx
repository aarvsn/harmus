import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { CommandPalette } from "../components/CommandPalette.js";
import { StatusLine } from "../components/StatusLine.js";
import { renderForTest } from "./test-helpers.js";

const NOOP = () => {};

test("CommandPalette renders model selection header by default", (t) => {
  const { lastFrame } = renderForTest(
    t,
    <CommandPalette
      currentModel="claude-sonnet-4-6"
      currentProvider="anthropic"
      onSelectModel={NOOP}
      onSelectProvider={NOOP}
      onClose={NOOP}
    />,
  );
  assert.match(lastFrame()!, /Select Model/);
});

test("CommandPalette shows known models", (t) => {
  const { lastFrame } = renderForTest(
    t,
    <CommandPalette
      currentModel="claude-sonnet-4-6"
      currentProvider="anthropic"
      onSelectModel={NOOP}
      onSelectProvider={NOOP}
      onClose={NOOP}
    />,
  );
  assert.match(lastFrame()!, /claude-sonnet-4-6/);
});

test("CommandPalette marks the current model with a checkmark", (t) => {
  const { lastFrame } = renderForTest(
    t,
    <CommandPalette
      currentModel="claude-sonnet-4-6"
      currentProvider="anthropic"
      onSelectModel={NOOP}
      onSelectProvider={NOOP}
      onClose={NOOP}
    />,
  );
  const frame = lastFrame()!;
  const lines = frame.split("\n");
  const modelLine = lines.find((l) => l.includes("claude-sonnet-4-6"));
  assert.ok(modelLine, "should have a line for current model");
  assert.match(modelLine, /✓/);
});

test("CommandPalette shows instructions for Esc and Tab", (t) => {
  const { lastFrame } = renderForTest(
    t,
    <CommandPalette
      currentModel="claude-sonnet-4-6"
      currentProvider="anthropic"
      onSelectModel={NOOP}
      onSelectProvider={NOOP}
      onClose={NOOP}
    />,
  );
  assert.match(lastFrame()!, /Esc/);
  assert.match(lastFrame()!, /Tab/);
});

test("StatusLine shows provider/model format with BUILD label", (t) => {
  const { lastFrame } = renderForTest(
    t,
    <StatusLine mode="build" model="claude-sonnet-4-6" providerId="anthropic" isRunning={false} />,
  );
  const frame = lastFrame()!;
  assert.match(frame, /anthropic/);
  assert.match(frame, /claude-sonnet-4-6/);
  assert.match(frame, /BUILD/);
});

test("StatusLine shows PLAN label in plan mode", (t) => {
  const { lastFrame } = renderForTest(
    t,
    <StatusLine mode="plan" model="claude-opus-4-7" providerId="anthropic" isRunning={false} />,
  );
  assert.match(lastFrame()!, /PLAN/);
});
