#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { AnthropicProvider } from "@harmus/core";
import { App } from "./components/App.js";

function main(): void {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Error: No ANTHROPIC_API_KEY found in the environment.");
    console.error("Set it with: export ANTHROPIC_API_KEY=sk-ant-...");
    process.exitCode = 1;
    return;
  }

  const model = process.env.HARMUS_MODEL || "claude-sonnet-4-6";
  const provider = new AnthropicProvider({ apiKey });
  const cwd = process.cwd();

  render(<App provider={provider} model={model} cwd={cwd} />);
}

main();
