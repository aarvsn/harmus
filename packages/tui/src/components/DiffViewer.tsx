import React from "react";
import { Box, Text } from "ink";
import type { UnifiedDiff } from "@harmus/core";

export interface DiffViewerProps {
  diff: UnifiedDiff;
  /** Max lines to show before truncating (default: 40) */
  maxLines?: number;
}

export function DiffViewer({ diff, maxLines = 40 }: DiffViewerProps): React.ReactElement {
  if (diff.isEmpty) {
    return <Text dimColor>(no changes)</Text>;
  }

  const displayLines = diff.lines.slice(0, maxLines);
  const truncated = diff.lines.length > maxLines;

  return (
    <Box flexDirection="column" marginLeft={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>{diff.path}</Text>
        <Text color="green">  +{diff.additions}</Text>
        <Text color="red">  -{diff.deletions}</Text>
      </Box>

      {displayLines.map((line, idx) => {
        switch (line.type) {
          case "header":
            return (
              <Text key={idx} color="cyan" dimColor>
                {line.content}
              </Text>
            );
          case "added":
            return (
              <Text key={idx} color="green">
                {"+" + line.content}
              </Text>
            );
          case "removed":
            return (
              <Text key={idx} color="red">
                {"-" + line.content}
              </Text>
            );
          case "context":
            return (
              <Text key={idx} dimColor>
                {" " + line.content}
              </Text>
            );
          default:
            return null;
        }
      })}

      {truncated && (
        <Text dimColor>{`... (${diff.lines.length - maxLines} more lines — use git_diff to see full diff)`}</Text>
      )}
    </Box>
  );
}
