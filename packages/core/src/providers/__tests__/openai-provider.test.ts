import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { OpenAIProvider } from "../openai-provider.js";
import { ProviderError } from "../provider.js";
import { userText } from "../../types/message.js";
import type { ToolDefinition } from "../../types/tool.js";
import type { Message } from "../../types/message.js";

function mockClient(createImpl: (params: any) => Promise<any>) {
  return {
    chat: {
      completions: {
        create: createImpl,
        stream: () => {
          throw new Error("stream() should not be called in non-streaming tests");
        },
      },
    },
  } as any;
}

test("isConfigured is false with no api key and no client", () => {
  const provider = new OpenAIProvider({ apiKey: undefined });
  assert.equal(provider.isConfigured(), false);
});

test("isConfigured is true when a client is injected", () => {
  const provider = new OpenAIProvider({ client: mockClient(async () => ({})) });
  assert.equal(provider.isConfigured(), true);
});

test("complete() throws ProviderError when not configured", async () => {
  const provider = new OpenAIProvider({ apiKey: undefined });
  await assert.rejects(
    () => provider.complete({ model: "gpt-5-mini", messages: [userText("hi")] }),
    (err: unknown) => {
      assert.ok(err instanceof ProviderError);
      assert.equal(err.providerId, "openai");
      return true;
    },
  );
});

test("complete() prepends system prompt as a regular message", async () => {
  let capturedMessages: any;
  const client = mockClient(async (params) => {
    capturedMessages = params.messages;
    return {
      choices: [
        { message: { role: "assistant", content: "hi", tool_calls: undefined }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    };
  });

  const provider = new OpenAIProvider({ client });
  await provider.complete({
    model: "gpt-5-mini",
    messages: [userText("hello")],
    system: "You are a helpful assistant.",
  });

  assert.equal(capturedMessages[0].role, "system");
  assert.equal(capturedMessages[0].content, "You are a helpful assistant.");
  assert.equal(capturedMessages[1].role, "user");
});

test("complete() translates a plain text response correctly", async () => {
  const client = mockClient(async () => ({
    choices: [
      {
        message: { role: "assistant", content: "Hello there", tool_calls: undefined },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }));

  const provider = new OpenAIProvider({ client });
  const result = await provider.complete({ model: "gpt-5-mini", messages: [userText("hi")] });

  assert.equal(result.stopReason, "end_turn");
  assert.equal(result.message.role, "assistant");
  assert.equal((result.message.content[0] as any).text, "Hello there");
  assert.equal(result.usage.inputTokens, 10);
  assert.equal(result.usage.outputTokens, 5);
});

test("complete() parses JSON-string tool_calls.function.arguments into an object", async () => {
  const client = mockClient(async () => ({
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_abc123",
              type: "function",
              function: { name: "read_file", arguments: '{"path":"src/index.ts","maxLines":50}' },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: { prompt_tokens: 20, completion_tokens: 8 },
  }));

  const provider = new OpenAIProvider({ client });
  const result = await provider.complete({ model: "gpt-5-mini", messages: [userText("read it")] });

  assert.equal(result.stopReason, "tool_use");
  const toolUse = result.message.content.find((b) => b.type === "tool_use") as any;
  assert.equal(toolUse.id, "call_abc123");
  assert.equal(toolUse.name, "read_file");
  assert.deepEqual(toolUse.input, { path: "src/index.ts", maxLines: 50 });
});

test("complete() handles malformed JSON in tool arguments gracefully (empty object, no throw)", async () => {
  const client = mockClient(async () => ({
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "broken_tool", arguments: "{not valid json" },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  }));

  const provider = new OpenAIProvider({ client });
  const result = await provider.complete({ model: "gpt-5-mini", messages: [userText("x")] });
  const toolUse = result.message.content.find((b) => b.type === "tool_use") as any;
  assert.deepEqual(toolUse.input, {});
});

test("complete() correctly serializes ToolDefinition schemas to function.parameters", async () => {
  const readFileTool: ToolDefinition<{ path: string }> = {
    name: "read_file",
    description: "Read a file",
    mutates: false,
    schema: z.object({ path: z.string() }),
    execute: async () => ({ content: "" }),
  };

  let capturedTools: any;
  const client = mockClient(async (params) => {
    capturedTools = params.tools;
    return {
      choices: [
        { message: { role: "assistant", content: "ok", tool_calls: undefined }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    };
  });

  const provider = new OpenAIProvider({ client });
  await provider.complete({ model: "gpt-5-mini", messages: [userText("hi")], tools: [readFileTool] });

  assert.equal(capturedTools[0].type, "function");
  assert.equal(capturedTools[0].function.name, "read_file");
  assert.deepEqual(capturedTools[0].function.parameters.required, ["path"]);
});

test("complete() expands a single internal tool message into multiple OpenAI tool messages", async () => {
  let capturedMessages: any;
  const client = mockClient(async (params) => {
    capturedMessages = params.messages;
    return {
      choices: [
        { message: { role: "assistant", content: "done", tool_calls: undefined }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    };
  });

  const provider = new OpenAIProvider({ client });
  const history: Message[] = [
    userText("do two things"),
    {
      role: "assistant",
      content: [
        { type: "tool_use", id: "call_1", name: "a", input: {} },
        { type: "tool_use", id: "call_2", name: "b", input: {} },
      ],
    },
    {
      role: "tool",
      content: [
        { type: "tool_result", toolUseId: "call_1", content: "result A" },
        { type: "tool_result", toolUseId: "call_2", content: "result B" },
      ],
    },
  ];

  await provider.complete({ model: "gpt-5-mini", messages: history });

  const toolMessages = capturedMessages.filter((m: any) => m.role === "tool");
  assert.equal(toolMessages.length, 2);
  assert.equal(toolMessages[0].tool_call_id, "call_1");
  assert.equal(toolMessages[0].content, "result A");
  assert.equal(toolMessages[1].tool_call_id, "call_2");
  assert.equal(toolMessages[1].content, "result B");
});

test("complete() maps finish_reason 'length' to max_tokens", async () => {
  const client = mockClient(async () => ({
    choices: [
      { message: { role: "assistant", content: "trunc", tool_calls: undefined }, finish_reason: "length" },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  }));

  const provider = new OpenAIProvider({ client });
  const result = await provider.complete({ model: "gpt-5-mini", messages: [userText("x")] });
  assert.equal(result.stopReason, "max_tokens");
});

test("complete() wraps thrown API errors in ProviderError with retryable flag for 5xx", async () => {
  const OpenAI = (await import("openai")).default;
  const apiError = new OpenAI.APIError(
    503,
    { error: { message: "overloaded" } },
    "overloaded",
    new Headers(),
  );

  const client = mockClient(async () => {
    throw apiError;
  });

  const provider = new OpenAIProvider({ client });
  await assert.rejects(
    () => provider.complete({ model: "gpt-5-mini", messages: [userText("hi")] }),
    (err: unknown) => {
      assert.ok(err instanceof ProviderError);
      assert.equal(err.retryable, true);
      return true;
    },
  );
});

test("complete() handles missing usage data without throwing", async () => {
  const client = mockClient(async () => ({
    choices: [
      { message: { role: "assistant", content: "ok", tool_calls: undefined }, finish_reason: "stop" },
    ],
    usage: undefined,
  }));

  const provider = new OpenAIProvider({ client });
  const result = await provider.complete({ model: "gpt-5-mini", messages: [userText("x")] });
  assert.equal(result.usage.inputTokens, 0);
  assert.equal(result.usage.outputTokens, 0);
});
