import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { StatusLine } from "../components/StatusLine.js";
import { renderForTest } from "./test-helpers.js";

test("StatusLine shows PLAN label in plan mode", (t) => {
  const { lastFrame } = renderForTest(t, (
    <StatusLine mode="plan" model="claude-sonnet-4-6" providerId="anthropic" isRunning={false} />
  ));
  assert.match(lastFrame()!, /PLAN/);
});

test("StatusLine shows BUILD label in build mode", (t) => {
  const { lastFrame } = renderForTest(t, (
    <StatusLine mode="build" model="claude-sonnet-4-6" providerId="anthropic" isRunning={false} />
  ));
  assert.match(lastFrame()!, /BUILD/);
});

test("StatusLine shows model name", (t) => {
  const { lastFrame } = renderForTest(t, (
    <StatusLine mode="build" model="claude-opus-4-7" providerId="anthropic" isRunning={false} />
  ));
  assert.match(lastFrame()!, /claude-opus-4-7/);
});

test("StatusLine shows working indicator when running", (t) => {
  const { lastFrame } = renderForTest(t, (
    <StatusLine mode="build" model="claude-sonnet-4-6" providerId="anthropic" isRunning={true} />
  ));
  assert.match(lastFrame()!, /working/);
});

test("StatusLine hides working indicator when not running", (t) => {
  const { lastFrame } = renderForTest(t, (
    <StatusLine mode="build" model="claude-sonnet-4-6" providerId="anthropic" isRunning={false} />
  ));
  assert.doesNotMatch(lastFrame()!, /working/);
});
