import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { runAgentLoop } from "../agent-loop.js";
import { ToolRegistry } from "../tool-registry.js";
import { userText } from "../../types/message.js";
import type { Provider, CompleteOptions, CompleteResult } from "../../providers/provider.js";
import type { ToolDefinition } from "../../types/tool.js";
import type { Message } from "../../types/message.js";

/** A fake Provider that returns a scripted sequence of responses, one per call. */
class ScriptedProvider implements Provider {
  readonly id = "fake";
  readonly name = "Fake";
  private callIndex = 0;
  public receivedCalls: CompleteOptions[] = [];

  constructor(private readonly script: CompleteResult[]) {}

  isConfigured(): boolean {
    return true;
  }
  async listModels() {
    return [];
  }
  async complete(options: CompleteOptions): Promise<CompleteResult> {
    this.receivedCalls.push(options);
    const next = this.script[this.callIndex];
    this.callIndex++;
    if (!next) throw new Error("ScriptedProvider ran out of scripted responses");
    return next;
  }
}

function textResult(text: string, usage = { inputTokens: 1, outputTokens: 1 }): CompleteResult {
  return {
    message: { role: "assistant", content: [{ type: "text", text }] },
    stopReason: "end_turn",
    usage,
  };
}

function toolUseResult(toolName: string, input: Record<string, unknown>, id = "toolu_1"): CompleteResult {
  return {
    message: { role: "assistant", content: [{ type: "tool_use", id, name: toolName, input }] },
    stopReason: "tool_use",
    usage: { inputTokens: 5, outputTokens: 5 },
  };
}

const echoTool: ToolDefinition<{ text: string }> = {
  name: "echo",
  description: "Echoes input",
  mutates: false,
  schema: z.object({ text: z.string() }),
  async execute(input) {
    return { content: `echoed: ${input.text}` };
  },
};

const writeTool: ToolDefinition<{ path: string }> = {
  name: "write_thing",
  description: "Pretends to write a file",
  mutates: true,
  schema: z.object({ path: z.string() }),
  async execute(input) {
    return { content: `wrote ${input.path}` };
  },
};

test("agent loop stops immediately on a plain end_turn response", async () => {
  const provider = new ScriptedProvider([textResult("Hello, done.")]);
  const history: Message[] = [userText("hi")];

  const result = await runAgentLoop(history, {
    provider,
    model: "fake-model",
    cwd: "/tmp",
    mode: "build",
  });

  assert.equal(result.stopReason, "end_turn");
  assert.equal(result.iterations, 1);
  assert.equal(result.messages.length, 1);
  assert.equal(provider.receivedCalls.length, 1);
});

test("agent loop executes a tool call and feeds the result back for a second turn", async () => {
  const provider = new ScriptedProvider([
    toolUseResult("echo", { text: "ping" }),
    textResult("Got the echo back."),
  ]);
  const registry = new ToolRegistry([echoTool]);
  const history: Message[] = [userText("echo ping")];

  const result = await runAgentLoop(history, {
    provider,
    model: "fake-model",
    cwd: "/tmp",
    mode: "build",
    tools: registry,
  });

  assert.equal(result.stopReason, "end_turn");
  assert.equal(result.iterations, 2);
  assert.equal(provider.receivedCalls.length, 2);

  // The second call to the provider should include the tool_result message
  const secondCallMessages = provider.receivedCalls[1]!.messages;
  const toolResultMsg = secondCallMessages.find((m) => m.role === "tool");
  assert.ok(toolResultMsg);
  assert.equal((toolResultMsg!.content[0] as any).content, "echoed: ping");
});

test("agent loop accumulates token usage across iterations", async () => {
  const provider = new ScriptedProvider([toolUseResult("echo", { text: "x" }), textResult("done")]);
  const registry = new ToolRegistry([echoTool]);
  const history: Message[] = [userText("go")];

  const result = await runAgentLoop(history, {
    provider,
    model: "fake-model",
    cwd: "/tmp",
    mode: "build",
    tools: registry,
  });

  // toolUseResult uses {5,5}, textResult uses default {1,1}
  assert.equal(result.totalUsage.inputTokens, 6);
  assert.equal(result.totalUsage.outputTokens, 6);
});

