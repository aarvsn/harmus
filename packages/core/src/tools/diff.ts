/**
 * Minimal unified diff implementation (no external dep).
 * Produces the same format as `diff -u`: @@ headers, -/+ lines, context.
 * Used by the TUI diff viewer and the edit_file tool's preview mode.
 */

export interface DiffLine {
  type: "context" | "added" | "removed" | "header";
  content: string;
  lineNo?: { before?: number; after?: number };
}

export interface UnifiedDiff {
  path: string;
  lines: DiffLine[];
  additions: number;
  deletions: number;
  isEmpty: boolean;
}

const CONTEXT_LINES = 3;

export function computeDiff(path: string, before: string, after: string): UnifiedDiff {
  if (before === after) {
    return { path, lines: [], additions: 0, deletions: 0, isEmpty: true };
  }

  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const editScript = lcs(beforeLines, afterLines);
  const hunks = buildHunks(editScript, beforeLines, afterLines);
  const lines: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;

  for (const hunk of hunks) {
    lines.push({ type: "header", content: hunk.header });
    for (const dl of hunk.lines) {
      lines.push(dl);
      if (dl.type === "added") additions++;
      if (dl.type === "removed") deletions++;
    }
  }

  return { path, lines, additions, deletions, isEmpty: lines.length === 0 };
}

export function formatDiff(diff: UnifiedDiff): string {
  if (diff.isEmpty) return "(no changes)";
  const out: string[] = [`--- ${diff.path}`, `+++ ${diff.path}`];
  for (const line of diff.lines) {
    switch (line.type) {
      case "header":
        out.push(line.content);
        break;
      case "added":
        out.push(`+${line.content}`);
        break;
      case "removed":
        out.push(`-${line.content}`);
        break;
      case "context":
        out.push(` ${line.content}`);
        break;
    }
  }
  return out.join("\n");
}

// ─── LCS-based diff algorithm ─────────────────────────────────────────────────

type EditType = "keep" | "add" | "remove";
interface Edit {
  type: EditType;
  beforeIdx?: number;
  afterIdx?: number;
  content: string;
}

function lcs(before: string[], after: string[]): Edit[] {
  const m = before.length;
  const n = after.length;

  // dp[i][j] = LCS length of before[0..i] and after[0..j]
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        before[i - 1] === after[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }

  // Traceback
  const edits: Edit[] = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && before[i - 1] === after[j - 1]) {
      edits.push({ type: "keep", beforeIdx: i - 1, afterIdx: j - 1, content: before[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      edits.push({ type: "add", afterIdx: j - 1, content: after[j - 1]! });
      j--;
    } else {
      edits.push({ type: "remove", beforeIdx: i - 1, content: before[i - 1]! });
      i--;
    }
  }
  return edits.reverse();
}

interface Hunk {
  header: string;
  lines: DiffLine[];
}

function buildHunks(edits: Edit[], before: string[], after: string[]): Hunk[] {
  // Find changed edit indices
  const changedAt = new Set<number>();
  for (let i = 0; i < edits.length; i++) {
    if (edits[i]!.type !== "keep") {
      for (let c = Math.max(0, i - CONTEXT_LINES); c <= Math.min(edits.length - 1, i + CONTEXT_LINES); c++) {
        changedAt.add(c);
      }
    }
  }

  if (changedAt.size === 0) return [];

  // Group contiguous changed indices into hunks
  const ranges: Array<{ start: number; end: number }> = [];
  let rangeStart = -1;
  const sortedChanged = [...changedAt].sort((a, b) => a - b);
  for (const idx of sortedChanged) {
    if (rangeStart === -1) {
      rangeStart = idx;
    } else if (idx > (ranges[ranges.length - 1]?.end ?? -1) + 1) {
      ranges.push({ start: rangeStart, end: idx - 1 });
      rangeStart = idx;
    }
    if (!ranges.length || ranges[ranges.length - 1]!.end < idx) {
      if (rangeStart !== -1 && (ranges.length === 0 || ranges[ranges.length - 1]!.start !== rangeStart)) {
        // extend last range or start new
      }
    }
  }
  if (rangeStart !== -1) ranges.push({ start: rangeStart, end: sortedChanged[sortedChanged.length - 1]! });

  return ranges.map(({ start, end }) => {
    const hunkEdits = edits.slice(start, end + 1);
    const beforeStart = hunkEdits.find((e) => e.beforeIdx !== undefined)?.beforeIdx ?? 0;
    const afterStart = hunkEdits.find((e) => e.afterIdx !== undefined)?.afterIdx ?? 0;
    const beforeCount = hunkEdits.filter((e) => e.type === "keep" || e.type === "remove").length;
    const afterCount = hunkEdits.filter((e) => e.type === "keep" || e.type === "add").length;

    const header = `@@ -${beforeStart + 1},${beforeCount} +${afterStart + 1},${afterCount} @@`;
    const lines: DiffLine[] = hunkEdits.map((edit, ei) => {
      const beforeLineNo = edit.type !== "add" ? edit.beforeIdx : undefined;
      const afterLineNo = edit.type !== "remove" ? edit.afterIdx : undefined;
      return {
        type: edit.type === "keep" ? "context" : edit.type === "add" ? "added" : "removed",
        content: edit.content,
        lineNo: {
          before: beforeLineNo !== undefined ? beforeLineNo + 1 : undefined,
          after: afterLineNo !== undefined ? afterLineNo + 1 : undefined,
        },
      };
    });

    return { header, lines };
  });
}
