import { SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("plan")
    .setDescription("Analyze the repository and produce a step-by-step plan (no files modified)")
    .addStringOption((opt) =>
      opt.setName("goal").setDescription("What you want to accomplish").setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName("model").setDescription("Model to use for planning").setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("build")
    .setDescription("Implement changes directly in the repository")
    .addStringOption((opt) =>
      opt.setName("goal").setDescription("What you want to accomplish").setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName("model").setDescription("Model to use for building").setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("review")
    .setDescription("Review a pull request or git diff")
    .addStringOption((opt) =>
      opt.setName("ref").setDescription("PR number, branch name, or commit hash").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("summarize")
    .setDescription("Summarize a GitHub issue, recent commits, or the current git status")
    .addStringOption((opt) =>
      opt.setName("target").setDescription("Issue number, 'commits', or 'status'").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show Harmus bot status: model, repo, and recent activity"),
].map((cmd) => cmd.toJSON());
