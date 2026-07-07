import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { AnthropicProvider } from "../anthropic-provider.js";
import { ProviderError } from "../provider.js";
import { userText } from "../../types/message.js";
import type { ToolDefinition } from "../../types/tool.js";

function mockClient(createImpl: (params: any) => Promise<any>) {
  return {
    messages: {
      create: createImpl,
      stream: () => {
        throw new Error("stream() should not be called in non-streaming tests");
      },
    },
  } as any;
}

test("isConfigured is false with no api key and no client", () => {
  const provider = new AnthropicProvider({ apiKey: undefined });
  assert.equal(provider.isConfigured(), false);
});

test("isConfigured is true when a client is injected", () => {
  const provider = new AnthropicProvider({ client: mockClient(async () => ({})) });
  assert.equal(provider.isConfigured(), true);
});

test("complete() throws ProviderError when not configured", async () => {
  const provider = new AnthropicProvider({ apiKey: undefined });
  await assert.rejects(
    () => provider.complete({ model: "claude-sonnet-4-6", messages: [userText("hi")] }),
    (err: unknown) => {
      assert.ok(err instanceof ProviderError);
      assert.equal(err.providerId, "anthropic");
      return true;
    },
  );
});

test("complete() translates a plain text response correctly", async () => {
  const client = mockClient(async (params) => {
    assert.equal(params.model, "claude-sonnet-4-6");
    assert.equal(params.messages[0].role, "user");
    return {
      content: [{ type: "text", text: "Hello there" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  });

  const provider = new AnthropicProvider({ client });
  const result = await provider.complete({
    model: "claude-sonnet-4-6",
    messages: [userText("hi")],
  });

  assert.equal(result.stopReason, "end_turn");
  assert.equal(result.message.role, "assistant");
  assert.equal(result.message.content[0]?.type, "text");
  assert.equal((result.message.content[0] as any).text, "Hello there");
  assert.equal(result.usage.inputTokens, 10);
  assert.equal(result.usage.outputTokens, 5);
});

test("complete() translates tool_use responses and maps stop_reason", async () => {
  const client = mockClient(async () => ({
    content: [
      { type: "text", text: "Let me check that file." },
      { type: "tool_use", id: "toolu_123", name: "read_file", input: { path: "src/index.ts" } },
    ],
    stop_reason: "tool_use",
    usage: { input_tokens: 20, output_tokens: 8 },
  }));

  const provider = new AnthropicProvider({ client });
  const result = await provider.complete({
    model: "claude-sonnet-4-6",
    messages: [userText("read the index file")],
  });

  assert.equal(result.stopReason, "tool_use");
  assert.equal(result.message.content.length, 2);
  const toolUse = result.message.content[1] as any;
  assert.equal(toolUse.type, "tool_use");
  assert.equal(toolUse.id, "toolu_123");
  assert.equal(toolUse.name, "read_file");
  assert.deepEqual(toolUse.input, { path: "src/index.ts" });
});

test("complete() correctly serializes ToolDefinition schemas to input_schema", async () => {
  const readFileTool: ToolDefinition<{ path: string; maxLines?: number }> = {
    name: "read_file",
    description: "Read a file from the repository",
    mutates: false,
    schema: z.object({
      path: z.string(),
      maxLines: z.number().optional(),
    }),
    execute: async () => ({ content: "" }),
  };

  let capturedTools: any;
  const client = mockClient(async (params) => {
    capturedTools = params.tools;
    return {
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    };
  });

  const provider = new AnthropicProvider({ client });
  await provider.complete({
    model: "claude-sonnet-4-6",
    messages: [userText("hi")],
    tools: [readFileTool],
  });

  assert.equal(capturedTools.length, 1);
  assert.equal(capturedTools[0].name, "read_file");
  assert.deepEqual(capturedTools[0].input_schema.required, ["path"]);
  assert.deepEqual(capturedTools[0].input_schema.properties.path, { type: "string" });
});

test("complete() wraps thrown errors in ProviderError with retryable flag for 5xx", async () => {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const apiError = new Anthropic.APIError(503, { error: { message: "overloaded" } }, "overloaded", new Headers());

  const client = mockClient(async () => {
    throw apiError;
  });

  const provider = new AnthropicProvider({ client });
  await assert.rejects(
    () => provider.complete({ model: "claude-sonnet-4-6", messages: [userText("hi")] }),
    (err: unknown) => {
      assert.ok(err instanceof ProviderError);
      assert.equal(err.retryable, true);
      return true;
    },
  );
});

test("complete() round-trips a tool_result message back to the API", async () => {
  let capturedMessages: any;
  const client = mockClient(async (params) => {
    capturedMessages = params.messages;
    return {
      content: [{ type: "text", text: "Got it" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    };
  });

  const provider = new AnthropicProvider({ client });
  await provider.complete({
    model: "claude-sonnet-4-6",
    messages: [
      userText("read the file"),
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "a.ts" } }],
      },
      {
        role: "tool",
        content: [{ type: "tool_result", toolUseId: "toolu_1", content: "file contents here" }],
      },
    ],
  });

  // tool role messages map to "user" per Anthropic's API shape
  assert.equal(capturedMessages[2].role, "user");
  assert.equal(capturedMessages[2].content[0].type, "tool_result");
  assert.equal(capturedMessages[2].content[0].tool_use_id, "toolu_1");
});
