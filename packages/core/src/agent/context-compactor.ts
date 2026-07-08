import type { Message } from "../types/message.js";
import type { Provider } from "../providers/provider.js";

export interface CompactionOptions {
  /** Token estimate at which compaction triggers. Default: 80_000 */
  thresholdTokens?: number;
  /** How many recent messages to always preserve at full resolution. Default: 10 */
  preserveRecentCount?: number;
  /** Provider used to generate the summary. */
  provider: Provider;
  model: string;
}

/**
 * Rough token estimator: 1 token ≈ 4 chars of English text.
 * Good enough for triggering compaction; not used for billing.
 */
export function estimateTokens(messages: Message[]): number {
  let chars = 0;
  for (const msg of messages) {
    for (const block of msg.content) {
      if (block.type === "text") chars += block.text.length;
      else if (block.type === "tool_result") chars += block.content.length;
      else if (block.type === "tool_use") chars += JSON.stringify(block.input).length;
    }
  }
  return Math.ceil(chars / 4);
}

const COMPACTION_SYSTEM = `You are a conversation summarizer. You will receive a portion of a 
conversation between a developer and an AI coding agent. Produce a concise but complete summary 
that preserves:
- Every user goal and instruction (exact wording where important)
- Every approved plan and decision made
- Every file that was read, created, or modified (with their paths)
- Every command that was run and its outcome
- Any errors encountered and how they were resolved
- The current state of the codebase changes

Be detailed about technical specifics. Omit pleasantries. Use bullet points.`;

/**
 * Compacts a conversation history by summarizing old messages into a single
 * system-adjacent user message, keeping recent messages intact.
 *
 * The spec requires that compaction must never lose:
 * - User instructions
 * - Approved plans
 * - Current diffs
 * - Architectural summaries
 * - Open tasks
 *
 * We address this by asking the model to produce a detailed summary rather
 * than truncating blindly.
 */
export async function compactHistory(
  history: Message[],
  options: CompactionOptions,
): Promise<{ compacted: Message[]; summary: string; wasCompacted: boolean }> {
  const threshold = options.thresholdTokens ?? 80_000;
  const preserveCount = options.preserveRecentCount ?? 10;

  const estimated = estimateTokens(history);
  if (estimated < threshold) {
    return { compacted: history, summary: "", wasCompacted: false };
  }

  // Split: old messages to summarize, recent messages to keep verbatim.
  const splitAt = Math.max(0, history.length - preserveCount);
  const toSummarize = history.slice(0, splitAt);
  const toKeep = history.slice(splitAt);

  if (toSummarize.length === 0) {
    return { compacted: history, summary: "", wasCompacted: false };
  }

  // Build a readable transcript of the messages to be summarized
  const transcript = toSummarize
    .map((msg) => {
      const role = msg.role.toUpperCase();
      const text = msg.content
        .map((b) => {
          if (b.type === "text") return b.text;
          if (b.type === "tool_use") return `[Tool: ${b.name}(${JSON.stringify(b.input)})]`;
          if (b.type === "tool_result")
            return `[Result: ${b.content.slice(0, 500)}${b.content.length > 500 ? "..." : ""}]`;
          return "";
        })
        .filter(Boolean)
        .join("\n");
      return `${role}: ${text}`;
    })
    .join("\n\n---\n\n");

  const result = await options.provider.complete({
    model: options.model,
    system: COMPACTION_SYSTEM,
    messages: [{ role: "user", content: [{ type: "text", text: transcript }] }],
    maxTokens: 2048,
  });

  const summaryText = result.message.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

  const summaryMessage: Message = {
    role: "user",
    content: [
      {
        type: "text",
        text: `[Context summary — ${toSummarize.length} earlier messages compacted]\n\n${summaryText}`,
      },
    ],
  };

  return {
    compacted: [summaryMessage, ...toKeep],
    summary: summaryText,
    wasCompacted: true,
  };
}

/**
 * Wraps `compactHistory` for use inside the agent loop — checks if compaction
 * is needed and, if so, replaces the history array contents in place
 * (so callers keeping a reference to the same array stay in sync).
 */
export async function maybeCompact(history: Message[], options: CompactionOptions): Promise<string | null> {
  const { compacted, summary, wasCompacted } = await compactHistory(history, options);
  if (!wasCompacted) return null;

  // Replace contents in place so the caller's reference stays valid
  history.splice(0, history.length, ...compacted);
  return summary;
}
