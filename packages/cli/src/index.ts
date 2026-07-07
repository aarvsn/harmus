#!/usr/bin/env node
import { Command } from "commander";
import { runCommand } from "./commands/run.js";
import { planThenBuild } from "./commands/plan-then-build.js";

const program = new Command();

program.name("harmus").description("Harmus - an autonomous coding agent").version("0.1.0");

const sharedOptions = (cmd: Command) =>
  cmd
    .option("-m, --model <model>", "Model to use (e.g. claude-opus-4-7, gpt-5-mini, gemini-2.5-pro)")
    .option("-p, --provider <provider>", "Provider to use (anthropic, openai, google, groq, ollama, ...)")
    .option("--models <assignments>", 'Per-role model assignments: "plan=claude-opus-4-7,build=gpt-5-mini"')
    .option("--max-iterations <n>", "Max model<->tool round trips", (v) => parseInt(v, 10));

sharedOptions(
  program
    .command("plan")
    .description("Analyze the repository and produce a step-by-step plan, without modifying any files")
    .argument("<goal>", 'What you want to accomplish, e.g. "add OAuth login"'),
).action(
  async (
    goal: string,
    opts: { model?: string; provider?: string; models?: string; maxIterations?: number },
  ) => {
    await runCommand({
      goal,
      mode: "plan",
      cwd: process.cwd(),
      model: opts.model,
      provider: opts.provider,
      modelAssignments: opts.models,
      maxIterations: opts.maxIterations,
    });
  },
);

sharedOptions(
  program
    .command("build")
    .description("Execute changes directly: edit files, run commands, and implement the requested goal")
    .argument("<goal>", 'What you want to accomplish, e.g. "add OAuth login"'),
).action(
  async (
    goal: string,
    opts: { model?: string; provider?: string; models?: string; maxIterations?: number },
  ) => {
    await runCommand({
      goal,
      mode: "build",
      cwd: process.cwd(),
      model: opts.model,
      provider: opts.provider,
      modelAssignments: opts.models,
      maxIterations: opts.maxIterations,
    });
  },
);

sharedOptions(
  program
    .command("implement")
    .description("Plan first, show you the plan, then build once you approve it")
    .argument("<goal>", 'What you want to accomplish, e.g. "add OAuth login"')
    .option("-y, --yes", "Skip approval prompt and build immediately"),
).action(
  async (
    goal: string,
    opts: { model?: string; provider?: string; models?: string; maxIterations?: number; yes?: boolean },
  ) => {
    await planThenBuild({
      goal,
      cwd: process.cwd(),
      model: opts.model,
      provider: opts.provider,
      modelAssignments: opts.models,
      maxIterations: opts.maxIterations,
      yes: opts.yes,
    });
  },
);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
