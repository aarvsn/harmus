import chalk from "chalk";

export function printHeader(text: string): void {
  console.log(chalk.bold.cyan(`\n${text}`));
}

export function printToolStart(name: string, input: Record<string, unknown>): void {
  const summary = summarizeInput(input);
  console.log(chalk.dim(`  → ${chalk.yellow(name)}${summary ? chalk.dim(` ${summary}`) : ""}`));
}

export function printToolEnd(name: string, content: string, isError: boolean): void {
  const lines = content.split("\n");
  const preview = lines.slice(0, 3).join("\n");
  const truncated = lines.length > 3 ? `\n  ${chalk.dim(`... (${lines.length - 3} more lines)`)}` : "";
  const color = isError ? chalk.red : chalk.dim;
  console.log(color(indent(preview, "    ")) + truncated);
}

export function printAssistantText(text: string): void {
  console.log(text);
}

export function printError(message: string): void {
  console.error(chalk.red(`Error: ${message}`));
}

export function printSuccess(message: string): void {
  console.log(chalk.green(message));
}

export function printModeWarning(mode: "plan" | "build"): void {
  if (mode === "plan") {
    console.log(chalk.dim("(Plan Mode — no files will be modified)\n"));
  } else {
    console.log(chalk.dim("(Build Mode — files may be created, edited, or deleted)\n"));
  }
}

function summarizeInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (entries.length === 0) return "";
  return entries
    .map(([key, value]) => {
      const str = typeof value === "string" ? value : JSON.stringify(value);
      const truncated = str.length > 60 ? `${str.slice(0, 60)}...` : str;
      return `${key}=${truncated}`;
    })
    .join(" ");
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}
