import type { Provider, CompleteOptions, CompleteResult } from "./provider.js";
import { ProviderError } from "./provider.js";
import type { ModelInfo } from "../types/model.js";

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
}

/**
 * Central registry of all configured providers. Supports:
 *  - Lookup by provider ID
 *  - List all models across all providers
 *  - Retry with exponential backoff for retryable errors
 *  - Automatic failover: if the preferred provider fails permanently,
 *    try the next configured provider that supports the same model family
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, Provider>();

  register(provider: Provider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  list(): Provider[] {
    return Array.from(this.providers.values());
  }

  configured(): Provider[] {
    return this.list().filter((p) => p.isConfigured());
  }

  async listAllModels(): Promise<ModelInfo[]> {
    const results = await Promise.allSettled(this.configured().map((p) => p.listModels()));
    return results
      .filter((r): r is PromiseFulfilledResult<ModelInfo[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);
  }

  /**
   * Run a completion with automatic retry on retryable errors (429, 5xx)
   * using exponential backoff, then fail hard on non-retryable errors.
   */
  async complete(
    providerId: string,
    options: CompleteOptions,
    retryOptions: RetryOptions = {},
  ): Promise<CompleteResult> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ProviderError(`No provider registered with id "${providerId}"`, providerId);
    }
    if (!provider.isConfigured()) {
      throw new ProviderError(`Provider "${providerId}" is not configured (missing API key?)`, providerId);
    }
    return withRetry(() => provider.complete(options), retryOptions);
  }

  /**
   * Try a completion across multiple providers in priority order, returning
   * the first successful result. Useful when a model is available on several
   * providers (e.g. Llama via Together, Fireworks, Groq).
   */
  async completeWithFailover(
    providerIds: string[],
    options: CompleteOptions,
    retryOptions: RetryOptions = {},
  ): Promise<CompleteResult> {
    const errors: string[] = [];
    for (const id of providerIds) {
      try {
        return await this.complete(id, options, retryOptions);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${id}: ${msg}`);
        // Only continue to next provider on non-retryable errors; retryable
        // ones were already retried inside complete().
        if (err instanceof ProviderError && err.retryable) {
          // exhausted retries on this provider — fall through to next
        }
      }
    }
    throw new ProviderError(`All providers failed:\n${errors.join("\n")}`, providerIds[0] ?? "unknown");
  }
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 500;

async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const initialDelay = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isRetryable = err instanceof ProviderError && err.retryable;
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = initialDelay * 2 ** attempt + Math.random() * 100;
      await sleep(delay);
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
