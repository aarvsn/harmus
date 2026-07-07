import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ToolRegistry, executeToolUse } from "../tool-registry.js";
import type { ToolDefinition } from "../../types/tool.js";
import type { ToolUseBlock } from "../../types/message.js";

const echoTool: ToolDefinition<{ text: string }> = {
  name: "echo",
  description: "Echoes input back",
  mutates: false,
  schema: z.object({ text: z.string() }),
  async execute(input) {
    return { content: `echo: ${input.text}` };
  },
};

const deleteTool: ToolDefinition<{ path: string }> = {
  name: "delete_thing",
  description: "Pretends to delete something",
  mutates: true,
  schema: z.object({ path: z.string() }),
  async execute(input) {
    return { content: `deleted ${input.path}` };
  },
};

const throwingTool: ToolDefinition<{}> = {
  name: "throws",
  description: "Always throws",
  mutates: false,
  schema: z.object({}),
  async execute() {
    throw new Error("boom");
  },
};

function toolUse(name: string, input: Record<string, unknown>, id = "toolu_1"): ToolUseBlock {
  return { type: "tool_use", id, name, input };
}

test("ToolRegistry registers and retrieves tools by name", () => {
  const registry = new ToolRegistry([echoTool, deleteTool]);
  assert.equal(registry.get("echo"), echoTool);
  assert.equal(registry.get("nonexistent"), undefined);
  assert.equal(registry.list().length, 2);
});

test("ToolRegistry throws on duplicate registration", () => {
  const registry = new ToolRegistry([echoTool]);
  assert.throws(() => registry.register(echoTool), /already registered/);
});

test("ToolRegistry.listForMode excludes mutating tools in plan mode", () => {
  const registry = new ToolRegistry([echoTool, deleteTool]);
  const planTools = registry.listForMode("plan");
  assert.equal(planTools.length, 1);
  assert.equal(planTools[0]?.name, "echo");
});

test("ToolRegistry.listForMode includes all tools in build mode", () => {
  const registry = new ToolRegistry([echoTool, deleteTool]);
  const buildTools = registry.listForMode("build");
  assert.equal(buildTools.length, 2);
});

test("executeToolUse runs a registered tool and returns a tool_result", async () => {
  const registry = new ToolRegistry([echoTool]);
  const result = await executeToolUse(toolUse("echo", { text: "hi" }), registry, {
    cwd: "/tmp",
    mode: "build",
  });
  assert.equal(result.type, "tool_result");
  assert.equal(result.toolUseId, "toolu_1");
  assert.equal(result.content, "echo: hi");
  assert.equal(result.isError, undefined);
});

test("executeToolUse reports an error for an unknown tool name", async () => {
  const registry = new ToolRegistry([echoTool]);
  const result = await executeToolUse(toolUse("nonexistent", {}), registry, {
    cwd: "/tmp",
    mode: "build",
  });
  assert.equal(result.isError, true);
  assert.match(result.content, /no tool named/);
});

test("executeToolUse refuses a mutating tool in plan mode", async () => {
  const registry = new ToolRegistry([deleteTool]);
  const result = await executeToolUse(toolUse("delete_thing", { path: "x" }), registry, {
    cwd: "/tmp",
    mode: "plan",
  });
  assert.equal(result.isError, true);
  assert.match(result.content, /Plan Mode/);
});

test("executeToolUse allows a mutating tool in build mode", async () => {
  const registry = new ToolRegistry([deleteTool]);
  const result = await executeToolUse(toolUse("delete_thing", { path: "x" }), registry, {
    cwd: "/tmp",
    mode: "build",
  });
  assert.equal(result.isError, undefined);
  assert.equal(result.content, "deleted x");
});

test("executeToolUse reports a validation error for malformed input", async () => {
  const registry = new ToolRegistry([echoTool]);
  const result = await executeToolUse(toolUse("echo", { text: 123 }), registry, {
    cwd: "/tmp",
    mode: "build",
  });
  assert.equal(result.isError, true);
  assert.match(result.content, /invalid input/);
});

test("executeToolUse catches thrown errors from execute() and reports them as a result", async () => {
  const registry = new ToolRegistry([throwingTool]);
  const result = await executeToolUse(toolUse("throws", {}), registry, {
    cwd: "/tmp",
    mode: "build",
  });
  assert.equal(result.isError, true);
  assert.match(result.content, /boom/);
});

test("executeToolUse preserves the original tool_use id on the result", async () => {
  const registry = new ToolRegistry([echoTool]);
  const result = await executeToolUse(toolUse("echo", { text: "x" }, "toolu_custom_id"), registry, {
    cwd: "/tmp",
    mode: "build",
  });
  assert.equal(result.toolUseId, "toolu_custom_id");
});
