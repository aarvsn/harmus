import type { ModelInfo } from "../types/model.js";

/**
 * Hardcoded fallback so Harmus still works offline or if models.dev is down.
 * This is intentionally small - just enough well-known models per official
 * provider to keep the app usable. The live registry (models-dev-registry.ts)
 * supersedes this whenever network access succeeds.
 */
export const STATIC_FALLBACK_MODELS: ModelInfo[] = [
  {
    id: "claude-opus-4-7",
    provider: "anthropic",
    name: "Claude Opus 4.7",
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
  },
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    name: "Claude Sonnet 4.6",
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
  },
  {
    id: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    name: "Claude Haiku 4.5",
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: false,
    supportsStreaming: true,
  },
  {
    id: "gpt-5-mini",
    provider: "openai",
    name: "GPT-5 Mini",
    contextWindow: 128_000,
    maxOutputTokens: 16_000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
  },
  {
    id: "gemini-2.5-pro",
    provider: "google",
    name: "Gemini 2.5 Pro",
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
    supportsStreaming: true,
  },
];
