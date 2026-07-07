import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { ToolCallLogEntry } from "../log-entry.js";
import { DiffViewer } from "./DiffViewer.js";

export interface ToolCallLineProps {
  entry: ToolCallLogEntry;
}

const MAX_PREVIEW_LINES = 4;

export function ToolCallLine({ entry }: ToolCallLineProps): React.ReactElement {
  const argsSummary = summarizeInput(entry.input);

  return (
    <Box flexDirection="column" marginLeft={1}>
      <Box>
        <Text color="gray">{"\u2022 "}</Text>
        <Text color="yellow">{entry.toolName}</Text>
        {argsSummary ? <Text color="gray">{` ${argsSummary}`}</Text> : null}
        {!entry.result ? (
          <Box marginLeft={1}>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
          </Box>
        ) : null}
      </Box>
      {entry.diff && !entry.diff.isEmpty ? (
        <DiffViewer diff={entry.diff} maxLines={20} />
      ) : entry.result ? (
        <ResultPreview content={entry.result.content} isError={entry.result.isError} />
      ) : null}
    </Box>
  );
}

function ResultPreview({ content, isError }: { content: string; isError: boolean }): React.ReactElement {
  const lines = content.split("\n");
  const preview = lines.slice(0, MAX_PREVIEW_LINES);
  const remaining = lines.length - preview.length;

  return (
    <Box flexDirection="column" marginLeft={2}>
      {preview.map((line, i) => (
        <Text key={i} color={isError ? "red" : "gray"} dimColor={!isError}>
          {line || " "}
        </Text>
      ))}
      {remaining > 0 ? <Text dimColor>{`... (${remaining} more lines)`}</Text> : null}
    </Box>
  );
}

function summarizeInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (entries.length === 0) return "";
  return entries
    .map(([key, value]) => {
      const str = typeof value === "string" ? value : JSON.stringify(value);
      const truncated = str.length > 50 ? `${str.slice(0, 50)}...` : str;
      return `${key}=${truncated}`;
    })
    .join(" ");
}
