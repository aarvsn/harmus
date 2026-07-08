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
  type AgentMode,
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

export interface RunCommandOptions {
  goal: string;
  mode: AgentMode;
  cwd: string;
  model?: string;
  provider?: string;
  modelAssignments?: string; // "plan=claude-opus-4-7,build=gpt-5-mini"
  maxIterations?: number;
}

const SYSTEM_PROMPT = (mode: AgentMode) =>
  mode === "plan"
    ? "You are Harmus, an autonomous coding agent currently in Plan Mode. " +
      "You can read and search the repository but cannot modify any files or run commands. " +
      "Investigate the codebase as needed, then produce a clear, numbered step-by-step plan " +
      "for the requested change, noting risks and any files that will need to change."
    : "You are Harmus, an autonomous coding agent currently in Build Mode. " +
      "You can read, search, edit, and create files, and run shell commands. " +
      "Make the requested change directly. Prefer minimal, targeted edits and explain " +
      "what you changed when you're done.";

export async function runCommand(options: RunCommandOptions): Promise<void> {
  const config = loadConfig();

  let _apiKey: string;
  try {
    _apiKey = requireApiKey(config);
  } catch (err: unknown) {
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

  // Multi-role model assignments (e.g. --models "plan=claude-opus-4-7,build=gpt-5-mini")
  let assignments: ModelAssignments = {};
  if (options.modelAssignments) {
    assignments = parseModelAssignments(options.modelAssignments);
  }

  const router = new ModelRouter({
    registry,
    assignments,
    defaultModel: model,
    defaultProviderId: providerId,
  });

  const resolvedModel = router.modelForRole(options.mode === "plan" ? "plan" : "build");
  const resolvedProviderId = router.providerIdForRole(options.mode === "plan" ? "plan" : "build");
  const provider = registry.get(resolvedProviderId);

  if (!provider) {
    printError(`Unknown provider: "${resolvedProviderId}"`);
    process.exitCode = 1;
    return;
  }

  const toolRegistry = new ToolRegistry(ALL_TOOLS);

  printHeader(options.mode === "plan" ? "Planning" : "Building");
  printModeWarning(options.mode);

  const history: Message[] = [userText(options.goal)];

  try {
    const result = await runAgentLoop(history, {
      provider,
      model: resolvedModel,
      cwd: options.cwd,
      mode: options.mode,
      system: SYSTEM_PROMPT(options.mode),
      maxIterations: options.maxIterations,
      onToolStart: (block: any) => printToolStart(block.name, block.input),
      onToolEnd: (block: any, content: string, isError: boolean) =>
        printToolEnd(block.name, content, isError),
    });

    for (const message of result.messages) {
      if (message.role !== "assistant") continue;
      for (const block of message.content) {
        if (block.type === "text" && block.text.trim()) {
          printAssistantText(block.text);
        }
      }
    }

    if (result.stopReason === "max_iterations") {
      printError(
        `Stopped after ${result.iterations} iterations without finishing. ` +
          "Try a more specific goal or increase --max-iterations.",
      );
      process.exitCode = 1;
    } else if (result.stopReason === "max_tokens") {
      printError("Response was cut off (max tokens reached). Try a narrower request.");
      process.exitCode = 1;
    }
  } catch (err: unknown) {
    if (err instanceof ProviderError) {
      printError(`${err.message}${err.retryable ? " (retryable - try again)" : ""}`);
    } else {
      printError((err as Error).message);
    }
    process.exitCode = 1;
  }
}
