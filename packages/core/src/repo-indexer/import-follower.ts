import { readFile } from "node:fs/promises";
import path from "node:path";
import { walkFiles } from "../tools/search-tools/walk.js";

export interface ImportEdge {
  from: string; // absolute path
  to: string; // absolute path (resolved) or raw specifier for external
  specifier: string; // raw import string
  isExternal: boolean;
}

export interface DependencyGraph {
  /** Absolute path → list of import edges leaving that file */
  edges: Map<string, ImportEdge[]>;
  /** External packages imported anywhere in the repo */
  externalPackages: Set<string>;
}

/**
 * Parses JS/TS import statements with a regex-based approach.
 * Handles static imports, dynamic imports, and require() calls.
 * Skips binary files and files > 1MB.
 */
const IMPORT_RE = /(?:^|[\s;(])(?:import|from|require)\s*\(?['"](.*?)['"]/gm;

function extractImportSpecifiers(source: string): string[] {
  const result: string[] = [];
  let match: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(source)) !== null) {
    const spec = match[1];
    if (spec) result.push(spec);
  }
  return result;
}

function isExternal(specifier: string): boolean {
  return !specifier.startsWith(".") && !specifier.startsWith("/") && !specifier.startsWith("@/");
}

const JS_TS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

export async function buildDependencyGraph(cwd: string): Promise<DependencyGraph> {
  const edges = new Map<string, ImportEdge[]>();
  const externalPackages = new Set<string>();

  for await (const filePath of walkFiles(cwd)) {
    const ext = path.extname(filePath);
    if (!JS_TS_EXTENSIONS.has(ext)) continue;

    let source: string;
    try {
      source = await readFile(filePath, "utf-8");
    } catch {
      continue;
    }

    const specifiers = extractImportSpecifiers(source);
    const fileEdges: ImportEdge[] = [];

    for (const specifier of specifiers) {
      if (isExternal(specifier)) {
        // Track top-level package name only (strip sub-path)
        const pkg = specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2).join("/")
          : specifier.split("/")[0]!;
        externalPackages.add(pkg);
        fileEdges.push({ from: filePath, to: pkg, specifier, isExternal: true });
      } else {
        // Resolve relative path
        const dir = path.dirname(filePath);
        let resolved = path.resolve(dir, specifier);
        // If no extension, try common ones
        if (!path.extname(resolved)) {
          resolved = await tryResolve(resolved);
        }
        fileEdges.push({ from: filePath, to: resolved, specifier, isExternal: false });
      }
    }

    if (fileEdges.length > 0) {
      edges.set(filePath, fileEdges);
    }
  }

  return { edges, externalPackages };
}

async function tryResolve(base: string): Promise<string> {
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
  ];
  const { access } = await import("node:fs/promises");
  for (const c of candidates) {
    try {
      await access(c);
      return c;
    } catch {
      /* try next */
    }
  }
  return base;
}

/** Find all files that directly import a given target file. */
export function findImporters(graph: DependencyGraph, targetPath: string): string[] {
  const importers: string[] = [];
  for (const [file, fileEdges] of graph.edges) {
    if (fileEdges.some((e) => e.to === targetPath)) {
      importers.push(file);
    }
  }
  return importers;
}

/** Find all transitive dependencies of a file (files it imports, recursively). */
export function transitiveDeps(
  graph: DependencyGraph,
  startPath: string,
  visited = new Set<string>(),
): Set<string> {
  if (visited.has(startPath)) return visited;
  visited.add(startPath);
  for (const edge of graph.edges.get(startPath) ?? []) {
    if (!edge.isExternal) {
      transitiveDeps(graph, edge.to, visited);
    }
  }
  return visited;
}

/** Summarize the graph as a human-readable string (for injecting into system prompt). */
export function summarizeGraph(graph: DependencyGraph, cwd: string): string {
  const lines: string[] = [];
  const fileCount = graph.edges.size;
  const edgeCount = [...graph.edges.values()].reduce((s, e) => s + e.length, 0);
  lines.push(`Dependency graph: ${fileCount} files with ${edgeCount} import edges`);
  lines.push(`External packages: ${[...graph.externalPackages].join(", ")}`);

  // Show the most-imported (hub) files
  const importCounts = new Map<string, number>();
  for (const fileEdges of graph.edges.values()) {
    for (const edge of fileEdges) {
      if (!edge.isExternal) {
        importCounts.set(edge.to, (importCounts.get(edge.to) ?? 0) + 1);
      }
    }
  }
  const hubs = [...importCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([f, n]) => `  ${path.relative(cwd, f)} (imported ${n}x)`);

  if (hubs.length > 0) {
    lines.push("Most-imported files:");
    lines.push(...hubs);
  }

  return lines.join("\n");
}
