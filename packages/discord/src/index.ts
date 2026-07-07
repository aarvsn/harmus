#!/usr/bin/env node
import { startBot } from "./bot.js";

startBot().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
