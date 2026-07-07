# Provider Reference

Harmus supports 12 LLM providers through a unified `Provider` interface. All providers support tool calling and streaming; vision support varies.

## Quick Reference

| Provider | ID | Env var | Local? | Vision |
|----------|----|---------|--------|--------|
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` | No | ✅ |
| OpenAI | `openai` | `OPENAI_API_KEY` | No | ✅ |
| Google Gemini | `google` | `GOOGLE_API_KEY` | No | ✅ |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | No | varies |
| Groq | `groq` | `GROQ_API_KEY` | No | ❌ |
| Together AI | `together` | `TOGETHER_API_KEY` | No | ❌ |
| Fireworks AI | `fireworks` | `FIREWORKS_API_KEY` | No | ❌ |
| xAI (Grok) | `xai` | `XAI_API_KEY` | No | ✅ |
| NVIDIA NIM | `nvidia` | `NVIDIA_API_KEY` | No | ❌ |
| Moonshot AI | `moonshot` | `MOONSHOT_API_KEY` | No | ❌ |
| Ollama | `ollama` | *(none)* | ✅ | varies |
| LM Studio | `lmstudio` | *(none)* | ✅ | varies |

## Using a Provider

```bash
# Via flag
harmus build "add tests" --provider groq --model llama-3.3-70b-versatile

# Via environment variable
export HARMUS_MODEL=gemini-2.5-pro
harmus plan "refactor the auth layer"

# Per-role assignment
harmus implement "add search" \
  --models "plan=claude-opus-4-7,build=gpt-5-mini,review=claude-sonnet-4-6"
```

## Provider Details

### Anthropic

Best reasoning and code quality. Recommended for Plan Mode.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
harmus plan "add OAuth" --provider anthropic --model claude-opus-4-7
```

**Recommended models:**
- `claude-opus-4-7` — best reasoning, use for Plan/Review
- `claude-sonnet-4-6` — balanced, good default
- `claude-haiku-4-5-20251001` — fast and cheap

### OpenAI

```bash
export OPENAI_API_KEY=sk-...
harmus build "fix the TypeScript errors" --provider openai --model gpt-5-mini
```

### Google Gemini

Largest context window (1M tokens). Excellent for vision tasks.

```bash
export GOOGLE_API_KEY=...
harmus plan "analyze this codebase" --provider google --model gemini-2.5-pro
```

### OpenRouter

Routes to 200+ models via a single API key. Use `org/model` format for model IDs.

```bash
export OPENROUTER_API_KEY=sk-or-...
harmus build "add tests" --provider openrouter --model anthropic/claude-sonnet-4-6
```

### Groq

Ultra-fast inference (200+ tok/s). Best for Build Mode when speed matters.

```bash
export GROQ_API_KEY=gsk_...
harmus build "fix the lint errors" --provider groq --model llama-3.3-70b-versatile
```

**Available models:** `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `mixtral-8x7b-32768`, `gemma2-9b-it`

### Ollama (local)

No API key required. Models run locally.

```bash
# Pull a model first
ollama pull llama3.3
ollama pull qwen2.5-coder

harmus build "refactor this" --provider ollama --model llama3.3
```

The Ollama base URL defaults to `http://localhost:11434/v1`. Override with:

```bash
OLLAMA_BASE_URL=http://192.168.1.100:11434/v1 harmus build "add tests"
```

### LM Studio (local)

Load a model in LM Studio and start the local server, then:

```bash
harmus build "refactor this" --provider lmstudio --model local-model
```

## Rate Limits

Harmus automatically rate-limits requests per provider to avoid 429 errors. Default limits:

| Provider | Requests/min | Max concurrent |
|----------|-------------|----------------|
| Anthropic | 50 | 5 |
| OpenAI | 60 | 10 |
| Google | 60 | 10 |
| Groq | 30 | 5 |
| OpenRouter | 200 | 20 |
| Ollama | 600 | 4 |
| LM Studio | 600 | 2 |

These are conservative defaults. On paid tiers with higher limits, the retry-with-backoff will handle occasional 429s anyway.

## Failover

Use `ProviderRegistry.completeWithFailover()` programmatically to try multiple providers in order:

```typescript
import { createDefaultRegistry } from "@harmus/core";

const registry = createDefaultRegistry();
const result = await registry.completeWithFailover(
  ["anthropic", "openai", "groq"],
  { model: "claude-sonnet-4-6", messages }
);
```