test("agent loop respects maxIterations and stops with max_iterations", async () => {
  // Script returns a tool_use every time, so it would loop forever without the cap.
  const infiniteScript = Array.from({ length: 10 }, () => toolUseResult("echo", { text: "x" }));
  const provider = new ScriptedProvider(infiniteScript);
  const registry = new ToolRegistry([echoTool]);
  const history: Message[] = [userText("go")];

  const result = await runAgentLoop(history, {
    provider,
    model: "fake-model",
    cwd: "/tmp",
    mode: "build",
    tools: registry,
    maxIterations: 3,
  });

  assert.equal(result.stopReason, "max_iterations");
  assert.equal(result.iterations, 3);
  assert.equal(provider.receivedCalls.length, 3);
});

test("agent loop in plan mode excludes mutating tools from the provider call", async () => {
  const provider = new ScriptedProvider([textResult("ok")]);
  const registry = new ToolRegistry([echoTool, writeTool]);
  const history: Message[] = [userText("plan something")];

  await runAgentLoop(history, {
    provider,
    model: "fake-model",
    cwd: "/tmp",
    mode: "plan",
    tools: registry,
  });

  const sentTools = provider.receivedCalls[0]!.tools ?? [];
  assert.equal(sentTools.length, 1);
  assert.equal(sentTools[0]?.name, "echo");
});

test("agent loop in build mode includes all tools in the provider call", async () => {
  const provider = new ScriptedProvider([textResult("ok")]);
  const registry = new ToolRegistry([echoTool, writeTool]);
  const history: Message[] = [userText("build something")];

  await runAgentLoop(history, {
    provider,
    model: "fake-model",
    cwd: "/tmp",
    mode: "build",
    tools: registry,
  });

  const sentTools = provider.receivedCalls[0]!.tools ?? [];
  assert.equal(sentTools.length, 2);
});

test("agent loop stops on max_tokens without attempting tool execution", async () => {
  const provider = new ScriptedProvider([
    {
      message: { role: "assistant", content: [{ type: "text", text: "incomplete..." }] },
      stopReason: "max_tokens",
      usage: { inputTokens: 1, outputTokens: 1 },
    },
  ]);
  const history: Message[] = [userText("go")];

  const result = await runAgentLoop(history, {
    provider,
    model: "fake-model",
    cwd: "/tmp",
    mode: "build",
  });

  assert.equal(result.stopReason, "max_tokens");
  assert.equal(provider.receivedCalls.length, 1);
});

test("agent loop fires onToolStart and onToolEnd callbacks", async () => {
  const provider = new ScriptedProvider([
    toolUseResult("echo", { text: "callback-test" }),
    textResult("done"),
  ]);
  const registry = new ToolRegistry([echoTool]);
  const history: Message[] = [userText("go")];

  const starts: string[] = [];
  const ends: Array<{ name: string; content: string; isError: boolean }> = [];

  await runAgentLoop(history, {
    provider,
    model: "fake-model",
    cwd: "/tmp",
    mode: "build",
    tools: registry,
    onToolStart: (block) => starts.push(block.name),
    onToolEnd: (block, content, isError) => ends.push({ name: block.name, content, isError }),
  });

  assert.deepEqual(starts, ["echo"]);
  assert.equal(ends.length, 1);
  assert.equal(ends[0]?.content, "echoed: callback-test");
  assert.equal(ends[0]?.isError, false);
});

test("agent loop handles multiple tool calls within a single turn", async () => {
  const provider = new ScriptedProvider([
    {
      message: {
        role: "assistant",
        content: [
          { type: "tool_use", id: "t1", name: "echo", input: { text: "a" } },
          { type: "tool_use", id: "t2", name: "echo", input: { text: "b" } },
        ],
      },
      stopReason: "tool_use",
      usage: { inputTokens: 1, outputTokens: 1 },
    },
    textResult("both done"),
  ]);
  const registry = new ToolRegistry([echoTool]);
  const history: Message[] = [userText("do both")];

  const result = await runAgentLoop(history, {
    provider,
    model: "fake-model",
    cwd: "/tmp",
    mode: "build",
    tools: registry,
  });

  assert.equal(result.iterations, 2);
  const toolResultsMsg = result.messages.find((m) => m.role === "tool");
  assert.equal(toolResultsMsg?.content.length, 2);
});

test("conversationHistory array is mutated in place so callers can persist it", async () => {
  const provider = new ScriptedProvider([textResult("ok")]);
  const history: Message[] = [userText("hi")];
  const originalLength = history.length;

  await runAgentLoop(history, { provider, model: "fake-model", cwd: "/tmp", mode: "build" });

  assert.ok(history.length > originalLength);
});
