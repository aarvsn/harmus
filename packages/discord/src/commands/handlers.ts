import type { ChatInputCommandInteraction } from "discord.js";
import {
  AnthropicProvider,
  ToolRegistry,
  ALL_TOOLS,
  GIT_TOOLS,
  runAgentLoop,
  userText,
  type Message,
  type AgentMode,
} from "@harmus/core";
import type { DiscordConfig } from "../config.js";

const SYSTEM_PLAN =
  "You are Harmus, an autonomous coding agent in Plan Mode. " +
  "You can read and search the repository but cannot modify files or run commands. " +
  "Investigate the codebase then produce a clear, numbered plan for the requested change.";

const SYSTEM_BUILD =
  "You are Harmus, an autonomous coding agent in Build Mode. " +
  "You can read, search, edit, create files, run shell commands, and commit changes. " +
  "Make the requested change, explain what you changed, and note any caveats.";

const DISCORD_MAX_LENGTH = 1900; // Discord message limit minus some buffer

/**
 * Runs an agent session for a Discord slash command, streaming progress back
 * to the thread as the agent works. Uses a dedicated thread per command to
 * avoid cluttering the channel with long outputs.
 */
export async function handleAgentCommand(
  interaction: ChatInputCommandInteraction,
  goal: string,
  mode: AgentMode,
  config: DiscordConfig,
  modelOverride?: string,
): Promise<void> {
  await interaction.deferReply();

  const provider = new AnthropicProvider({ apiKey: config.anthropicApiKey });
  const model = modelOverride ?? config.model;
  const registry = new ToolRegistry(ALL_TOOLS);

  const modeLabel = mode === "plan" ? "📋 Planning" : "🔨 Building";
  const header = `**${modeLabel}:** ${goal}\n**Model:** \`${model}\`\n**Repo:** \`${config.repoCwd}\`\n\n`;

  let progress = header;
  const toolLines: string[] = [];

  const history: Message[] = [userText(goal)];

  try {
    const result = await runAgentLoop(history, {
      provider,
      model,
      cwd: config.repoCwd,
      mode,
      system: mode === "plan" ? SYSTEM_PLAN : SYSTEM_BUILD,
      tools: registry,
      onToolStart: (block) => {
        const line = `⚙️ \`${block.name}\`${summarizeInput(block.input)}`;
        toolLines.push(line);
      },
      onToolEnd: (_block, content, isError) => {
        const preview = content.split("\n").slice(0, 2).join(" ").slice(0, 80);
        const last = toolLines[toolLines.length - 1];
        if (last !== undefined) {
          toolLines[toolLines.length - 1] = `${last} ${isError ? "❌" : "✅"} ${preview}`;
        }
      },
    });

    // Collect final assistant text
    let finalText = "";
    for (const msg of result.messages) {
      if (msg.role !== "assistant") continue;
      for (const block of msg.content) {
        if (block.type === "text") finalText += block.text;
      }
    }

    const toolSummary = toolLines.length > 0 ? `**Tools used:**\n${toolLines.slice(-10).join("\n")}\n\n` : "";

    const fullResponse = toolSummary + finalText;

    // Discord limits messages to 2000 chars — chunk if needed
    const chunks = chunkText(fullResponse, DISCORD_MAX_LENGTH);
    await interaction.editReply(header + (chunks[0] ?? "(no response)"));
    for (const chunk of chunks.slice(1)) {
      await interaction.followUp(chunk);
    }
  } catch (err) {
    await interaction.editReply(`${header}❌ **Error:** ${(err as Error).message}`);
  }
}

export async function handleReviewCommand(
  interaction: ChatInputCommandInteraction,
  ref: string,
  config: DiscordConfig,
): Promise<void> {
  const goal =
    `Review the changes in ${ref}. Use git_diff or git_log to examine what changed, ` +
    `then provide a code review: what the change does, potential issues, suggested improvements.`;
  return handleAgentCommand(interaction, goal, "plan", config);
}

export async function handleSummarizeCommand(
  interaction: ChatInputCommandInteraction,
  target: string,
  config: DiscordConfig,
): Promise<void> {
  let goal: string;
  if (target === "status") {
    goal =
      "Run git_status and git_log (last 5 commits) and give a brief summary of the current state of the repository.";
  } else if (target === "commits") {
    goal = "Show the last 10 commits and summarize what areas of the codebase have been changing recently.";
  } else {
    goal = `Summarize GitHub issue #${target}: what problem it describes, proposed solutions if any, and current status.`;
  }
  return handleAgentCommand(interaction, goal, "plan", config);
}

export async function handleStatusCommand(
  interaction: ChatInputCommandInteraction,
  config: DiscordConfig,
): Promise<void> {
  const gitTools = new ToolRegistry(GIT_TOOLS);
  const lines = [
    "**Harmus Bot Status**",
    `Model: \`${config.model}\``,
    `Repo: \`${config.repoCwd}\``,
    `Tools: ${ALL_TOOLS.length} registered`,
    "",
  ];
  await interaction.reply(lines.join("\n"));

  // Run git status in thread to add repo state
  try {
    const provider = new AnthropicProvider({ apiKey: config.anthropicApiKey });
    const result = await runAgentLoop([userText("Run git_status and show the result.")], {
      provider,
      model: config.model,
      cwd: config.repoCwd,
      mode: "plan",
      tools: gitTools,
      maxIterations: 2,
    });
    const text = result.messages
      .flatMap((m) => m.content)
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (text) await interaction.followUp(`\`\`\`\n${text.slice(0, 1800)}\n\`\`\``);
  } catch {
    // git status is best-effort
  }
}

function summarizeInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input).slice(0, 2);
  if (entries.length === 0) return "";
  return " " + entries.map(([k, v]) => `${k}=${String(v).slice(0, 30)}`).join(" ");
}

function chunkText(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    const cut = remaining.lastIndexOf("\n", maxLen);
    const at = cut > 0 ? cut : maxLen;
    chunks.push(remaining.slice(0, at));
    remaining = remaining.slice(at).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
