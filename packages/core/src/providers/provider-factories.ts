import { OpenAICompatibleProvider } from "./openai-compatible-provider.js";
import type { ModelInfo } from "../types/model.js";

// ─── OpenRouter ───────────────────────────────────────────────────────────────
// Routes to 200+ models; use model IDs like "anthropic/claude-sonnet-4-6"
export function createOpenRouterProvider(apiKey?: string) {
  return new OpenAICompatibleProvider({
    providerId: "openrouter",
    providerName: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    envVar: "OPENROUTER_API_KEY",
  });
}

// ─── Groq ─────────────────────────────────────────────────────────────────────
// Ultra-fast inference; model IDs like "llama-3.3-70b-versatile"
export function createGroqProvider(apiKey?: string) {
  return new OpenAICompatibleProvider({
    providerId: "groq",
    providerName: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    apiKey,
    envVar: "GROQ_API_KEY",
    defaultModels: [
      staticModel("groq", "llama-3.3-70b-versatile", "Llama 3.3 70B", 128_000),
      staticModel("groq", "llama-3.1-8b-instant", "Llama 3.1 8B Instant", 128_000),
      staticModel("groq", "mixtral-8x7b-32768", "Mixtral 8x7B", 32_768),
      staticModel("groq", "gemma2-9b-it", "Gemma2 9B", 8_192),
    ],
  });
}

// ─── Together AI ──────────────────────────────────────────────────────────────
export function createTogetherProvider(apiKey?: string) {
  return new OpenAICompatibleProvider({
    providerId: "together",
    providerName: "Together AI",
    baseURL: "https://api.together.xyz/v1",
    apiKey,
    envVar: "TOGETHER_API_KEY",
    defaultModels: [
      staticModel("together", "meta-llama/Llama-3.3-70B-Instruct-Turbo", "Llama 3.3 70B Turbo", 128_000),
      staticModel("together", "mistralai/Mixtral-8x7B-Instruct-v0.1", "Mixtral 8x7B", 32_768),
    ],
  });
}

// ─── Fireworks AI ─────────────────────────────────────────────────────────────
export function createFireworksProvider(apiKey?: string) {
  return new OpenAICompatibleProvider({
    providerId: "fireworks",
    providerName: "Fireworks AI",
    baseURL: "https://api.fireworks.ai/inference/v1",
    apiKey,
    envVar: "FIREWORKS_API_KEY",
    defaultModels: [
      staticModel("fireworks", "accounts/fireworks/models/llama-v3p3-70b-instruct", "Llama 3.3 70B", 128_000),
      staticModel("fireworks", "accounts/fireworks/models/mixtral-8x7b-instruct", "Mixtral 8x7B", 32_768),
    ],
  });
}

// ─── xAI (Grok) ───────────────────────────────────────────────────────────────
export function createXAIProvider(apiKey?: string) {
  return new OpenAICompatibleProvider({
    providerId: "xai",
    providerName: "xAI",
    baseURL: "https://api.x.ai/v1",
    apiKey,
    envVar: "XAI_API_KEY",
    defaultModels: [
      staticModel("xai", "grok-3", "Grok 3", 131_072, true, true),
      staticModel("xai", "grok-3-mini", "Grok 3 Mini", 131_072, false, false),
    ],
  });
}

// ─── NVIDIA NIM ───────────────────────────────────────────────────────────────
export function createNvidiaProvider(apiKey?: string) {
  return new OpenAICompatibleProvider({
    providerId: "nvidia",
    providerName: "NVIDIA NIM",
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey,
    envVar: "NVIDIA_API_KEY",
    defaultModels: [
      staticModel("nvidia", "meta/llama-3.3-70b-instruct", "Llama 3.3 70B", 128_000),
      staticModel("nvidia", "mistralai/mixtral-8x7b-instruct-v0.1", "Mixtral 8x7B", 32_768),
    ],
  });
}

// ─── Moonshot AI ──────────────────────────────────────────────────────────────
export function createMoonshotProvider(apiKey?: string) {
  return new OpenAICompatibleProvider({
    providerId: "moonshot",
    providerName: "Moonshot AI",
    baseURL: "https://api.moonshot.cn/v1",
    apiKey,
    envVar: "MOONSHOT_API_KEY",
    defaultModels: [
      staticModel("moonshot", "moonshot-v1-8k", "Moonshot v1 8K", 8_192),
      staticModel("moonshot", "moonshot-v1-32k", "Moonshot v1 32K", 32_768),
      staticModel("moonshot", "moonshot-v1-128k", "Moonshot v1 128K", 131_072),
    ],
  });
}

// ─── Ollama (local) ───────────────────────────────────────────────────────────
export function createOllamaProvider(baseURL = "http://localhost:11434/v1") {
  return new OpenAICompatibleProvider({
    providerId: "ollama",
    providerName: "Ollama",
    baseURL,
    apiKey: "ollama", // Ollama ignores the key but the SDK requires a non-empty string
    defaultModels: [
      staticModel("ollama", "llama3.3", "Llama 3.3 (local)", 128_000),
      staticModel("ollama", "mistral", "Mistral (local)", 32_768),
      staticModel("ollama", "codellama", "Code Llama (local)", 16_384),
      staticModel("ollama", "qwen2.5-coder", "Qwen 2.5 Coder (local)", 32_768),
    ],
  });
}

// ─── LM Studio (local) ────────────────────────────────────────────────────────
export function createLMStudioProvider(baseURL = "http://localhost:1234/v1") {
  return new OpenAICompatibleProvider({
    providerId: "lmstudio",
    providerName: "LM Studio",
    baseURL,
    apiKey: "lmstudio",
    defaultModels: [
      staticModel("lmstudio", "local-model", "Currently loaded model", 32_768),
    ],
  });
}

// ─── Google Gemini ────────────────────────────────────────────────────────────
// Gemini also exposes an OpenAI-compatible endpoint
export function createGeminiProvider(apiKey?: string) {
  return new OpenAICompatibleProvider({
    providerId: "google",
    providerName: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey,
    envVar: "GOOGLE_API_KEY",
    defaultModels: [
      staticModel("google", "gemini-2.5-pro", "Gemini 2.5 Pro", 1_000_000, true, true),
      staticModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash", 1_000_000, true, false),
      staticModel("google", "gemini-2.0-flash", "Gemini 2.0 Flash", 1_000_000, true, false),
    ],
  });
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function staticModel(
  provider: string,
  id: string,
  name: string,
  contextWindow: number,
  supportsVision = false,
  supportsReasoning = false,
): ModelInfo {
  return {
    id,
    provider,
    name,
    contextWindow,
    maxOutputTokens: Math.min(contextWindow, 16_384),
    supportsTools: true,
    supportsVision,
    supportsReasoning,
    supportsStreaming: true,
  };
}
