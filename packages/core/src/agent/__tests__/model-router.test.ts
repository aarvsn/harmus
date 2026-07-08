import { test } from "node:test";
import assert from "node:assert/strict";
import { ModelRouter, parseModelAssignments } from "../model-router.js";
import { ProviderRegistry } from "../../providers/provider-registry.js";
import type { Provider, CompleteOptions, CompleteResult } from "../../providers/provider.js";
import type { ModelInfo } from "../../types/model.js";

function okResult(text: string): CompleteResult {
  return {
    message: { role: "assistant", content: [{ type: "text", text }] },
    stopReason: "end_turn",
    usage: { inputTokens: 1, outputTokens: 1 },
  };
}

function makeProvider(id: string, onComplete: (model: string) => CompleteResult): Provider {
  return {
    id,
    name: id,
    isConfigured: () => true,
    listModels: async (): Promise<ModelInfo[]> => [],
    complete: async (opts: CompleteOptions) => onComplete(opts.model),
  };
}

function makeRegistry(providers: Provider[]): ProviderRegistry {
  const r = new ProviderRegistry();
  for (const p of providers) r.register(p);
  return r;
}

test("ModelRouter.modelForRole returns assigned model", () => {
  const registry = makeRegistry([]);
  const router = new ModelRouter({
    registry,
    assignments: { plan: "claude-opus-4-7", build: "gpt-5-mini" },
    defaultModel: "claude-sonnet-4-6",
  });
  assert.equal(router.modelForRole("plan"), "claude-opus-4-7");
  assert.equal(router.modelForRole("build"), "gpt-5-mini");
});

test("ModelRouter.modelForRole falls back to defaultModel for unassigned role", () => {
  const registry = makeRegistry([]);
  const router = new ModelRouter({
    registry,
    assignments: {},
    defaultModel: "claude-sonnet-4-6",
  });
  assert.equal(router.modelForRole("chat"), "claude-sonnet-4-6");
  assert.equal(router.modelForRole("review"), "claude-sonnet-4-6");
});

test("ModelRouter.providerIdForRole infers provider from model name", () => {
  const registry = makeRegistry([]);
  const router = new ModelRouter({
    registry,
    assignments: { plan: "claude-opus-4-7", build: "gpt-5-mini", vision: "gemini-2.5-pro" },
    defaultModel: "claude-sonnet-4-6",
  });
  assert.equal(router.providerIdForRole("plan"), "anthropic");
  assert.equal(router.providerIdForRole("build"), "openai");
  assert.equal(router.providerIdForRole("vision"), "google");
});

test("ModelRouter.roleForMode maps plan->plan and build->build", () => {
  const registry = makeRegistry([]);
  const router = new ModelRouter({ registry, assignments: {}, defaultModel: "m" });
  assert.equal(router.roleForMode("plan"), "plan");
  assert.equal(router.roleForMode("build"), "build");
});

test("ModelRouter.complete routes to correct provider and model", async () => {
  const received: { provider: string; model: string }[] = [];
  const anthropic = makeProvider("anthropic", (model) => {
    received.push({ provider: "anthropic", model });
    return okResult("from anthropic");
  });
  const openai = makeProvider("openai", (model) => {
    received.push({ provider: "openai", model });
    return okResult("from openai");
  });

  const registry = makeRegistry([anthropic, openai]);
  const router = new ModelRouter({
    registry,
    assignments: { plan: "claude-opus-4-7", build: "gpt-5-mini" },
    defaultModel: "claude-sonnet-4-6",
  });

  await router.complete("plan", { messages: [] });
  await router.complete("build", { messages: [] });

  assert.deepEqual(received[0], { provider: "anthropic", model: "claude-opus-4-7" });
  assert.deepEqual(received[1], { provider: "openai", model: "gpt-5-mini" });
});

test("ModelRouter.summary returns all roles with their model and provider", () => {
  const registry = makeRegistry([]);
  const router = new ModelRouter({
    registry,
    assignments: { plan: "claude-opus-4-7" },
    defaultModel: "claude-sonnet-4-6",
  });
  const summary = router.summary();
  assert.equal(summary.plan.model, "claude-opus-4-7");
  assert.equal(summary.plan.provider, "anthropic");
  assert.equal(summary.build.model, "claude-sonnet-4-6");
});

test("parseModelAssignments parses comma-separated role=model pairs", () => {
  const result = parseModelAssignments("plan=claude-opus-4-7,build=gpt-5-mini");
  assert.equal(result.plan, "claude-opus-4-7");
  assert.equal(result.build, "gpt-5-mini");
});

test("parseModelAssignments handles whitespace gracefully", () => {
  const result = parseModelAssignments("plan = claude-opus-4-7 , build = gpt-5-mini");
  assert.equal(result.plan, "claude-opus-4-7");
  assert.equal(result.build, "gpt-5-mini");
});

test("parseModelAssignments returns empty object for empty string", () => {
  const result = parseModelAssignments("");
  assert.deepEqual(result, {});
});
