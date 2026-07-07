/**
 * View-model types for the TUI's scrollback. These are distinct from
 * @harmus/core's `Message`/`ContentBlock` types: the agent loop speaks in
 * terms of provider messages, but the UI renders a flattened, append-only
 * log of discrete entries (one per user turn, assistant text chunk, tool
 * call, or system notice). `agentEventsToLogEntries` bridges the two.
 */

import type { UnifiedDiff } from "@harmus/core";

export interface UserLogEntry {
  type: "user";
  id: string;
  text: string;
}

export interface AssistantTextLogEntry {
  type: "assistant_text";
  id: string;
  text: string;
}

export interface ToolCallLogEntry {
  type: "tool_call";
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  result?: { content: string; isError: boolean };
  diff?: UnifiedDiff;
}

export interface SystemLogEntry {
  type: "system";
  id: string;
  text: string;
  level: "info" | "error" | "warn";
}

export type LogEntry = UserLogEntry | AssistantTextLogEntry | ToolCallLogEntry | SystemLogEntry;

let counter = 0;
/** Monotonic id generator for log entries - stable React keys, no collisions within a session. */
export function nextLogId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/** Reset the id counter - test-only, so each test starts from a known state. */
export function _resetLogIdCounterForTests(): void {
  counter = 0;
}
