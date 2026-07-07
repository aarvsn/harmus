import { test } from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../provider-registry.js";
import { ProviderError } from "../provider.js";
import type { Provider, CompleteOptions, CompleteResult } from "../provider.js";
import type { ModelInfo } from "../../types/model.js";

function makeProvider(id: string, configured: boolean, completeFn: () => Promise<CompleteResult>): Provider {
  return {
    id,
    name: id,
    isConfigured: () => configured,
    listModels: async (): Promise<ModelInfo[]> => [],
    complete: async (_opts: CompleteOptions) => completeFn(),
  };
}

function okResult(): CompleteResult {
  return {
    message: { role: "assistant", content: [{ type: "text", text: "ok" }] },
    stopReason: "end_turn",
    usage: { inputTokens: 1, outputTokens: 1 },
  };
}

const MINIMAL_OPTS: CompleteOptions = { model: "m", messages: [] };

test("ProviderRegistry.get returns registered provider", () => {
  const registry = new ProviderRegistry();
  const p = makeProvider("anthropic", true, async () => okResult());
  registry.register(p);
  assert.equal(registry.get("anthropic"), p);
});

test("ProviderRegistry.get returns undefined for unknown provider", () => {
  const registry = new ProviderRegistry();
  assert.equal(registry.get("missing"), undefined);
});

test("ProviderRegistry.configured excludes unconfigured providers", () => {
  const registry = new ProviderRegistry();
  registry.register(makeProvider("a", true, async () => okResult()));
  registry.register(makeProvider("b", false, async () => okResult()));
  const configured = registry.configured();
  assert.equal(configured.length, 1);
  assert.equal(configured[0]?.id, "a");
});

test("ProviderRegistry.complete succeeds when provider is configured", async () => {
  const registry = new ProviderRegistry();
  registry.register(makeProvider("anthropic", true, async () => okResult()));
  const result = await registry.complete("anthropic", MINIMAL_OPTS);
  assert.equal(result.stopReason, "end_turn");
});

test("ProviderRegistry.complete throws on unknown provider id", async () => {
  const registry = new ProviderRegistry();
  await assert.rejects(
    () => registry.complete("nonexistent", MINIMAL_OPTS),
    (err: unknown) => {
      assert.ok(err instanceof ProviderError);
      assert.match(err.message, /No provider registered/);
      return true;
    },
  );
});

test("ProviderRegistry.complete throws on unconfigured provider", async () => {
  const registry = new ProviderRegistry();
  registry.register(makeProvider("p", false, async () => okResult()));
  await assert.rejects(
    () => registry.complete("p", MINIMAL_OPTS),
    (err: unknown) => {
      assert.ok(err instanceof ProviderError);
      assert.match(err.message, /not configured/);
      return true;
    },
  );
});

test("ProviderRegistry.complete retries on retryable ProviderError and eventually succeeds", async () => {
  let calls = 0;
  const registry = new ProviderRegistry();
  registry.register(makeProvider("p", true, async () => {
    calls++;
    if (calls < 3) throw new ProviderError("overloaded", "p", undefined, true);
    return okResult();
  }));
  const result = await registry.complete("p", MINIMAL_OPTS, { maxRetries: 3, initialDelayMs: 1 });
  assert.equal(result.stopReason, "end_turn");
  assert.equal(calls, 3);
});

test("ProviderRegistry.complete does not retry on non-retryable ProviderError", async () => {
  let calls = 0;
  const registry = new ProviderRegistry();
  registry.register(makeProvider("p", true, async () => {
    calls++;
    throw new ProviderError("auth failed", "p", undefined, false);
  }));
  await assert.rejects(() => registry.complete("p", MINIMAL_OPTS, { maxRetries: 3, initialDelayMs: 1 }));
  assert.equal(calls, 1);
});

test("ProviderRegistry.complete throws after exhausting all retries", async () => {
  const registry = new ProviderRegistry();
  registry.register(makeProvider("p", true, async () => {
    throw new ProviderError("overloaded", "p", undefined, true);
  }));
  await assert.rejects(
    () => registry.complete("p", MINIMAL_OPTS, { maxRetries: 2, initialDelayMs: 1 }),
    ProviderError,
  );
});

test("ProviderRegistry.completeWithFailover tries providers in order", async () => {
  const tried: string[] = [];
  const registry = new ProviderRegistry();
  registry.register(makeProvider("a", true, async () => {
    tried.push("a");
    throw new ProviderError("fail", "a", undefined, false);
  }));
  registry.register(makeProvider("b", true, async () => {
    tried.push("b");
    return okResult();
  }));
  const result = await registry.completeWithFailover(["a", "b"], MINIMAL_OPTS);
  assert.equal(result.stopReason, "end_turn");
  assert.deepEqual(tried, ["a", "b"]);
});

test("ProviderRegistry.completeWithFailover throws when all providers fail", async () => {
  const registry = new ProviderRegistry();
  registry.register(makeProvider("a", true, async () => { throw new ProviderError("fail a", "a"); }));
  registry.register(makeProvider("b", true, async () => { throw new ProviderError("fail b", "b"); }));
  await assert.rejects(
    () => registry.completeWithFailover(["a", "b"], MINIMAL_OPTS),
    (err: unknown) => {
      assert.ok(err instanceof ProviderError);
      assert.match(err.message, /All providers failed/);
      return true;
    },
  );
});

test("ProviderRegistry.listAllModels aggregates across all configured providers", async () => {
  const registry = new ProviderRegistry();
  const makeWithModels = (id: string, models: ModelInfo[]): Provider => ({
    id, name: id,
    isConfigured: () => true,
    listModels: async () => models,
    complete: async () => okResult(),
  });
  registry.register(makeWithModels("a", [{ id: "m1", provider: "a", name: "M1", contextWindow: 1000, maxOutputTokens: 100, supportsTools: true, supportsVision: false, supportsReasoning: false, supportsStreaming: true }]));
  registry.register(makeWithModels("b", [{ id: "m2", provider: "b", name: "M2", contextWindow: 2000, maxOutputTokens: 200, supportsTools: true, supportsVision: true, supportsReasoning: false, supportsStreaming: true }]));
  const models = await registry.listAllModels();
  assert.equal(models.length, 2);
  assert.ok(models.some((m) => m.id === "m1"));
  assert.ok(models.some((m) => m.id === "m2"));
});
