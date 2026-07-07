# Contributing to Harmus

Thank you for your interest in contributing. This document covers how to get set up, the project structure, and how to submit changes.

## Development Setup

**Requirements:** Node.js ≥ 22, npm ≥ 10

```bash
git clone https://github.com/aarvsn/harmus.git
cd harmus
npm install        # installs all workspace deps
npm run build      # compiles all packages
npm test           # runs all 300+ tests
```

## Project Structure

This is an npm workspace monorepo. Each package under `packages/` compiles independently to its own `dist/`.

| Package | Description |
|---------|-------------|
| `@harmus/core` | Provider abstraction, tool engine, agent loop, plugins |
| `@harmus/cli` | `harmus plan/build/implement` CLI |
| `@harmus/tui` | Ink-based terminal UI |
| `@harmus/discord` | Discord bot |

## Making Changes

### Adding a Tool

Tools live in `packages/core/src/tools/`. Create a new file implementing `ToolDefinition<TInput>`:

```typescript
import { z } from "zod";
import type { ToolDefinition } from "../../types/tool.js";

export const myTool: ToolDefinition<{ query: string }> = {
  name: "my_tool",
  description: "What this tool does",
  mutates: false,         // true if it writes files or runs commands
  schema: z.object({ query: z.string() }),
  async execute(input, ctx) {
    return { content: `result for ${input.query}` };
  },
};
```

Then export it from the appropriate `index.ts` barrel and add it to the relevant `*_TOOLS` array.

### Adding a Provider

Providers live in `packages/core/src/providers/`. If your provider uses the OpenAI-compatible API, use `OpenAICompatibleProvider`:

```typescript
export function createMyProvider(apiKey?: string) {
  return new OpenAICompatibleProvider({
    providerId: "myprovider",
    providerName: "My Provider",
    baseURL: "https://api.myprovider.com/v1",
    apiKey,
    envVar: "MY_PROVIDER_API_KEY",
  });
}
```

Register it in `default-registry.ts`.

### Adding a Plugin

See the [Plugin System](README.md#plugin-system) section of the README.

## Testing

Every new file should have a corresponding `__tests__/*.test.ts` file. We use Node's built-in test runner (`node:test`).

```bash
# Run a single test file
cd packages/core
node --import tsx --test src/tools/my-tool/__tests__/my-tool.test.ts

# Run an entire package
cd packages/core
node --import tsx --test "src/**/__tests__/*.test.ts"
```

Tests that touch the filesystem should use a `mkdtemp` temp directory and clean up in a `finally` block.

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes with tests
4. Run `npm run build && npm test` from the root — all packages must pass
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, etc.
6. Open a PR against `main`

CI will run on your PR automatically. PRs without tests or that break existing tests will not be merged.

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | When to use |
|--------|-------------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Code change without feature/fix |
| `test:` | Test-only changes |
| `chore:` | Build system, CI, dependencies |
| `perf:` | Performance improvement |

Example: `feat(tools): add create_jira_ticket tool`

Breaking changes: append `!` and describe in the commit body with `BREAKING CHANGE:`.

## Code Style

- TypeScript strict mode, no `any` unless unavoidable
- ESM modules (`"type": "module"`)
- No default exports — named exports only
- Imports use `.js` extension even for `.ts` source files (Node ESM resolution)
- Async/await preferred over `.then()`

## Releasing

Releases are automated via GitHub Actions. Maintainers merge to `main`; the release workflow picks up `feat:` and `fix:` commits and publishes a new version automatically. You do not need to bump versions manually.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
