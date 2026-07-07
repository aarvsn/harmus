import React from "react";
import { Box, Text } from "ink";
import type { LogEntry } from "../log-entry.js";
import { ToolCallLine } from "./ToolCallLine.js";

export interface LogEntryViewProps {
  entry: LogEntry;
}

export function LogEntryView({ entry }: LogEntryViewProps): React.ReactElement {
  switch (entry.type) {
    case "user":
      return (
        <Box marginTop={1}>
          <Text color="cyan" bold>
            {"> "}
          </Text>
          <Text>{entry.text}</Text>
        </Box>
      );

    case "assistant_text":
      return (
        <Box marginTop={1}>
          <Text>{entry.text}</Text>
        </Box>
      );

    case "tool_call":
      return <ToolCallLine entry={entry} />;

    case "system": {
      const color = entry.level === "error" ? "red" : entry.level === "warn" ? "yellow" : "gray";
      return (
        <Box marginTop={1}>
          <Text color={color}>{entry.text}</Text>
        </Box>
      );
    }
  }
}
