import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { OpenAIProvider } from "../../providers/openai-provider.js";
import { runAgentLoop } from "../agent-loop.js";
import { ToolRegistry } from "../tool-registry.js";
import { FILE_TOOLS } from "../../tools/fs-tools/index.js";
import { userText } from "../../types/message.js";
import { makeTempRepo, cleanupTempRepo } from "../../tools/fs-tools/__tests__/test-helpers.js";

function scriptedOpenAIClient(turns: any[]) {
  let i = 0;
  return {
    chat: {
      completions: {
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
    },
  } as any;
}

test("end-to-end: OpenAIProvider drives the same agent loop and real fs tools as Anthropic", async () => {
  const repo = await makeTempRepo();
  try {
    await writeFile(path.join(repo, "greeting.ts"), 'export const GREETING = "hello";\n');

    const client = scriptedOpenAIClient([
      // Turn 1: model reads the file (OpenAI shape: tool_calls array, JSON-string args)
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "read_file", arguments: JSON.stringify({ path: "greeting.ts" }) },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
      // Turn 2: model edits the file
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_2",
                  type: "function",
                  function: {
                    name: "edit_file",
                    arguments: JSON.stringify({
                      path: "greeting.ts",
                      oldStr: '"hello"',
                      newStr: '"howdy"',
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 15, completion_tokens: 8 },
      },
      // Turn 3: model confirms completion with plain text
      {
        choices: [
          {
            message: { role: "assistant", content: "Updated the greeting to 'howdy'.", tool_calls: undefined },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      },
    ]);

    const provider = new OpenAIProvider({ client });
    const registry = new ToolRegistry(FILE_TOOLS);
    const history = [userText("Change the greeting from hello to howdy")];

    const result = await runAgentLoop(history, {
      provider,
      model: "gpt-5-mini",
      cwd: repo,
      mode: "build",
      tools: registry,
    });

    assert.equal(result.stopReason, "end_turn");
    assert.equal(result.iterations, 3);

    const finalContent = await readFile(path.join(repo, "greeting.ts"), "utf-8");
    assert.equal(finalContent, 'export const GREETING = "howdy";\n');

    assert.equal(result.totalUsage.inputTokens, 45);
    assert.equal(result.totalUsage.outputTokens, 23);
  } finally {
    await cleanupTempRepo(repo);
  }
});

test("end-to-end: OpenAI provider also respects plan mode tool-visibility restrictions", async () => {
  const repo = await makeTempRepo();
  try {
    await writeFile(path.join(repo, "a.ts"), "const x = 1;\n");

    let capturedTools: any;
    const client = {
      chat: {
        completions: {
          create: async (params: any) => {
            capturedTools = params.tools;
            return {
              choices: [
                { message: { role: "assistant", content: "Here's my plan...", tool_calls: undefined }, finish_reason: "stop" },
              ],
              usage: { prompt_tokens: 5, completion_tokens: 5 },
            };
          },
        },
      },
    } as any;

    const provider = new OpenAIProvider({ client });
    const registry = new ToolRegistry(FILE_TOOLS);
    const history = [userText("change x to 2")];

    await runAgentLoop(history, {
      provider,
      model: "gpt-5-mini",
      cwd: repo,
      mode: "plan",
      tools: registry,
    });

    const toolNames = capturedTools.map((t: any) => t.function.name);
    assert.ok(!toolNames.includes("write_file"));
    assert.ok(!toolNames.includes("edit_file"));
    assert.ok(toolNames.includes("read_file"));
  } finally {
    await cleanupTempRepo(repo);
  }
});
