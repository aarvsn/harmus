import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { useLiveModels } from "../hooks/useLiveModels.js";

export interface CommandPaletteProps {
  currentModel: string;
  currentProvider: string;
  onSelectModel: (model: string) => void;
  onSelectProvider: (providerId: string) => void;
  onClose: () => void;
}

type Tab = "model" | "provider";

const KNOWN_PROVIDERS = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "google", label: "Google Gemini" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "groq", label: "Groq" },
  { id: "together", label: "Together AI" },
  { id: "fireworks", label: "Fireworks AI" },
  { id: "xai", label: "xAI" },
  { id: "nvidia", label: "NVIDIA NIM" },
  { id: "moonshot", label: "Moonshot AI" },
  { id: "ollama", label: "Ollama (local)" },
  { id: "lmstudio", label: "LM Studio (local)" },
];

export function CommandPalette({
  currentModel,
  currentProvider,
  onSelectModel,
  onSelectProvider,
  onClose,
}: CommandPaletteProps): React.ReactElement {
  const [tab, setTab] = useState<Tab>("model");
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const { models: liveModels, loading } = useLiveModels();

  const modelIds =
    liveModels.length > 0
      ? liveModels.map((m) => m.id)
      : [
          "claude-sonnet-4-6",
          "claude-opus-4-7",
          "gpt-5-mini",
          "gemini-2.5-pro",
          "grok-3",
          "llama-3.3-70b-versatile",
        ];

  const filteredModels = modelIds.filter((m) => m.toLowerCase().includes(query.toLowerCase()));
  const filteredProviders = KNOWN_PROVIDERS.filter(
    (p) =>
      p.id.toLowerCase().includes(query.toLowerCase()) || p.label.toLowerCase().includes(query.toLowerCase()),
  );

  const items = tab === "model" ? filteredModels : filteredProviders.map((p) => p.id);
  const labels = tab === "model" ? filteredModels : filteredProviders.map((p) => `${p.id} — ${p.label}`);

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.tab && !key.shift) {
      setTab((t) => (t === "model" ? "provider" : "model"));
      setSelectedIdx(0);
      setQuery("");
      return;
    }
    if (key.upArrow) {
      setSelectedIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIdx((i) => Math.min(items.length - 1, i + 1));
      return;
    }
    if (key.return) {
      const item = items[selectedIdx];
      if (!item) return;
      if (tab === "model") onSelectModel(item);
      else onSelectProvider(item);
      onClose();
    }
  });

  const handleQueryChange = useCallback((val: string) => {
    setQuery(val);
    setSelectedIdx(0);
  }, []);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {tab === "model" ? "Select Model" : "Select Provider"}
        </Text>
        {loading && tab === "model" && (
          <Box marginLeft={1}>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text dimColor> fetching models.dev...</Text>
          </Box>
        )}
        <Text dimColor> Tab · ↑↓ · Enter · Esc</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">{"/ "}</Text>
        <TextInput value={query} onChange={handleQueryChange} onSubmit={() => {}} placeholder="Filter..." />
      </Box>

      <Box flexDirection="column">
        {labels.slice(0, 12).map((label, idx) => {
          const isSelected = idx === selectedIdx;
          const isCurrent = tab === "model" ? items[idx] === currentModel : items[idx] === currentProvider;
          return (
            <Box key={items[idx] ?? idx}>
              <Text color={isSelected ? "cyan" : isCurrent ? "green" : undefined}>
                {isSelected ? "▶ " : "  "}
                {label}
                {isCurrent ? " ✓" : ""}
              </Text>
            </Box>
          );
        })}
        {labels.length === 0 && <Text dimColor>(no matches)</Text>}
        {labels.length > 12 && <Text dimColor>{`  ... and ${labels.length - 12} more`}</Text>}
      </Box>
    </Box>
  );
}
