import {
  ToolRegistry,
  runAgentLoop,
  ALL_TOOLS,
  userText,
  ProviderError,
  createDefaultRegistry,
  inferProviderId,
  parseModelAssignments,
  ModelRouter,
  type Message,
  type ModelAssignments,
} from "@harmus/core";
import { loadConfig, requireApiKey, ConfigError } from "../config.js";
import {
  printHeader,
  printToolStart,
  printToolEnd,
  printAssistantText,
  printError,
  printModeWarning,
} from "../output.js";
import { promptApproval } from "../approval.js";
import { runCommand } from "./run.js";

export interface PlanThenBuildOptions {
  goal: string;
  cwd: string;
  model?: string;
  provider?: string;
  modelAssignments?: string;
  maxIterations?: number;
  /** Skip the interactive approval prompt (useful for non-TTY / CI) */
  yes?: boolean;
}

const PLAN_SYSTEM =
  "You are Harmus, an autonomous coding agent currently in Plan Mode. " +
  "You can read and search the repository but cannot modify any files or run commands. " +
  "Investigate the codebase thoroughly, then produce a clear, numbered step-by-step plan " +
  "for the requested change. Include: which files will change, risks, and alternatives.";

export async function planThenBuild(options: PlanThenBuildOptions): Promise<void> {
  const config = loadConfig();

  try {
    requireApiKey(config);
  } catch (err) {
    if (err instanceof ConfigError) {
      printError(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const registry = createDefaultRegistry();
  const model = options.model ?? config.defaultModel;
  const providerId = options.provider ?? inferProviderId(model);

  let assignments: ModelAssignments = {};
  if (options.modelAssignments) assignments = parseModelAssignments(options.modelAssignments);

  const router = new ModelRouter({
    registry,
    assignments,
    defaultModel: model,
    defaultProviderId: providerId,
  });
  const planModel = router.modelForRole("plan");
  const planProviderId = router.providerIdForRole("plan");
  const provider = registry.get(planProviderId);

  if (!provider) {
    printError(`Unknown provider: "${planProviderId}"`);
    process.exitCode = 1;
    return;
  }

  printHeader("Planning");
  printModeWarning("plan");

  const history: Message[] = [userText(options.goal)];
  let planText = "";

  try {
    const result = await runAgentLoop(history, {
      provider,
      model: planModel,
      cwd: options.cwd,
      mode: "plan",
      system: PLAN_SYSTEM,
      tools: new ToolRegistry(ALL_TOOLS),
      maxIterations: options.maxIterations,
      onToolStart: (block: any) => printToolStart(block.name, block.input),
      onToolEnd: (block: any, content: string, isError: boolean) =>
        printToolEnd(block.name, content, isError),
    });

    for (const msg of result.messages) {
      if (msg.role !== "assistant") continue;
      for (const block of msg.content) {
        if (block.type === "text" && block.text.trim()) {
          printAssistantText(block.text);
          planText += block.text;
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof ProviderError) {
      printError(err.message);
    } else {
      printError((err as Error).message);
    }
    process.exitCode = 1;
    return;
  }

  // Non-interactive / --yes flag: auto-approve
  if (options.yes || !process.stdin.isTTY) {
    await runCommand({
      goal: options.goal,
      mode: "build",
      cwd: options.cwd,
      model: options.model,
      provider: options.provider,
      modelAssignments: options.modelAssignments,
      maxIterations: options.maxIterations,
    });
    return;
  }

  const approval = await promptApproval(options.goal, planText);

  if (approval.decision === "reject") return;

  const buildGoal = approval.revisedGoal ?? options.goal;
  await runCommand({
    goal: buildGoal,
    mode: "build",
    cwd: options.cwd,
    model: options.model,
    provider: options.provider,
    modelAssignments: options.modelAssignments,
    maxIterations: options.maxIterations,
  });
}
