import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { AnthropicProvider } from "../../providers/anthropic-provider.js";
import { runAgentLoop } from "../agent-loop.js";
import { ToolRegistry } from "../tool-registry.js";
import { FILE_TOOLS } from "../../tools/fs-tools/index.js";
import { userText } from "../../types/message.js";
import { makeTempRepo, cleanupTempRepo } from "../../tools/fs-tools/__tests__/test-helpers.js";

/**
 * Simulates a realistic multi-turn Anthropic conversation: the model reads a
 * file, then edits it, then confirms - using the REAL fs tools against a
 * REAL temp directory, with only the SDK network call mocked out.
 */
function scriptedAnthropicClient(turns: any[]) {
  let i = 0;
  return {
    messages: {
      create: async () => {
        const next = turns[i];
        i++;
        if (!next) throw new Error("ran out of scripted turns");
        return next;
      },
      stream: () => {
        throw new Error("stream not used in this test");
      },
    },
  } as any;
}

test("end-to-end: AnthropicProvider + real fs tools + agent loop edits a real file", async () => {
  const repo = await makeTempRepo();
  try {
    await writeFile(path.join(repo, "greeting.ts"), 'export const GREETING = "hello";\n');

    const client = scriptedAnthropicClient([
      // Turn 1: model reads the file
      {
        content: [
          { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "greeting.ts" } },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      // Turn 2: model edits the file based on what it read
      {
        content: [
          {
            type: "tool_use",
            id: "toolu_2",
            name: "edit_file",
            input: { path: "greeting.ts", oldStr: '"hello"', newStr: '"howdy"' },
          },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 15, output_tokens: 8 },
      },
      // Turn 3: model confirms completion
      {
        content: [{ type: "text", text: "Updated the greeting to 'howdy'." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 20, output_tokens: 10 },
      },
    ]);

    const provider = new AnthropicProvider({ client });
    const registry = new ToolRegistry(FILE_TOOLS);
    const history = [userText("Change the greeting from hello to howdy")];

    const result = await runAgentLoop(history, {
      provider,
      model: "claude-sonnet-4-6",
      cwd: repo,
      mode: "build",
      tools: registry,
    });

    assert.equal(result.stopReason, "end_turn");
    assert.equal(result.iterations, 3);

    // The real file on disk should reflect the edit_file tool's actual effect.
    const finalContent = await readFile(path.join(repo, "greeting.ts"), "utf-8");
    assert.equal(finalContent, 'export const GREETING = "howdy";\n');

    // Usage should accumulate across all three provider calls.
    assert.equal(result.totalUsage.inputTokens, 45);
    assert.equal(result.totalUsage.outputTokens, 23);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("end-to-end: plan mode prevents the real edit from happening even if the model tries", async () => {
  const repo = await makeTempRepo();
  try {
    await writeFile(path.join(repo, "a.ts"), "const x = 1;\n");

    const client = scriptedAnthropicClient([
      {
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "edit_file",
            input: { path: "a.ts", oldStr: "const x = 1;", newStr: "const x = 2;" },
          },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 5, output_tokens: 5 },
      },
      {
        content: [{ type: "text", text: "I cannot make that edit in plan mode." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 5, output_tokens: 5 },
      },
    ]);

    const provider = new AnthropicProvider({ client });
    const registry = new ToolRegistry(FILE_TOOLS);
    const history = [userText("change x to 2")];

    await runAgentLoop(history, {
      provider,
      model: "claude-sonnet-4-6",
      cwd: repo,
      mode: "plan",
      tools: registry,
    });

    // File on disk must be untouched - plan mode blocks the mutation at the executor level.
    const content = await readFile(path.join(repo, "a.ts"), "utf-8");
    assert.equal(content, "const x = 1;\n");
  } finally {
    await cleanupTempRepo(repo);
  }
});
