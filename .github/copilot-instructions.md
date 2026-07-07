# Harmus — AI Coding Assistant Instructions

## Project Overview

Harmus is an autonomous coding agent written in TypeScript. It is a **monorepo** using npm workspaces under `packages/`:

- `@harmus/core` — all shared logic: providers, tools, agent loop, plugins
- `@harmus/cli` — `harmus plan/build/implement` commands
- `@harmus/tui` — Ink-based terminal UI
- `@harmus/discord` — Discord bot

## Key Conventions

### TypeScript
- Strict mode, no implicit `any`
- ESM modules: `"type": "module"` in all package.json files
- Import paths use `.js` extension even for `.ts` source (Node ESM)
- Named exports only — no default exports

### Testing
- Use `node:test` (built-in), not Jest or Vitest
- Test files: `src/**/__tests__/*.test.ts`
- Filesystem tests: always use `mkdtemp()` + `finally { await cleanup() }`
- Each test must be independent and deterministic

### Tools (in `@harmus/core`)
- Every tool implements `ToolDefinition<TInput>` from `types/tool.ts`
- `mutates: true` tools MUST check `ctx.mode === "plan"` and refuse
- `mutates: true` tools MUST call `ctx.requestApproval?.()` before writing
- `mutates: true` tools MUST call `ctx.journal?.recordEdit/Create/Delete()` after writing
- Path safety: all fs tools must use `resolveSafePath(ctx.cwd, input.path)`

### Providers
- All providers implement `Provider` from `providers/provider.ts`
- OpenAI-compatible providers should extend `OpenAICompatibleProvider`
- New providers must be registered in `providers/default-registry.ts`

### Agent Loop
- `runAgentLoop()` is in `agent/agent-loop.ts` — do not add provider-specific logic here
- `ToolRegistry.listForMode("plan")` automatically filters `mutates: true` tools

### Adding a new package
1. Create `packages/<name>/package.json` with `"name": "@harmus/<name>"`
2. Add `"type": "module"` and proper `exports`
3. Add it to the workspace array if it should appear in `npm test` at root
4. Add `@harmus/<name>` as a peer dep where needed

## Architecture Diagram

```
User
 │
 ├── harmus plan/build/implement  (@harmus/cli)
 ├── harmus-tui                   (@harmus/tui, Ink)
 └── Discord bot                  (@harmus/discord)
        │
        ▼
   runAgentLoop()                 (@harmus/core/agent)
        │
   ┌────┴─────┐
   │  Provider │   AnthropicProvider, OpenAIProvider, 10 more
   └────┬─────┘
        │
   ToolRegistry
        │
   ┌────┴──────────────────────────┐
   │  Tools                        │
   │  read_file, edit_file, ...    │
   │  git_status, git_commit, ...  │
   │  grep_files, find_symbol, ... │
   │  run_command                  │
   └───────────────────────────────┘
```
