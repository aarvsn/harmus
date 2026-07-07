import React from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

export interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onToggleMode: () => void;
  disabled: boolean;
}

/**
 * Bottom input bar. Shift+Tab toggles Plan/Build mode (mirrors Claude Code's
 * convention) rather than the spec's Ctrl+Shift+P, since Shift+Tab doesn't
 * collide with terminal-emulator or OS-level shortcuts.
 */
export function InputBar({ value, onChange, onSubmit, onToggleMode, disabled }: InputBarProps): React.ReactElement {
  useInput((_input, key) => {
    if (key.tab && key.shift) {
      onToggleMode();
    }
  });

  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1}>
      <Text color="gray">{"> "}</Text>
      <TextInput value={value} onChange={onChange} onSubmit={onSubmit} focus={!disabled} />
    </Box>
  );
}
