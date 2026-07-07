import { readdir } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  "__pycache__",
  ".venv",
]);

export interface WalkOptions {
  /** Max number of files to visit before stopping, to bound cost on huge repos. */
  maxFiles?: number;
  /** Skip directories whose name is in this set, in addition to the defaults. */
  extraIgnoredDirs?: Set<string>;
}

/**
 * Recursively yields absolute file paths under `root`, skipping common
 * noise directories. Used by both grep_files and find_files so they share
 * one definition of "what counts as repo content".
 */
export async function* walkFiles(root: string, options: WalkOptions = {}): AsyncGenerator<string> {
  const maxFiles = options.maxFiles ?? 50_000;
  let visited = 0;

  async function* recurse(dir: string): AsyncGenerator<string> {
    if (visited >= maxFiles) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // permission denied, symlink loop, etc - skip silently
    }

    for (const entry of entries) {
      if (visited >= maxFiles) return;

      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      if (DEFAULT_IGNORED_DIRS.has(entry.name)) continue;
      if (options.extraIgnoredDirs?.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        yield* recurse(fullPath);
      } else if (entry.isFile()) {
        visited++;
        yield fullPath;
      }
    }
  }

  yield* recurse(root);
}
