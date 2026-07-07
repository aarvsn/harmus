export interface DiscordConfig {
  botToken: string;
  guildId?: string;
  /** Default repo path the bot operates on */
  repoCwd: string;
  /** Default model */
  model: string;
  /** Anthropic API key for the agent */
  anthropicApiKey: string;
}

export function loadDiscordConfig(env: NodeJS.ProcessEnv = process.env): DiscordConfig {
  const botToken = env.DISCORD_BOT_TOKEN ?? "";
  const anthropicApiKey = env.ANTHROPIC_API_KEY ?? "";
  const repoCwd = env.HARMUS_REPO_CWD ?? process.cwd();
  const model = env.HARMUS_MODEL ?? "claude-sonnet-4-6";
  const guildId = env.DISCORD_GUILD_ID;

  return { botToken, anthropicApiKey, repoCwd, model, guildId };
}

export function validateDiscordConfig(config: DiscordConfig): string[] {
  const errors: string[] = [];
  if (!config.botToken) errors.push("DISCORD_BOT_TOKEN is required");
  if (!config.anthropicApiKey) errors.push("ANTHROPIC_API_KEY is required");
  return errors;
}
