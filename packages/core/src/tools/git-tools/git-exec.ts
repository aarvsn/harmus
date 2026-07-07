import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitResult {
  stdout: string;
  stderr: string;
}

/** Runs a git command inside `cwd`, returns stdout/stderr strings. Throws with stderr on non-zero exit. */
export async function runGit(args: string[], cwd: string): Promise<GitResult> {
  try {
    const result = await execFileAsync("git", args, { cwd });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (err: any) {
    const stderr: string = err.stderr ?? "";
    const stdout: string = err.stdout ?? "";
    throw new Error(stderr.trim() || stdout.trim() || err.message);
  }
}

/** Returns true if `cwd` is inside a git repository. */
export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await runGit(["rev-parse", "--git-dir"], cwd);
    return true;
  } catch {
    return false;
  }
}
