import { test } from "node:test";
import assert from "node:assert/strict";
import { ModelRegistry } from "../model-registry.js";
import { STATIC_FALLBACK_MODELS } from "../static-models.js";

function fakeFetchOk(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

function fakeFetchError(status: number): typeof fetch {
  return (async () => new Response("nope", { status })) as unknown as typeof fetch;
}

test("ModelRegistry parses a well-formed models.dev response", async () => {
  const fakeResponse = {
    anthropic: {
      id: "anthropic",
      name: "Anthropic",
      models: {
        "claude-sonnet-4-6": {
          name: "Claude Sonnet 4.6",
          tool_call: true,
          reasoning: true,
          modalities: { input: ["text", "image"], output: ["text"] },
          limit: { context: 200000, output: 64000 },
          cost: { input: 3, output: 15 },
        },
      },
    },
  };

  const registry = new ModelRegistry({ fetchImpl: fakeFetchOk(fakeResponse) });
  const models = await registry.listAll();

  assert.equal(models.length, 1);
  assert.equal(models[0]?.id, "claude-sonnet-4-6");
  assert.equal(models[0]?.provider, "anthropic");
  assert.equal(models[0]?.supportsVision, true);
  assert.equal(models[0]?.contextWindow, 200000);
});

test("ModelRegistry falls back to static list on HTTP error", async () => {
  const registry = new ModelRegistry({ fetchImpl: fakeFetchError(500) });
  const models = await registry.listAll();
  assert.deepEqual(models, STATIC_FALLBACK_MODELS);
});

test("ModelRegistry falls back to static list on malformed JSON schema", async () => {
  const registry = new ModelRegistry({ fetchImpl: fakeFetchOk({ anthropic: { models: "not-an-object" } }) });
  const models = await registry.listAll();
  assert.deepEqual(models, STATIC_FALLBACK_MODELS);
});

test("ModelRegistry offline mode skips network entirely", async () => {
  let called = false;
  const registry = new ModelRegistry({
    offline: true,
    fetchImpl: (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch,
  });
  const models = await registry.listAll();
  assert.equal(called, false);
  assert.deepEqual(models, STATIC_FALLBACK_MODELS);
});

test("ModelRegistry caches results and does not refetch within TTL", async () => {
  let callCount = 0;
  const fetchImpl = (async () => {
    callCount++;
    return new Response(JSON.stringify({ anthropic: { models: {} } }), { status: 200 });
  }) as unknown as typeof fetch;

  // Note: empty models map triggers "zero models" fallback path, which still
  // exercises caching since useFallback() sets the cache too.
  const registry = new ModelRegistry({ fetchImpl });
  await registry.listAll();
  await registry.listAll();
  assert.equal(callCount, 1);
});

test("ModelRegistry.find returns undefined for unknown model", async () => {
  const registry = new ModelRegistry({ offline: true });
  const found = await registry.find("nonexistent-model-xyz");
  assert.equal(found, undefined);
});

test("ModelRegistry.listByProvider filters correctly", async () => {
  const registry = new ModelRegistry({ offline: true });
  const anthropicModels = await registry.listByProvider("anthropic");
  assert.ok(anthropicModels.length > 0);
  assert.ok(anthropicModels.every((m) => m.provider === "anthropic"));
});
