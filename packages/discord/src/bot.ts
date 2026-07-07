import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  type ChatInputCommandInteraction,
} from "discord.js";
import { loadDiscordConfig, validateDiscordConfig } from "./config.js";
import { commands } from "./commands/definitions.js";
import {
  handleAgentCommand,
  handleReviewCommand,
  handleSummarizeCommand,
  handleStatusCommand,
} from "./commands/handlers.js";

export async function startBot(): Promise<void> {
  const config = loadDiscordConfig();
  const errors = validateDiscordConfig(config);

  if (errors.length > 0) {
    console.error("Harmus Discord bot configuration errors:");
    for (const err of errors) console.error(`  • ${err}`);
    process.exitCode = 1;
    return;
  }

  // Register slash commands with Discord
  const rest = new REST().setToken(config.botToken);
  try {
    const route = config.guildId
      ? Routes.applicationGuildCommands(
          extractClientId(config.botToken),
          config.guildId,
        )
      : Routes.applicationCommands(extractClientId(config.botToken));

    await rest.put(route, { body: commands });
    console.log("✅ Slash commands registered");
  } catch (err) {
    console.warn("⚠️  Could not register slash commands:", (err as Error).message);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`✅ Harmus bot ready as ${c.user.tag}`);
    console.log(`   Repo: ${config.repoCwd}`);
    console.log(`   Model: ${config.model}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    await routeCommand(interaction, config);
  });

  await client.login(config.botToken);
}

async function routeCommand(
  interaction: ChatInputCommandInteraction,
  config: ReturnType<typeof loadDiscordConfig>,
): Promise<void> {
  try {
    switch (interaction.commandName) {
      case "plan":
        await handleAgentCommand(
          interaction,
          interaction.options.getString("goal", true),
          "plan",
          config,
          interaction.options.getString("model") ?? undefined,
        );
        break;

      case "build":
        await handleAgentCommand(
          interaction,
          interaction.options.getString("goal", true),
          "build",
          config,
          interaction.options.getString("model") ?? undefined,
        );
        break;

      case "review":
        await handleReviewCommand(
          interaction,
          interaction.options.getString("ref", true),
          config,
        );
        break;

      case "summarize":
        await handleSummarizeCommand(
          interaction,
          interaction.options.getString("target", true),
          config,
        );
        break;

      case "status":
        await handleStatusCommand(interaction, config);
        break;

      default:
        await interaction.reply({ content: "Unknown command", ephemeral: true });
    }
  } catch (err) {
    const msg = `❌ Unhandled error: ${(err as Error).message}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
}

/** Extract the client (application) ID from a Discord bot token. */
function extractClientId(token: string): string {
  try {
    return Buffer.from(token.split(".")[0]!, "base64").toString("utf-8");
  } catch {
    return "";
  }
}
