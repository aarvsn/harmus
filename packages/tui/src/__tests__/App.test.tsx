import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderForTest } from "./test-helpers.js";
import { App } from "../components/App.js";
import type { Provider, CompleteOptions, CompleteResult, ModelInfo } from "@harmus/core";

/** Small helper: wait for async agent loop and React re-renders to settle. */
const settle = (ms = 600) => new Promise((r) => setTimeout(r, ms));

/** Scripted provider returning a fixed sequence of responses. */
class ScriptedProvider implements Provider {
  readonly id = "fake";
  readonly name = "Fake";
  private idx = 0;
  constructor(private readonly responses: CompleteResult[]) {}
  isConfigured() {
    return true;
  }
  async listModels(): Promise<ModelInfo[]> {
    return [];
  }
  async complete(_opts: CompleteOptions): Promise<CompleteResult> {
    const r = this.responses[this.idx++];
    if (!r) throw new Error("ScriptedProvider ran out of responses");
    return r;
  }
}

function textResult(text: string): CompleteResult {
  return {
    message: { role: "assistant", content: [{ type: "text", text }] },
    stopReason: "end_turn",
    usage: { inputTokens: 1, outputTokens: 1 },
  };
}

function toolUseResult(name: string, input: Record<string, unknown>, id = "toolu_1"): CompleteResult {
  return {
    message: { role: "assistant", content: [{ type: "tool_use", id, name, input }] },
    stopReason: "tool_use",
    usage: { inputTokens: 2, outputTokens: 2 },
  };
}

const FAKE_CWD = "/tmp";

// --- Static rendering tests (no stdin interaction needed) ---

test("App renders the Harmus header on startup", (t) => {
  const { lastFrame } = renderForTest(
    t,
    <App provider={new ScriptedProvider([])} model="fake-model" cwd={FAKE_CWD} />,
  );
  assert.match(lastFrame()!, /Harmus/);
});

test("App shows BUILD mode label by default", (t) => {
  const { lastFrame } = renderForTest(
    t,
    <App provider={new ScriptedProvider([])} model="fake-model" cwd={FAKE_CWD} />,
  );
  assert.match(lastFrame()!, /BUILD/);
});

test("App shows PLAN mode label when initialMode is plan", (t) => {
  const { lastFrame } = renderForTest(
    t,
    <App provider={new ScriptedProvider([])} model="fake-model" cwd={FAKE_CWD} initialMode="plan" />,
  );
  assert.match(lastFrame()!, /PLAN/);
});

test("App displays the model name in the status line", (t) => {
  const { lastFrame } = renderForTest(
    t,
    <App provider={new ScriptedProvider([])} model="claude-sonnet-4-6" cwd={FAKE_CWD} />,
  );
  assert.match(lastFrame()!, /claude-sonnet-4-6/);
});

test("App shows keyboard shortcut hint", (t) => {
  const { lastFrame } = renderForTest(
    t,
    <App provider={new ScriptedProvider([])} model="fake-model" cwd={FAKE_CWD} />,
  );
  assert.match(lastFrame()!, /Ctrl\+C/);
});

// --- Async stdin interaction tests ---

test("App renders user message and assistant reply after a submitted turn", async (t) => {
  const provider = new ScriptedProvider([textResult("I will help you with that.")]);
  const { lastFrame, stdin } = renderForTest(
    t,
    <App provider={provider} model="fake-model" cwd={FAKE_CWD} />,
  );

  await settle(100);
  stdin.write("list the files");
  await settle(50);
  stdin.write("\r");
  await settle(600);

  const frame = lastFrame()!;
  assert.match(frame, /list the files/);
  assert.match(frame, /I will help you with that\./);
});

test("App renders tool calls inline during a multi-turn response", async (t) => {
  const provider = new ScriptedProvider([
    toolUseResult("list_directory", { path: "." }, "toolu_1"),
    textResult("The project has a src/ directory."),
  ]);
  const { lastFrame, stdin } = renderForTest(
    t,
    <App provider={provider} model="fake-model" cwd={FAKE_CWD} />,
  );

  await settle(100);
  stdin.write("what files are there");
  await settle(50);
  stdin.write("\r");
  await settle(800);

  const frame = lastFrame()!;
  assert.match(frame, /what files are there/);
  assert.match(frame, /list_directory/);
  assert.match(frame, /The project has a src\/ directory\./);
});

test("App shows error message when provider throws", async (t) => {
  class FailingProvider implements Provider {
    readonly id = "fail";
    readonly name = "Fail";
    isConfigured() {
      return true;
    }
    async listModels(): Promise<ModelInfo[]> {
      return [];
    }
    async complete(): Promise<CompleteResult> {
      throw new Error("API unavailable");
    }
  }
  const { lastFrame, stdin } = renderForTest(
    t,
    <App provider={new FailingProvider()} model="fake-model" cwd={FAKE_CWD} />,
  );

  await settle(100);
  stdin.write("do something");
  await settle(50);
  stdin.write("\r");
  await settle(600);

  assert.match(lastFrame()!, /API unavailable/);
});

test("App clears the input box after submit", async (t) => {
  const provider = new ScriptedProvider([textResult("Done.")]);
  const { lastFrame, stdin } = renderForTest(
    t,
    <App provider={provider} model="fake-model" cwd={FAKE_CWD} />,
  );

  await settle(100);
  stdin.write("do something");
  await settle(50);
  stdin.write("\r");
  await settle(600);

  const frame = lastFrame()!;
  // The text should appear in the log (above), but the input box itself should be blank.
  const lines = frame.split("\n");
  const inputAreaLines = lines.slice(-4).join("\n");
  assert.doesNotMatch(inputAreaLines, /do something/);
});

test("App preserves conversation history across multiple turns", async (t) => {
  const provider = new ScriptedProvider([textResult("First answer."), textResult("Second answer.")]);
  const { lastFrame, stdin } = renderForTest(
    t,
    <App provider={provider} model="fake-model" cwd={FAKE_CWD} />,
  );

  await settle(100);
  stdin.write("first question");
  await settle(50);
  stdin.write("\r");
  await settle(700);

  stdin.write("second question");
  await settle(50);
  stdin.write("\r");
  await settle(700);

  const frame = lastFrame()!;
  assert.match(frame, /first question/);
  assert.match(frame, /First answer\./);
  assert.match(frame, /second question/);
  assert.match(frame, /Second answer\./);
});
