import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateTokens, compactHistory, maybeCompact } from "../context-compactor.js";
import type { Provider, CompleteOptions, CompleteResult } from "../../providers/provider.js";
import type { ModelInfo } from "../../types/model.js";
import type { Message } from "../../types/message.js";

function textMsg(role: "user" | "assistant", text: string): Message {
  return { role, content: [{ type: "text", text }] };
}

function makeProvider(summaryText: string): Provider {
  return {
    id: "fake",
    name: "Fake",
    isConfigured: () => true,
    listModels: async (): Promise<ModelInfo[]> => [],
    complete: async (_opts: CompleteOptions): Promise<CompleteResult> => ({
      message: { role: "assistant", content: [{ type: "text", text: summaryText }] },
      stopReason: "end_turn",
      usage: { inputTokens: 1, outputTokens: 1 },
    }),
  };
}

const OPTS = { provider: makeProvider("summary text"), model: "m" };

test("estimateTokens returns 0 for empty history", () => {
  assert.equal(estimateTokens([]), 0);
});

test("estimateTokens approximates token count from char count", () => {
  const msgs = [textMsg("user", "a".repeat(400))];
  assert.equal(estimateTokens(msgs), 100); // 400 / 4
});

test("estimateTokens counts tool_use and tool_result blocks", () => {
  const msgs: Message[] = [
    {
      role: "assistant",
      content: [{ type: "tool_use", id: "t1", name: "read_file", input: { path: "a.ts" } }],
    },
    { role: "tool", content: [{ type: "tool_result", toolUseId: "t1", content: "x".repeat(400) }] },
  ];
  const tokens = estimateTokens(msgs);
  assert.ok(tokens > 0);
});

test("compactHistory does nothing when under the threshold", async () => {
  const history = [textMsg("user", "hi"), textMsg("assistant", "hello")];
  const result = await compactHistory(history, { ...OPTS, thresholdTokens: 100_000 });
  assert.equal(result.wasCompacted, false);
  assert.deepEqual(result.compacted, history);
});

test("compactHistory summarizes old messages when over threshold", async () => {
  // Create history that exceeds a very low threshold
  const history = Array.from({ length: 20 }, (_, i) =>
    textMsg(i % 2 === 0 ? "user" : "assistant", "x".repeat(200)),
  );

  const result = await compactHistory(history, { ...OPTS, thresholdTokens: 100, preserveRecentCount: 4 });

  assert.equal(result.wasCompacted, true);
  assert.equal(result.summary, "summary text");
  // Should have: 1 summary message + 4 preserved recent messages
  assert.equal(result.compacted.length, 5);
});

test("compactHistory preserves the last N messages verbatim", async () => {
  const history = Array.from({ length: 10 }, (_, i) =>
    textMsg(i % 2 === 0 ? "user" : "assistant", `message ${i}`),
  );
  const lastThree = history.slice(-3);

  const result = await compactHistory(history, {
    ...OPTS,
    thresholdTokens: 1,
    preserveRecentCount: 3,
  });

  const preserved = result.compacted.slice(-3);
  assert.deepEqual(preserved, lastThree);
});

test("compactHistory prepends a summary message with context label", async () => {
  const history = Array.from({ length: 10 }, () => textMsg("user", "x".repeat(200)));
  const result = await compactHistory(history, { ...OPTS, thresholdTokens: 1, preserveRecentCount: 3 });
  const first = result.compacted[0];
  assert.equal(first?.role, "user");
  const text = (first?.content[0] as any).text as string;
  assert.match(text, /Context summary/);
  assert.match(text, /summary text/);
});

test("maybeCompact mutates the history array in place when compaction triggers", async () => {
  const history: Message[] = Array.from({ length: 10 }, () => textMsg("user", "x".repeat(200)));
  const original = history; // same reference

  const summary = await maybeCompact(history, { ...OPTS, thresholdTokens: 1, preserveRecentCount: 2 });

  assert.ok(summary !== null);
  assert.equal(history, original); // same array object
  assert.ok(history.length < 10); // but shorter now
});

test("maybeCompact returns null and leaves history unchanged when under threshold", async () => {
  const history: Message[] = [textMsg("user", "hi")];
  const originalLength = history.length;

  const summary = await maybeCompact(history, { ...OPTS, thresholdTokens: 999_999 });

  assert.equal(summary, null);
  assert.equal(history.length, originalLength);
});
