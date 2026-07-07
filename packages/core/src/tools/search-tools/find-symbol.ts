import { z } from "zod";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "../../types/tool.js";
import { resolveSafePath, PathSecurityError } from "../fs-tools/safe-path.js";
import { walkFiles } from "../search-tools/walk.js";

export interface SymbolMatch {
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  /** The raw declaration line */
  declaration: string;
}

export type SymbolKind =
  | "function" | "class" | "interface" | "type" | "enum"
  | "const" | "let" | "var" | "export";

/**
 * Language-agnostic symbol patterns. These intentionally cast a wide net —
 * they're for quick discovery, not perfect AST parsing.
 */
const SYMBOL_PATTERNS: Array<{ kind: SymbolKind; re: RegExp }> = [
  { kind: "function", re: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/ },
  { kind: "function", re: /^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?\(/ },
  { kind: "function", re: /^\s*(?:public|private|protected|static|async)*\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{/ },
  { kind: "class",     re: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/ },
  { kind: "interface", re: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][A-Za-z0-9_$]*)/ },
  { kind: "type",      re: /^\s*(?:export\s+)?type\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[=<]/ },
  { kind: "enum",      re: /^\s*(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][A-Za-z0-9_$]*)/ },
  { kind: "const",     re: /^\s*(?:export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[:=]/ },
];

const JS_TS_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const PY_EXTS    = new Set([".py"]);

const PYTHON_PATTERNS: Array<{ kind: SymbolKind; re: RegExp }> = [
  { kind: "function", re: /^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)/ },
  { kind: "class",    re: /^class\s+([A-Za-z_][A-Za-z0-9_]*)/ },
];

const FindSymbolSchema = z.object({
  name: z.string().describe("Symbol name to search for (substring match, case-insensitive)"),
  kind: z.enum(["function", "class", "interface", "type", "enum", "const", "any"])
    .optional()
    .describe("Filter by symbol kind (default: any)"),
  path: z.string().optional().describe("Directory to search within (default: repo root)"),
  maxResults: z.number().optional().describe("Max results to return (default: 50)"),
});

export type FindSymbolInput = z.infer<typeof FindSymbolSchema>;

export const findSymbolTool: ToolDefinition<FindSymbolInput> = {
  name: "find_symbol",
  description:
    "Find function, class, interface, type, enum, or const declarations by name across the repository. " +
    "Faster than grep_files for discovering where a symbol is defined. " +
    "Use this before editing to locate the exact file and line number.",
  mutates: false,
  schema: FindSymbolSchema,
  async execute(input, ctx) {
    try {
      const searchRoot = resolveSafePath(ctx.cwd, input.path ?? ".");
      const maxResults = input.maxResults ?? 50;
      const nameLower = input.name.toLowerCase();
      const kindFilter = input.kind === "any" ? undefined : input.kind;

      const matches: SymbolMatch[] = [];

      for await (const filePath of walkFiles(searchRoot)) {
        if (matches.length >= maxResults) break;
        const ext = path.extname(filePath);
        const patterns = JS_TS_EXTS.has(ext)
          ? SYMBOL_PATTERNS
          : PY_EXTS.has(ext)
          ? PYTHON_PATTERNS
          : null;

        if (!patterns) continue;

        const content = await readFile(filePath, "utf-8").catch(() => null);
        if (!content) continue;

        const lines = content.split("\n");
        for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
          const line = lines[i]!;
          for (const { kind, re } of patterns) {
            if (kindFilter && kind !== kindFilter) continue;
            const m = re.exec(line);
            if (m && m[1] && m[1].toLowerCase().includes(nameLower)) {
              matches.push({
                name: m[1],
                kind,
                file: path.relative(ctx.cwd, filePath),
                line: i + 1,
                declaration: line.trim().slice(0, 120),
              });
              break; // one match per line
            }
          }
        }
      }

      if (matches.length === 0) {
        return { content: `No symbols matching "${input.name}" found` };
      }

      const lines = matches.map(
        (m) => `${m.file}:${m.line}  [${m.kind}] ${m.name}\n    ${m.declaration}`,
      );

      const header = matches.length >= maxResults
        ? `First ${maxResults} symbol matches for "${input.name}":\n`
        : `${matches.length} symbol(s) matching "${input.name}":\n`;

      return { content: header + lines.join("\n") };
    } catch (err) {
      if (err instanceof PathSecurityError) {
        return { content: `Error: ${err.message}`, isError: true };
      }
      return { content: `Error: ${(err as Error).message}`, isError: true };
    }
  },
};
