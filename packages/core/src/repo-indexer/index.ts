import { detectFrameworks, describeProfile, type RepoProfile } from "./framework-detector.js";
import { buildDependencyGraph, summarizeGraph, type DependencyGraph } from "./import-follower.js";

export * from "./framework-detector.js";
export * from "./import-follower.js";

export interface RepoIndex {
  cwd: string;
  profile: RepoProfile;
  graph: DependencyGraph;
  /** Human-readable summary suitable for injecting into an agent system prompt */
  summary: string;
  builtAt: Date;
}

/**
 * Builds a full repository index: detects frameworks, follows imports, and
 * produces a concise text summary for the agent's context window.
 */
export async function indexRepository(cwd: string): Promise<RepoIndex> {
  const [profile, graph] = await Promise.all([
    detectFrameworks(cwd),
    buildDependencyGraph(cwd),
  ]);

  const summary = [
    `Repository: ${cwd}`,
    describeProfile(profile),
    "",
    summarizeGraph(graph, cwd),
  ].join("\n");

  return { cwd, profile, graph, summary, builtAt: new Date() };
}
