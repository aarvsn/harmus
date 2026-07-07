import React, { useCallback, useReducer, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import {
  ToolRegistry,
  runAgentLoop,
  ALL_TOOLS,
  userText,
  computeDiff,
  type Provider,
  type Message,
} from "@harmus/core";
import { sessionReducer, createInitialState, type AgentMode } from "../session-reducer.js";
import { MessageList } from "./MessageList.js";
import { StatusLine } from "./StatusLine.js";
import { InputBar } from "./InputBar.js";
import { CommandPalette } from "./CommandPalette.js";

export interface AppProps {
  provider: Provider;
  model: string;
  cwd: string;
  initialMode?: AgentMode;
  providerId?: string;
}

const SYSTEM_PROMPT = (mode: AgentMode) =>
  mode === "plan"
    ? "You are Harmus, an autonomous coding agent currently in Plan Mode. " +
      "You can read and search the repository but cannot modify any files or run commands. " +
      "Investigate as needed, then produce a clear step-by-step plan for the requested change."
    : "You are Harmus, an autonomous coding agent currently in Build Mode. " +
      "You can read, search, edit, and create files, and run shell commands. " +
      "Make the requested change directly and explain what you changed when done.";

export function App({
  provider,
  model,
  cwd,
  initialMode = "build",
  providerId = "anthropic",
}: AppProps): React.ReactElement {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(
    sessionReducer,
    createInitialState(model, initialMode, providerId),
  );
  const [inputValue, setInputValue] = useState("");
  const [showPalette, setShowPalette] = useState(false);

  const historyRef = useRef<Message[]>([]);
  const toolRegistryRef = useRef(new ToolRegistry(ALL_TOOLS));

  useInput((input, key) => {
    if (key.ctrl && input === "c") { exit(); return; }
    if (key.ctrl && input === "k") { if (!state.isRunning) setShowPalette((v) => !v); return; }
    if (key.ctrl && input === "l") {
      if (!state.isRunning) {
        historyRef.current.splice(0);
        dispatch({ type: "clear_context" });
      }
      return;
    }
  });

  const handleToggleMode = useCallback(() => {
    if (state.isRunning) return;
    dispatch({ type: "set_mode", mode: state.mode === "plan" ? "build" : "plan" });
  }, [state.isRunning, state.mode]);

  const handleSubmit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || state.isRunning) return;

      setInputValue("");
      dispatch({ type: "submit_user_message", text: trimmed });
      historyRef.current.push(userText(trimmed));
      dispatch({ type: "agent_start" });

      try {
        const result = await runAgentLoop(historyRef.current, {
          provider,
          model: state.model,
          cwd,
          mode: state.mode,
          system: SYSTEM_PROMPT(state.mode),
          tools: toolRegistryRef.current,
          onToolStart: (block) => {
            dispatch({
              type: "tool_start",
              toolCallId: block.id,
              toolName: block.name,
              input: block.input,
            });
          },
          onToolEnd: (block, content, isError) => {
            // edit_file embeds a diff in its result — extract and store it
            let diff;
            if (block.name === "edit_file" && !isError) {
              const pathInput = (block.input as Record<string, unknown>).path;
              const oldStr = (block.input as Record<string, unknown>).oldStr;
              const newStr = (block.input as Record<string, unknown>).newStr ?? "";
              if (typeof pathInput === "string" && typeof oldStr === "string") {
                // Reconstruct diff from input directly (avoids re-reading the file)
                const fakeOld = String(oldStr);
                const fakeNew = String(newStr);
                diff = computeDiff(pathInput, fakeOld, fakeNew);
              }
            }
            dispatch({ type: "tool_end", toolCallId: block.id, content, isError, diff });
          },
        });

        for (const message of result.messages) {
          if (message.role !== "assistant") continue;
          for (const block of message.content) {
            if (block.type === "text" && block.text.trim()) {
              dispatch({ type: "assistant_text", text: block.text });
            }
          }
        }

        if (result.stopReason === "max_iterations") {
          dispatch({
            type: "system_message",
            text: `Stopped after ${result.iterations} iterations without finishing.`,
            level: "warn",
          });
        } else if (result.stopReason === "max_tokens") {
          dispatch({
            type: "system_message",
            text: "Response was cut off (max tokens reached).",
            level: "warn",
          });
        }
      } catch (err) {
        dispatch({ type: "system_message", text: (err as Error).message, level: "error" });
      } finally {
        dispatch({ type: "agent_end" });
      }
    },
    [provider, state.model, state.mode, state.isRunning, cwd],
  );

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">Harmus</Text>
        <Text dimColor> — autonomous coding agent</Text>
      </Box>

      {showPalette ? (
        <CommandPalette
          currentModel={state.model}
          currentProvider={state.providerId}
          onSelectModel={(m) => dispatch({ type: "set_model", model: m })}
          onSelectProvider={(p) => dispatch({ type: "set_provider", providerId: p })}
          onClose={() => setShowPalette(false)}
        />
      ) : (
        <MessageList log={state.log} />
      )}

      <Box marginTop={1} flexDirection="column">
        <StatusLine
          mode={state.mode}
          model={state.model}
          providerId={state.providerId}
          isRunning={state.isRunning}
        />
        <InputBar
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          onToggleMode={handleToggleMode}
          disabled={state.isRunning}
        />
        <Text dimColor>Shift+Tab: mode · Ctrl+K: model · Ctrl+L: clear · Ctrl+C: quit</Text>
      </Box>
    </Box>
  );
}
