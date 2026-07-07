<div align="center">

# Harmus

**Autonomous coding agent for your terminal.**

[![CI](https://github.com/aarvsn/harmus/actions/workflows/ci.yml/badge.svg)](https://github.com/aarvsn/harmus/actions/workflows/ci.yml)
[![Release](https://github.com/aarvsn/harmus/actions/workflows/release.yml/badge.svg)](https://github.com/aarvsn/harmus/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/@harmus/cli.svg)](https://www.npmjs.com/package/@harmus/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)

[Installation](#installation) · [Quick Start](#quick-start) · [Documentation](#documentation) · [Providers](#providers) · [Contributing](#contributing)

</div>

---

Harmus is a terminal-native autonomous coding agent. It reads your entire codebase, forms a plan, and executes changes — one tool call at a time, with full transparency and your approval at every step.

```
$ harmus implement "add rate limiting to the auth endpoints"

Planning  (Plan Mode — no files will be modified)

  • list_directory path=.
  • grep_files pattern=rateLimiter
  • read_file path=src/middleware/auth.ts
  • find_symbol name=authMiddleware

Here is my plan:
  1. Install express-rate-limit (already in devDependencies as unused)
  2. Create src/middleware/rate-limiter.ts with a 100req/15min window
  3. Apply to /auth routes in src/routes/auth.ts
  4. Add integration test in tests/auth.test.ts

Proceed? [a]pprove / [e]dit goal / [r]eject > a

Building  (Build Mode — files may be modified)

  • edit_file path=src/middleware/rate-limiter.ts  +24/-0
  • edit_file path=src/routes/auth.ts  +3/-1
  • write_file path=tests/auth.rate-limit.test.ts  52 lines
  • run_command npm test -- --grep "rate limit"  ✓

Done. 3 files changed, 79 insertions.
```

## Features

- **Plan → Approve → Build** — inspect the full plan before a single file is touched
- **Real repository understanding** — reads imports, builds dependency graphs, detects frameworks
- **12 providers** — Anthropic, OpenAI, Gemini, Groq, Together, Fireworks, xAI, OpenRouter, NVIDIA, Moonshot, Ollama, LM Studio
- **75+ models** — live registry from [models.dev](https://models.dev), per-role assignment
- **Full terminal UI** — chat, file explorer, logs panel, diff viewer, model selector
- **Git-native** — status, diff, commit, branch, and PR creation built in
- **Change journal** — every edit is tracked; revert any individual change or all of them
- **Per-edit approval gate** — optionally prompt before each file mutation
- **Context auto-compaction** — summarizes old messages when context grows large
- **Architectural memory** — persistent structural understanding across sessions
- **Discord bot** — `/plan`, `/build`, `/review`, `/summarize` slash commands
- **Plugin system** — add custom tools, providers, and lifecycle hooks
- **Vision input** — attach screenshots, mockups, and error images

## Installation

### macOS / Linux (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/aarvsn/harmus/main/install.sh | bash
```

This installs the `harmus` binary to `/usr/local/bin` and sets up shell completions.

### Windows

Download and run [harmus-init.exe](https://github.com/aarvsn/harmus/releases/latest/download/harmus-init.exe) — it installs Node.js (if missing), the Harmus CLI, and adds it to your PATH automatically.

### npm / pnpm

```bash
npm install -g @harmus/cli
# or
pnpm add -g @harmus/cli
```

### Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 22 |
| npm | ≥ 10 |

## Quick Start

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# In any project directory:
cd your-project

# Plan only (no file changes)
harmus plan "add OAuth login with GitHub"

# Build directly
harmus build "fix the TypeScript error in src/auth.ts"

# Plan, review, then build
harmus implement "add rate limiting to the API"

# Use a different provider/model
harmus build "refactor the database layer" --provider groq --model llama-3.3-70b-versatile

# Assign different models per role
harmus implement "add search" --models "plan=claude-opus-4-7,build=gpt-5-mini"

# Attach a screenshot or mockup
harmus build "implement this UI" --image mockup.png

# Launch the interactive TUI
harmus-tui
```

## Documentation

### Commands

| Command | Description |
|---------|-------------|
| `harmus plan <goal>` | Analyze and produce a step-by-step plan. No files modified. |
| `harmus build <goal>` | Execute changes directly. |
| `harmus implement <goal>` | Plan first, show plan, build after approval. |

**Shared flags:**

| Flag | Description |
|------|-------------|
| `-m, --model <id>` | Model to use (e.g. `claude-opus-4-7`, `gpt-5-mini`) |
| `-p, --provider <id>` | Provider (anthropic, openai, google, groq, ollama, …) |
| `--models <spec>` | Per-role assignment: `plan=claude-opus-4-7,build=gpt-5-mini` |
| `--max-iterations <n>` | Cap on model↔tool round trips (default: 25) |
| `-i, --image <path>` | Attach image(s) for vision-capable models |
| `-y, --yes` | Skip approval prompt in `implement` |

### Providers

| ID | Name | Env var |
|----|------|---------|
| `anthropic` | Anthropic | `ANTHROPIC_API_KEY` |
| `openai` | OpenAI | `OPENAI_API_KEY` |
| `google` | Google Gemini | `GOOGLE_API_KEY` |
| `openrouter` | OpenRouter | `OPENROUTER_API_KEY` |
| `groq` | Groq | `GROQ_API_KEY` |
| `together` | Together AI | `TOGETHER_API_KEY` |
| `fireworks` | Fireworks AI | `FIREWORKS_API_KEY` |
| `xai` | xAI (Grok) | `XAI_API_KEY` |
| `nvidia` | NVIDIA NIM | `NVIDIA_API_KEY` |
| `moonshot` | Moonshot AI | `MOONSHOT_API_KEY` |
| `ollama` | Ollama (local) | *(none)* |
| `lmstudio` | LM Studio (local) | *(none)* |

### TUI Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Switch to logs panel |
| `Shift+Tab` | Toggle Plan/Build mode |
| `Ctrl+K` | Open model/provider selector |
| `Ctrl+P` | Open file explorer |
| `Ctrl+B` | Switch to Build Mode |
| `Ctrl+L` | Clear context |
| `Ctrl+C` | Quit |

### Tools

Harmus ships 16 built-in tools:

**File operations:** `read_file`, `write_file`, `edit_file`, `list_directory`, `revert_changes`  
**Search:** `grep_files`, `find_files`, `find_symbol`  
**Shell:** `run_command`  
**Git:** `git_status`, `git_diff`, `git_log`, `git_commit`, `git_branch`, `create_pr`

### Discord Bot

```bash
export DISCORD_BOT_TOKEN=...
export ANTHROPIC_API_KEY=...
export HARMUS_REPO_CWD=/path/to/your/repo

# Optional: role-based permissions
export HARMUS_ROLE_BUILD=1234567890   # Discord role ID
export HARMUS_ROLE_PLAN=9876543210

# Optional: per-guild repos
export HARMUS_REPOS=guildId1:/repos/project-a,guildId2:/repos/project-b

npx harmus-discord
```

**Slash commands:** `/plan`, `/build`, `/review`, `/summarize`, `/status`  
**Mentions:** `@Harmus add a health check` (defaults to build mode)

### Plugin System

```typescript
import { HarmusPlugin, ToolRegistry, ProviderRegistry } from "@harmus/core";

const jiraPlugin: HarmusPlugin = {
  id: "jira",
  name: "Jira Integration",
  version: "1.0.0",

  tools: [
    {
      name: "create_jira_ticket",
      description: "Creates a Jira ticket",
      mutates: true,
      schema: z.object({ summary: z.string(), description: z.string() }),
      execute: async (input) => { /* ... */ },
    },
  ],

  onAfterRun: async ({ goal, mode }) => {
    if (mode === "build") {
      await createTicket(`Harmus built: ${goal}`);
    }
  },
};
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `GOOGLE_API_KEY` | Google Gemini API key | — |
| `HARMUS_MODEL` | Default model | `claude-sonnet-4-6` |
| `HARMUS_REPO_CWD` | Repository path (Discord bot) | `process.cwd()` |
| `HARMUS_ROLE_ADMIN` | Discord role ID(s) for admin | — |
| `HARMUS_ROLE_BUILD` | Discord role ID(s) for build | — |
| `HARMUS_ROLE_PLAN` | Discord role ID(s) for plan | — |
| `HARMUS_REPOS` | Per-guild repo map (Discord) | — |

## Architecture

```
harmus/
├── packages/
│   ├── core/          # Provider abstraction, tool engine, agent loop
│   │   ├── src/
│   │   │   ├── types/           Message, ToolDefinition, ModelInfo
│   │   │   ├── providers/       12 providers + ModelRegistry + rate limiter
│   │   │   ├── tools/           16 built-in tools
│   │   │   ├── agent/           ToolRegistry, runAgentLoop, ModelRouter,
│   │   │   │                    ChangeJournal, ContextCompactor,
│   │   │   │                    ArchitecturalSummaryStore
│   │   │   ├── repo-indexer/    Framework detection, import following
│   │   │   ├── vision/          Image loading + base64 encoding
│   │   │   └── plugins/         HarmusPlugin interface + PluginRegistry
│   ├── cli/           # harmus plan / build / implement
│   ├── tui/           # Ink-based terminal UI
│   └── discord/       # Discord bot with slash commands + @mentions
```

## Contributing

Pull requests are welcome. For major changes, open an issue first.

```bash
git clone https://github.com/aarvsn/harmus.git
cd harmus
npm install
npm run build
npm test
```

**Running tests:**

```bash
# All packages
npm test

# Single package
cd packages/core && node --import tsx --test "src/**/__tests__/*.test.ts"
```

**Code style:** TypeScript strict mode, ESM modules, no default exports.

## License

[MIT](LICENSE) © 2026 [aarvsn](https://github.com/aarvsn)
