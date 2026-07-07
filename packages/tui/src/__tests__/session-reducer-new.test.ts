import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionReducer, createInitialState } from "../session-reducer.js";
import { _resetLogIdCounterForTests } from "../log-entry.js";

test.beforeEach(() => { _resetLogIdCounterForTests(); });

test("createInitialState accepts providerId as third arg", () => {
  const state = createInitialState("claude-sonnet-4-6", "build", "anthropic");
  assert.equal(state.providerId, "anthropic");
});

test("set_provider updates the providerId", () => {
  const state = createInitialState("m", "build", "anthropic");
  const next = sessionReducer(state, { type: "set_provider", providerId: "openai" });
  assert.equal(next.providerId, "openai");
});

test("clear_context appends a system info log entry", () => {
  let state = createInitialState("m");
  state = sessionReducer(state, { type: "submit_user_message", text: "hello" });
  state = sessionReducer(state, { type: "assistant_text", text: "hi" });
  state = sessionReducer(state, { type: "clear_context" });
  const last = state.log[state.log.length - 1];
  assert.equal(last?.type, "system");
  assert.match((last as any).text, /cleared/i);
});

test("clear_context does not remove existing log entries", () => {
  let state = createInitialState("m");
  state = sessionReducer(state, { type: "submit_user_message", text: "original" });
  state = sessionReducer(state, { type: "clear_context" });
  // The "original" user message is still in the log; only a system notice is appended
  assert.equal(state.log.length, 2);
  assert.equal(state.log[0]?.type, "user");
});
