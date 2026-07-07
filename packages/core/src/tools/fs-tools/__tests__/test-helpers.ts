import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { ToolExecutionContext } from "../../../types/tool.js";

export async function makeTempRepo(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "harmus-test-"));
}

export async function cleanupTempRepo(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export function buildCtx(cwd: string, mode: "plan" | "build" = "build"): ToolExecutionContext {
  return { cwd, mode };
}
