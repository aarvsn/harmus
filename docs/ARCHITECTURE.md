# Architecture

This document explains how Harmus is structured internally. Reading this before contributing will save you significant time.

## Monorepo Layout

```
harmus/
├── packages/
│   ├── core/           @harmus/core     — everything shared
│   ├── cli/            @harmus/cli      — harmus CLI binary
│   ├── tui/            @harmus/tui      — harmus-tui binary (Ink)
│   └── discord/        @harmus/discord  — harmus-discord binary
├── scripts/
│   └── windows/        — harmus-init.exe source + build config
├── .github/
│   ├── workflows/      — CI, release, stale, Windows installer
│   └── ISSUE_TEMPLATE/ — structured issue forms
├── install.sh          — macOS/Linux one-line installer
├── .releaserc.json     — semantic-release config
└── package.json        — npm workspace root
```

## @harmus/core — The Heart

Everything that isn't UI or Discord lives here. All other packages import from `@harmus/core` only.

### `src/types/`

Pure TypeScript interfaces. No runtime code, no dependencies.

- `message.ts` — `Message`, `ContentBlock` (text/image/tool_use/tool_result), helper factories
- `tool.ts` — `ToolDefinition<TInput>`, `ToolExecutionContext`, `ApprovalRequest`, `ChangeJournalLike`
- `model.ts` — `ModelInfo`, `ModelRole`, `ModelAssignments`

### `src/providers/`

Every LLM provider implements the `Provider` interface:

```
complete(options: CompleteOptions): Promise<CompleteResult>
listModels(): Promise<ModelInfo[]>
isConfigured(): boolean
```

The translation layer (our `Message` format ↔ provider wire format) lives entirely inside each provider class. The agent loop never sees provider-specific types.

**Key classes:**
- `AnthropicProvider` — official `@anthropic-ai/sdk`
- `OpenAIProvider` — official `openai` SDK (handles JSON-string tool args, system-as-message)
- `OpenAICompatibleProvider` — base for Groq, Together, Fireworks, xAI, Ollama, etc.
- `ModelRegistry` — fetches from `models.dev/api.json` with Zod validation + static fallback
- `ProviderRegistry` — central store, per-provider rate limiting, exponential backoff retry, failover
- `RateLimiter` — token bucket with RPM + concurrency caps per provider

### `src/tools/`

Each tool implements `ToolDefinition<TInput>`:

```typescript
interface ToolDefinition<TInput> {
  name: string;
  description: string;
  schema: z.ZodType<TInput>;   // validated before execute() is called
  mutates: boolean;            // true = blocked in Plan Mode, must request approval + journal
  execute(input: TInput, ctx: ToolExecutionContext): Promise<ToolExecutionResult>;
}
```

**Mutation contract** — every `mutates: true` tool must:

1. `if (ctx.mode === "plan") return error`
2. `if (ctx.requestApproval) { approved = await ctx.requestApproval({...}); if (!approved) return error }`
3. do the write/delete
4. `ctx.journal?.recordCreate/Edit/Delete(path, before, after, ctx.toolCallId)`

This is enforced in `edit_file` and `write_file`. The `revert_changes` tool exposes the journal to the agent itself.

### `src/agent/`

- `tool-registry.ts` — `ToolRegistry` (register, list, listForMode), `executeToolUse` (validates schema, enforces Plan Mode, catches errors)
- `agent-loop.ts` — `runAgentLoop()` drives the provider→tool→provider cycle
- `model-router.ts` — `ModelRouter` routes completions to the right provider+model by role, `validateCompatibility()` warns on mismatched assignments
- `context-compactor.ts` — `maybeCompact()` summarizes old messages when context grows
- `architectural-summary.ts` — `ArchitecturalSummaryStore` maintains structured architectural knowledge across compactions
- `change-journal.ts` — `ChangeJournal` records every mutation for revert/partial-apply

### `src/repo-indexer/`

- `framework-detector.ts` — reads `package.json`, config files, and source file extensions to identify frameworks + language + package manager. Also walks sub-packages in monorepos.
- `import-follower.ts` — regex-based JS/TS import graph. Builds `DependencyGraph` (file → edges), supports `findImporters()` and `transitiveDeps()`.

### `src/vision/`

`image-loader.ts` — reads PNG/JPG/GIF/WebP from disk, base64-encodes, returns `ImageBlock` content blocks ready to attach to a `Message`.

### `src/plugins/`

`HarmusPlugin` interface + `PluginRegistry`. Plugins can contribute tools, providers, `onActivate`, `onBeforeRun`, `onAfterRun` hooks.

---

## The Agent Loop

```
runAgentLoop(history, options)
│
├── toolsForMode = registry.listForMode(mode)  // Plan: no mutating tools
│
└── LOOP (up to maxIterations):
    │
    ├── provider.complete({ model, messages, tools, system })
    │     └── fires onTextDelta for streaming
    │
    ├── if stopReason === "end_turn" (no tool calls) → RETURN
    ├── if stopReason === "max_tokens" → RETURN
    │
    └── for each tool_use block:
          executeToolUse(block, registry, ctx)
          │
          ├── schema.safeParse(block.input)
          ├── if mutates && mode==="plan" → error
          ├── ctx.requestApproval?.() → abort if false
          ├── tool.execute(parsed, ctx)
          └── ctx.journal?.record*(...)
          │
          → tool_result blocks added to history
          → CONTINUE LOOP
```

---

## Plan/Build Mode

Plan Mode is not a UI concept — it's enforced at the tool level. The `ToolRegistry.listForMode("plan")` method filters out all `mutates: true` tools before they are sent to the model. This means the model never even *knows* `edit_file` or `write_file` exist in Plan Mode — it can only read and search.

`requestApproval` adds an additional gate for Build Mode: even when `mutates: true`, the tool checks this callback before writing. If it returns `false`, the write is skipped cleanly (no partial writes, no exceptions).

---

## Message Format

Internally, everything uses our `Message` / `ContentBlock` types. Each provider translates to/from its own wire format:

| Our type | Anthropic wire | OpenAI wire |
|----------|----------------|-------------|
| `TextBlock` | `{type: "text"}` | string in content |
| `ImageBlock` | `{type: "image", source: {type: "base64"}}` | `{type: "image_url"}` |
| `ToolUseBlock` | `{type: "tool_use", id, name, input}` | `tool_calls[].function` (JSON string args) |
| `ToolResultBlock` | `{type: "tool_result", tool_use_id}` | `{role: "tool", tool_call_id}` (one per result) |

The big structural difference: Anthropic groups all tool results into a single user message; OpenAI requires one `role: "tool"` message per result. `OpenAIProvider.toOpenAIMessage()` handles this expansion.

---

## TUI Architecture

The TUI is built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal).

State is managed by a pure `sessionReducer` (no React dependency) so it can be tested without rendering. The reducer handles:

`submit_user_message` → `agent_start` → `tool_start` → `tool_end` → `assistant_text` → `agent_end`

The `App` component dispatches these actions as callbacks into `runAgentLoop`.

Panel switching is local `useState` in `App` — no shared state needed since only one panel is visible at a time.

---

## Discord Bot

The Discord bot wraps `runAgentLoop` with slash command and `@mention` triggers. Each command runs in the guild's configured repo (from `HARMUS_REPOS` env var) with permission checks from Discord role IDs (from `HARMUS_ROLE_*` env vars).

Responses are chunked to Discord's 2000-char limit via `chunkText()`.
