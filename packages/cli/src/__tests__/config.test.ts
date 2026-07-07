import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, requireApiKey, ConfigError } from "../config.js";

test("loadConfig reads ANTHROPIC_API_KEY from env", () => {
  const config = loadConfig({ ANTHROPIC_API_KEY: "sk-ant-test123" } as NodeJS.ProcessEnv);
  assert.equal(config.anthropicApiKey, "sk-ant-test123");
});

test("loadConfig defaults to claude-sonnet-4-6 when HARMUS_MODEL is unset", () => {
  const config = loadConfig({} as NodeJS.ProcessEnv);
  assert.equal(config.defaultModel, "claude-sonnet-4-6");
});

test("loadConfig respects HARMUS_MODEL override", () => {
  const config = loadConfig({ HARMUS_MODEL: "claude-opus-4-7" } as NodeJS.ProcessEnv);
  assert.equal(config.defaultModel, "claude-opus-4-7");
});

test("requireApiKey returns the key when present", () => {
  const config = loadConfig({ ANTHROPIC_API_KEY: "sk-ant-abc" } as NodeJS.ProcessEnv);
  assert.equal(requireApiKey(config), "sk-ant-abc");
});

test("requireApiKey throws ConfigError with actionable message when missing", () => {
  const config = loadConfig({} as NodeJS.ProcessEnv);
  assert.throws(
    () => requireApiKey(config),
    (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /ANTHROPIC_API_KEY/);
      assert.match(err.message, /export ANTHROPIC_API_KEY/);
      return true;
    },
  );
});
