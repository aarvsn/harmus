import path from "node:path";

export class PathSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathSecurityError";
  }
}

/**
 * Resolves a user/model-supplied path against the repository root,
 * refusing to allow escape via "../" traversal or absolute paths
 * pointing outside the root. All file tools must funnel paths through
 * this before touching the filesystem.
 */
export function resolveSafePath(root: string, requestedPath: string): string {
  const absoluteRoot = path.resolve(root);
  const resolved = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(absoluteRoot, requestedPath);

  const relative = path.relative(absoluteRoot, resolved);
  const escapesRoot = relative.startsWith("..") || path.isAbsolute(relative);

  if (escapesRoot) {
    throw new PathSecurityError(
      `Path "${requestedPath}" resolves outside the repository root (${absoluteRoot})`,
    );
  }

  return resolved;
}
