# 1.0.0 (2026-07-08)


### Bug Fixes

* comprehensive CI stability and cross-platform fixes ([41944ba](https://github.com/aarvsn/harmus/commit/41944ba5ca4ace6ae12c4d07d5508c4cda4ca355))
* comprehensive CI stability, TypeScript, security, and test fixes ([77011e4](https://github.com/aarvsn/harmus/commit/77011e4c908694e619c6326455c45d3d3a65a26b)), closes [hi#severity](https://github.com/hi/issues/severity)
* resolve all CI failures, TS errors, and security vulnerabilities ([cf7b483](https://github.com/aarvsn/harmus/commit/cf7b4830ab571f95943c8c23de6feb9149191da9)), closes [hi#severity](https://github.com/hi/issues/severity)
* resolve CI failures and TypeScript strict mode errors ([4d4b9d1](https://github.com/aarvsn/harmus/commit/4d4b9d1284393a207d97e1e815e586766ab444ab))

# Changelog

All notable changes to Harmus are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases are automated from [Conventional Commits](https://www.conventionalcommits.org/) — this file is updated automatically by the release workflow.

---

## [Unreleased]

### Added
- Plan → Approve → Build workflow (`harmus implement`)
- Rate limiting with per-provider token buckets and exponential backoff
- `ChangeJournal` — per-session revert and partial-apply for every file mutation
- Per-edit approval gate (`requestApproval` in `ToolExecutionContext`)
- `revert_changes` tool — agent-accessible undo for individual or all changes
- `ArchitecturalSummaryStore` — persistent structural knowledge across compactions
- Plugin system (`HarmusPlugin`, `PluginRegistry`)
- Vision/image input via `--image` / `-i` CLI flag
- `find_symbol` tool — declaration-aware search across JS/TS/Python
- TUI file explorer panel (`Ctrl+P`)
- TUI logs panel (`Tab`)
- TUI model/provider selector (`Ctrl+K`) with live models.dev fetch
- Discord role-based permissions (`HARMUS_ROLE_*`)
- Discord per-guild repository registry (`HARMUS_REPOS`)
- Discord `@mention` handler
- C# and C++ framework detection
- Nested monorepo sub-package detection
- `ModelRouter.validateCompatibility()` — warns on mismatched model assignments
- Inline diff viewer in TUI for `edit_file` results
- 12 supported providers (Anthropic, OpenAI, Gemini, Groq, Together AI, Fireworks AI, xAI, NVIDIA NIM, Moonshot AI, OpenRouter, Ollama, LM Studio)
- `harmus implement` CLI command with interactive approval prompt
- `git_status`, `git_diff`, `git_log`, `git_commit`, `git_branch`, `create_pr` tools
- Context auto-compaction (`maybeCompact`)

### Packages
- `@harmus/core` — provider abstraction, tool engine, agent loop
- `@harmus/cli` — `harmus plan/build/implement` CLI
- `@harmus/tui` — Ink-based terminal UI (`harmus-tui`)
- `@harmus/discord` — Discord bot (`harmus-discord`)

---

*This project is pre-1.0. Breaking changes may occur between minor versions until v1.0.0 is tagged.*
