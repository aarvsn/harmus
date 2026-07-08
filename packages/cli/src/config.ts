export interface HarmusConfig {
  anthropicApiKey: string | undefined;
  defaultModel: string;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): HarmusConfig {
  return {
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    defaultModel: env.HARMUS_MODEL || DEFAULT_MODEL,
  };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Throws a clear, actionable error if required config is missing. */
export function requireApiKey(config: HarmusConfig): string {
  if (!config.anthropicApiKey) {
    throw new ConfigError(
      "No ANTHROPIC_API_KEY found in the environment.\n" + "Set it with: export ANTHROPIC_API_KEY=sk-ant-...",
    );
  }
  return config.anthropicApiKey;
}
