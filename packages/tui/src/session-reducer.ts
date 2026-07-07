import type { LogEntry, ToolCallLogEntry } from "./log-entry.js";
import { nextLogId } from "./log-entry.js";

export type AgentMode = "plan" | "build";

export interface SessionState {
  mode: AgentMode;
  log: LogEntry[];
  isRunning: boolean;
  model: string;
  providerId: string;
}

export type SessionAction =
  | { type: "submit_user_message"; text: string }
  | { type: "set_mode"; mode: AgentMode }
  | { type: "set_model"; model: string }
  | { type: "set_provider"; providerId: string }
  | { type: "clear_context" }
  | { type: "agent_start" }
  | { type: "assistant_text"; text: string }
  | { type: "tool_start"; toolCallId: string; toolName: string; input: Record<string, unknown> }
  | {
      type: "tool_end";
      toolCallId: string;
      content: string;
      isError: boolean;
      diff?: import("@harmus/core").UnifiedDiff;
    }
  | { type: "system_message"; text: string; level?: "info" | "error" | "warn" }
  | { type: "agent_end" };

export function createInitialState(
  model: string,
  mode: AgentMode = "build",
  providerId = "anthropic",
): SessionState {
  return { mode, log: [], isRunning: false, model, providerId };
}

/**
 * Pure reducer driving all TUI session state. Kept framework-agnostic
 * (no React/Ink imports) so the state machine can be tested in isolation
 * from rendering.
 */
export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "submit_user_message":
      return {
        ...state,
        log: [...state.log, { type: "user", id: nextLogId("user"), text: action.text }],
      };

    case "set_mode":
      return { ...state, mode: action.mode };

    case "set_model":
      return { ...state, model: action.model };

    case "set_provider":
      return { ...state, providerId: action.providerId };

    case "clear_context":
      return {
        ...state,
        log: [
          ...state.log,
          { type: "system", id: nextLogId("sys"), text: "Context cleared.", level: "info" },
        ],
      };

    case "agent_start":
      return { ...state, isRunning: true };

    case "agent_end":
      return { ...state, isRunning: false };

    case "assistant_text":
      return {
        ...state,
        log: [...state.log, { type: "assistant_text", id: nextLogId("asst"), text: action.text }],
      };

    case "tool_start": {
      const entry: ToolCallLogEntry = {
        type: "tool_call",
        id: action.toolCallId,
        toolName: action.toolName,
        input: action.input,
      };
      return { ...state, log: [...state.log, entry] };
    }

    case "tool_end": {
      const log = state.log.map((entry): LogEntry => {
        if (entry.type === "tool_call" && entry.id === action.toolCallId) {
          return {
            ...entry,
            result: { content: action.content, isError: action.isError },
            ...(action.diff ? { diff: action.diff } : {}),
          };
        }
        return entry;
      });
      return { ...state, log };
    }

    case "system_message":
      return {
        ...state,
        log: [
          ...state.log,
          { type: "system", id: nextLogId("sys"), text: action.text, level: action.level ?? "info" },
        ],
      };

    default:
      return state;
  }
}
