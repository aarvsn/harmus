import type { ModelInfo } from "../types/model.js";
import { ModelsDevResponseSchema, type ModelsDevModel } from "./models-dev-schema.js";
import { STATIC_FALLBACK_MODELS } from "./static-models.js";

const MODELS_DEV_URL = "https://models.dev/api.json";
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

function normalize(providerId: string, modelId: string, m: ModelsDevModel): ModelInfo {
  return {
    id: modelId,
    provider: providerId,
    name: m.name ?? modelId,
    contextWindow: m.limit?.context ?? 128_000,
    maxOutputTokens: m.limit?.output ?? 4096,
    supportsTools: m.tool_call ?? false,
    supportsVision: m.modalities?.input?.includes("image") ?? false,
    supportsReasoning: Boolean(m.reasoning),
    supportsStreaming: true,
    inputCostPerMTok: m.cost?.input,
    outputCostPerMTok: m.cost?.output,
  };
}

export interface ModelRegistryOptions {
  /** Override fetch for testing. */
  fetchImpl?: typeof fetch;
  /** Disable network and force static fallback (useful for tests/offline). */
  offline?: boolean;
}

/**
 * Fetches and caches model metadata from models.dev.
 * Falls back to a small static list if the network call fails or
 * the response doesn't match the expected schema.
 */
export class ModelRegistry {
  private cache: ModelInfo[] | null = null;
  private cachedAt = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly offline: boolean;

  constructor(options: ModelRegistryOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.offline = options.offline ?? false;
  }

  async listAll(forceRefresh = false): Promise<ModelInfo[]> {
    const isFresh = this.cache && Date.now() - this.cachedAt < CACHE_TTL_MS;
    if (!forceRefresh && isFresh && this.cache) {
      return this.cache;
    }

    if (this.offline) {
      return this.useFallback();
    }

    try {
      const res = await this.fetchImpl(MODELS_DEV_URL, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`models.dev responded with ${res.status}`);
      }
      const json = await res.json();
      const parsed = ModelsDevResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error(`models.dev response failed schema validation: ${parsed.error.message}`);
      }

      const models: ModelInfo[] = [];
      for (const [providerId, provider] of Object.entries(parsed.data)) {
        for (const [modelId, model] of Object.entries(provider.models ?? {})) {
          models.push(normalize(providerId, modelId, model));
        }
      }

      if (models.length === 0) {
        throw new Error("models.dev returned zero models");
      }

      this.cache = models;
      this.cachedAt = Date.now();
      return models;
    } catch (err) {
      // Network failure, schema drift, or empty response - degrade gracefully.
      console.warn(`[ModelRegistry] Falling back to static model list: ${(err as Error).message}`);
      return this.useFallback();
    }
  }

  async listByProvider(providerId: string): Promise<ModelInfo[]> {
    const all = await this.listAll();
    return all.filter((m) => m.provider === providerId);
  }

  async find(modelId: string): Promise<ModelInfo | undefined> {
    const all = await this.listAll();
    return all.find((m) => m.id === modelId);
  }

  private useFallback(): ModelInfo[] {
    this.cache = STATIC_FALLBACK_MODELS;
    this.cachedAt = Date.now();
    return STATIC_FALLBACK_MODELS;
  }
}
