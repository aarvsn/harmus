import { ProviderRegistry } from "./provider-registry.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import {
  createOpenRouterProvider,
  createGroqProvider,
  createTogetherProvider,
  createFireworksProvider,
  createXAIProvider,
  createNvidiaProvider,
  createMoonshotProvider,
  createGeminiProvider,
  createOllamaProvider,
  createLMStudioProvider,
} from "./provider-factories.js";

/**
 * Creates a ProviderRegistry pre-populated with every supported provider,
 * each configured from the appropriate environment variable. Providers whose
 * env var isn't set are registered but report isConfigured() = false.
 *
 * Local providers (Ollama, LM Studio) are always included and treated as
 * configured since they don't need an API key.
 */
export function createDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();

  registry.register(new AnthropicProvider());
  registry.register(new OpenAIProvider());
  registry.register(createGeminiProvider());
  registry.register(createOpenRouterProvider());
  registry.register(createGroqProvider());
  registry.register(createTogetherProvider());
  registry.register(createFireworksProvider());
  registry.register(createXAIProvider());
  registry.register(createNvidiaProvider());
  registry.register(createMoonshotProvider());
  registry.register(createOllamaProvider());
  registry.register(createLMStudioProvider());

  return registry;
}

/** Infer the provider ID from a model string. Used by the CLI/TUI to avoid
 *  forcing the user to always specify both model AND provider. */
export function inferProviderId(modelId: string): string {
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3")) return "openai";
  if (modelId.startsWith("gemini-")) return "google";
  if (modelId.startsWith("grok-")) return "xai";
  if (modelId.startsWith("moonshot-")) return "moonshot";
  if (modelId.startsWith("llama") || modelId.startsWith("mistral") || modelId.startsWith("mixtral") || modelId.startsWith("gemma")) return "groq";
  if (modelId.includes("/")) return "openrouter"; // OpenRouter uses "org/model" format
  return "anthropic"; // safe default
}
