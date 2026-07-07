import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionReducer, createInitialState } from "../session-reducer.js";
import { _resetLogIdCounterForTests } from "../log-entry.js";

test.beforeEach(() => {
  _resetLogIdCounterForTests();
});

test("createInitialState sets defaults correctly", () => {
  const state = createInitialState("claude-sonnet-4-6");
  assert.equal(state.mode, "build");
  assert.equal(state.model, "claude-sonnet-4-6");
  assert.equal(state.isRunning, false);
  assert.deepEqual(state.log, []);
});

test("submit_user_message appends a user log entry", () => {
  const state = createInitialState("m");
  const next = sessionReducer(state, { type: "submit_user_message", text: "add auth" });
  assert.equal(next.log.length, 1);
  assert.equal(next.log[0]?.type, "user");
  assert.equal((next.log[0] as any).text, "add auth");
});

test("set_mode switches plan/build", () => {
  const state = createInitialState("m", "build");
  const next = sessionReducer(state, { type: "set_mode", mode: "plan" });
  assert.equal(next.mode, "plan");
});

test("agent_start and agent_end toggle isRunning", () => {
  let state = createInitialState("m");
  state = sessionReducer(state, { type: "agent_start" });
  assert.equal(state.isRunning, true);
  state = sessionReducer(state, { type: "agent_end" });
  assert.equal(state.isRunning, false);
});

test("assistant_text appends an assistant_text entry", () => {
  const state = createInitialState("m");
  const next = sessionReducer(state, { type: "assistant_text", text: "Here's the plan..." });
  assert.equal(next.log[0]?.type, "assistant_text");
  assert.equal((next.log[0] as any).text, "Here's the plan...");
});

test("tool_start adds a pending tool_call entry with no result", () => {
  const state = createInitialState("m");
  const next = sessionReducer(state, {
    type: "tool_start",
    toolCallId: "toolu_1",
    toolName: "read_file",
    input: { path: "a.ts" },
  });
  assert.equal(next.log[0]?.type, "tool_call");
  const entry = next.log[0] as any;
  assert.equal(entry.id, "toolu_1");
  assert.equal(entry.toolName, "read_file");
  assert.equal(entry.result, undefined);
});

test("tool_end fills in the result on the matching tool_call entry", () => {
  let state = createInitialState("m");
  state = sessionReducer(state, {
    type: "tool_start",
    toolCallId: "toolu_1",
    toolName: "read_file",
    input: { path: "a.ts" },
  });
  state = sessionReducer(state, {
    type: "tool_end",
    toolCallId: "toolu_1",
    content: "file contents",
    isError: false,
  });
  const entry = state.log[0] as any;
  assert.deepEqual(entry.result, { content: "file contents", isError: false });
});

test("tool_end only updates the matching tool call when multiple are pending", () => {
  let state = createInitialState("m");
  state = sessionReducer(state, { type: "tool_start", toolCallId: "t1", toolName: "a", input: {} });
  state = sessionReducer(state, { type: "tool_start", toolCallId: "t2", toolName: "b", input: {} });
  state = sessionReducer(state, { type: "tool_end", toolCallId: "t1", content: "done a", isError: false });

  const t1 = state.log.find((e: any) => e.id === "t1") as any;
  const t2 = state.log.find((e: any) => e.id === "t2") as any;
  assert.equal(t1.result.content, "done a");
  assert.equal(t2.result, undefined);
});

test("tool_end marks isError correctly", () => {
  let state = createInitialState("m");
  state = sessionReducer(state, { type: "tool_start", toolCallId: "t1", toolName: "a", input: {} });
  state = sessionReducer(state, { type: "tool_end", toolCallId: "t1", content: "boom", isError: true });
  const entry = state.log[0] as any;
  assert.equal(entry.result.isError, true);
});

test("system_message appends with default info level", () => {
  const state = createInitialState("m");
  const next = sessionReducer(state, { type: "system_message", text: "connected" });
  const entry = next.log[0] as any;
  assert.equal(entry.type, "system");
  assert.equal(entry.level, "info");
});

test("system_message respects explicit error level", () => {
  const state = createInitialState("m");
  const next = sessionReducer(state, { type: "system_message", text: "failed", level: "error" });
  const entry = next.log[0] as any;
  assert.equal(entry.level, "error");
});

test("log entries accumulate in order across a realistic multi-action sequence", () => {
  let state = createInitialState("m");
  state = sessionReducer(state, { type: "submit_user_message", text: "fix the bug" });
  state = sessionReducer(state, { type: "agent_start" });
  state = sessionReducer(state, { type: "tool_start", toolCallId: "t1", toolName: "grep_files", input: {} });
  state = sessionReducer(state, { type: "tool_end", toolCallId: "t1", content: "found it", isError: false });
  state = sessionReducer(state, { type: "assistant_text", text: "Fixed!" });
  state = sessionReducer(state, { type: "agent_end" });

  assert.equal(state.log.length, 3); // user, tool_call, assistant_text
  assert.deepEqual(
    state.log.map((e) => e.type),
    ["user", "tool_call", "assistant_text"],
  );
  assert.equal(state.isRunning, false);
});

test("reducer never mutates the input state object (returns new objects)", () => {
  const state = createInitialState("m");
  const frozen = Object.freeze(state);
  // If the reducer mutated `frozen` directly this would throw in strict mode under Object.freeze
  assert.doesNotThrow(() => sessionReducer(frozen, { type: "submit_user_message", text: "x" }));
});
