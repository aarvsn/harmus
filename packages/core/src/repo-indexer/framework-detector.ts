import { readFile, access } from "node:fs/promises";
import path from "node:path";

export type FrameworkName =
  | "nextjs" | "react" | "vue" | "angular" | "svelte"
  | "express" | "nestjs" | "fastify" | "hono"
  | "python" | "django" | "flask" | "fastapi"
  | "go" | "rust" | "java" | "csharp" | "cpp" | "flutter"
  | "turborepo" | "nx"
  | "unknown";

export interface DetectedFramework {
  name: FrameworkName;
  confidence: "high" | "medium" | "low";
  evidence: string;
}

export interface RepoProfile {
  frameworks: DetectedFramework[];
  primaryLanguage: string;
  isMonorepo: boolean;
  packageManager: "npm" | "yarn" | "pnpm" | "bun" | "unknown";
  hasTypeScript: boolean;
  hasTesting: boolean;
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function readJsonSafe(p: string): Promise<Record<string, unknown> | null> {
  try { return JSON.parse(await readFile(p, "utf-8")); } catch { return null; }
}

export async function detectFrameworks(cwd: string): Promise<RepoProfile> {
  const pkg = await readJsonSafe(path.join(cwd, "package.json"));
  const deps = {
    ...(pkg?.["dependencies"] as Record<string, string> ?? {}),
    ...(pkg?.["devDependencies"] as Record<string, string> ?? {}),
  };

  const frameworks: DetectedFramework[] = [];

  // ─── JavaScript / TypeScript frameworks ───────────────────────────────────
  if (deps["next"]) {
    frameworks.push({ name: "nextjs", confidence: "high", evidence: "next in dependencies" });
  } else if (deps["react"] || deps["react-dom"]) {
    frameworks.push({ name: "react", confidence: "high", evidence: "react in dependencies" });
  }
  if (deps["vue"]) {
    frameworks.push({ name: "vue", confidence: "high", evidence: "vue in dependencies" });
  }
  if (deps["@angular/core"]) {
    frameworks.push({ name: "angular", confidence: "high", evidence: "@angular/core in dependencies" });
  }
  if (deps["svelte"]) {
    frameworks.push({ name: "svelte", confidence: "high", evidence: "svelte in dependencies" });
  }
  if (deps["@nestjs/core"]) {
    frameworks.push({ name: "nestjs", confidence: "high", evidence: "@nestjs/core in dependencies" });
  } else if (deps["express"]) {
    frameworks.push({ name: "express", confidence: "high", evidence: "express in dependencies" });
  }
  if (deps["fastify"]) {
    frameworks.push({ name: "fastify", confidence: "high", evidence: "fastify in dependencies" });
  }
  if (deps["hono"]) {
    frameworks.push({ name: "hono", confidence: "high", evidence: "hono in dependencies" });
  }

  // ─── Monorepo tools ───────────────────────────────────────────────────────
  if (deps["turbo"] || await fileExists(path.join(cwd, "turbo.json"))) {
    frameworks.push({ name: "turborepo", confidence: "high", evidence: "turbo.json or turbo dependency" });
  }
  if (deps["nx"] || await fileExists(path.join(cwd, "nx.json"))) {
    frameworks.push({ name: "nx", confidence: "high", evidence: "nx.json or nx dependency" });
  }

  // ─── Non-JS languages ─────────────────────────────────────────────────────
  if (await fileExists(path.join(cwd, "requirements.txt")) ||
      await fileExists(path.join(cwd, "pyproject.toml")) ||
      await fileExists(path.join(cwd, "setup.py"))) {
    frameworks.push({ name: "python", confidence: "high", evidence: "requirements.txt / pyproject.toml" });
  }
  if (await fileExists(path.join(cwd, "go.mod"))) {
    frameworks.push({ name: "go", confidence: "high", evidence: "go.mod" });
  }
  if (await fileExists(path.join(cwd, "Cargo.toml"))) {
    frameworks.push({ name: "rust", confidence: "high", evidence: "Cargo.toml" });
  }
  if (await fileExists(path.join(cwd, "pom.xml")) || await fileExists(path.join(cwd, "build.gradle"))) {
    frameworks.push({ name: "java", confidence: "high", evidence: "pom.xml / build.gradle" });
  }
  if (await fileExists(path.join(cwd, "pubspec.yaml"))) {
    frameworks.push({ name: "flutter", confidence: "high", evidence: "pubspec.yaml" });
  }

  // ─── Package manager ──────────────────────────────────────────────────────
  let packageManager: RepoProfile["packageManager"] = "unknown";
  if (await fileExists(path.join(cwd, "bun.lockb"))) packageManager = "bun";
  else if (await fileExists(path.join(cwd, "pnpm-lock.yaml"))) packageManager = "pnpm";
  else if (await fileExists(path.join(cwd, "yarn.lock"))) packageManager = "yarn";
  else if (await fileExists(path.join(cwd, "package-lock.json"))) packageManager = "npm";

  // ─── Misc detection ───────────────────────────────────────────────────────
  const hasTypeScript = !!deps["typescript"] || await fileExists(path.join(cwd, "tsconfig.json"));
  const hasTesting = !!(deps["jest"] || deps["vitest"] || deps["mocha"] || deps["@playwright/test"]);
  const isMonorepo = !!(
    (pkg?.["workspaces"]) ||
    frameworks.some((f) => f.name === "turborepo" || f.name === "nx")
  );

  const primaryLanguage = frameworks.some((f) => f.name === "python") ? "python"
    : frameworks.some((f) => f.name === "go") ? "go"
    : frameworks.some((f) => f.name === "rust") ? "rust"
    : frameworks.some((f) => f.name === "java") ? "java"
    : frameworks.some((f) => f.name === "flutter") ? "dart"
    : pkg ? (hasTypeScript ? "typescript" : "javascript")
    : "unknown";

  return { frameworks, primaryLanguage, isMonorepo, packageManager, hasTypeScript, hasTesting };
}

export function describeProfile(profile: RepoProfile): string {
  const lines: string[] = [];
  if (profile.frameworks.length > 0) {
    lines.push(`Frameworks: ${profile.frameworks.map((f) => f.name).join(", ")}`);
  }
  lines.push(`Language: ${profile.primaryLanguage}`);
  if (profile.isMonorepo) lines.push("Monorepo: yes");
  if (profile.packageManager !== "unknown") lines.push(`Package manager: ${profile.packageManager}`);
  if (profile.hasTypeScript) lines.push("TypeScript: yes");
  if (profile.hasTesting) lines.push("Testing: yes");
  return lines.join("\n");
}
