import React from "react";
import { Box } from "ink";
import type { LogEntry } from "../log-entry.js";
import { LogEntryView } from "./LogEntryView.js";

export interface MessageListProps {
  log: LogEntry[];
}

export function MessageList({ log }: MessageListProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {log.map((entry) => (
        <LogEntryView key={entry.id} entry={entry} />
      ))}
    </Box>
  );
}
