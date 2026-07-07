import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { AgentMode } from "../session-reducer.js";

export interface StatusLineProps {
  mode: AgentMode;
  model: string;
  providerId: string;
  isRunning: boolean;
}

export function StatusLine({ mode, model, providerId, isRunning }: StatusLineProps): React.ReactElement {
  const modeColor = mode === "plan" ? "blue" : "magenta";
  const modeLabel = mode === "plan" ? "PLAN" : "BUILD";

  return (
    <Box>
      <Text color={modeColor} bold>{` ${modeLabel} `}</Text>
      <Text dimColor>{providerId}/</Text>
      <Text dimColor>{model}</Text>
      {isRunning ? (
        <Box marginLeft={1}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text dimColor> working...</Text>
        </Box>
      ) : null}
    </Box>
  );
}
