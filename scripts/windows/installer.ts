/**
 * harmus-init — Windows installer generator
 *
 * This Node.js script generates a self-contained Windows installer.
 * It is bundled into harmus-init.exe via `pkg` and uploaded to GitHub Releases.
 *
 * What harmus-init.exe does when run on a Windows machine:
 *   1. Checks for Node.js ≥ 22 and installs it via winget or downloads it directly
 *   2. Checks for Git and installs it via winget if missing
 *   3. Installs @harmus/cli and @harmus/tui globally via npm
 *   4. Adds harmus to the user's PATH (no admin required)
 *   5. Prints next steps
 *
 * Build with:
 *   npm run build:windows-installer
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, platform } from "node:os";
import * as https from "node:https";
import * as fs from "node:fs";

if (platform() !== "win32") {
  console.error("This installer is for Windows only. On macOS/Linux, use install.sh instead.");
  process.exit(1);
}

// ─── ANSI colors (Windows 10+ supports these) ─────────────────────────────
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  cyan:   "\x1b[36m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
};

function banner(): void {
  console.log();
  console.log(`${C.cyan}${C.bold}  ██╗  ██╗ █████╗ ██████╗ ███╗   ███╗██╗   ██╗███████╗${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ██║  ██║██╔══██╗██╔══██╗████╗ ████║██║   ██║██╔════╝${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ███████║███████║██████╔╝██╔████╔██║██║   ██║███████╗${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ██╔══██║██╔══██║██╔══██╗██║╚██╔╝██║██║   ██║╚════██║${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ██║  ██║██║  ██║██║  ██║██║ ╚═╝ ██║╚██████╔╝███████║${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚══════╝${C.reset}`);
  console.log();
  console.log(`  ${C.bold}Windows Installer${C.reset}`);
  console.log();
}

function info(msg: string):    void { console.log(`  ${C.cyan}→${C.reset}  ${msg}`); }
function success(msg: string): void { console.log(`  ${C.green}✓${C.reset}  ${msg}`); }
function warn(msg: string):    void { console.log(`  ${C.yellow}⚠${C.reset}  ${msg}`); }
function fail(msg: string):    void { console.error(`  ${C.red}✗${C.reset}  ${msg}`); }

function run(cmd: string, opts: { silent?: boolean } = {}): string {
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      stdio: opts.silent ? ["pipe", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

// ─── Node.js check / install ─────────────────────────────────────────────────
const REQUIRED_NODE = 22;
const NODE_INSTALLER_URL = `https://nodejs.org/dist/latest-v${REQUIRED_NODE}.x/node-v${REQUIRED_NODE}.0.0-x64.msi`;

async function checkAndInstallNode(): Promise<void> {
  const nodeVersion = run("node --version", { silent: true });
  if (nodeVersion) {
    const major = parseInt(nodeVersion.replace("v", "").split(".")[0]!, 10);
    if (major >= REQUIRED_NODE) {
      success(`Node.js ${nodeVersion}`);
      return;
    }
    warn(`Node.js ${nodeVersion} found, need v${REQUIRED_NODE}+. Upgrading...`);
  } else {
    info("Node.js not found. Installing...");
  }

  // Try winget first (available on Windows 10 1709+)
  const wingetAvailable = run("winget --version", { silent: true });
  if (wingetAvailable) {
    info("Installing Node.js via winget...");
    const result = spawnSync(
      "winget",
      ["install", "--id", "OpenJS.NodeJS.LTS", "--silent", "--accept-package-agreements", "--accept-source-agreements"],
      { stdio: "inherit" },
    );
    if (result.status === 0) {
      success("Node.js installed via winget. You may need to restart your terminal.");
      return;
    }
  }

  // Fall back to downloading the MSI
  info(`Downloading Node.js v${REQUIRED_NODE} installer...`);
  const msiPath = join(homedir(), "AppData", "Local", "Temp", "node-installer.msi");
  await downloadFile(NODE_INSTALLER_URL, msiPath);
  info("Running Node.js installer (this may take a minute)...");
  spawnSync("msiexec", ["/i", msiPath, "/quiet", "/norestart"], { stdio: "inherit" });
  success(`Node.js v${REQUIRED_NODE} installed.`);
}

// ─── Git check / install ──────────────────────────────────────────────────────
async function checkAndInstallGit(): Promise<void> {
  const gitVersion = run("git --version", { silent: true });
  if (gitVersion) {
    success(`Git ${gitVersion.replace("git version ", "")}`);
    return;
  }

  warn("Git not found.");
  const wingetAvailable = run("winget --version", { silent: true });
  if (wingetAvailable) {
    info("Installing Git via winget...");
    const result = spawnSync(
      "winget",
      ["install", "--id", "Git.Git", "--silent", "--accept-package-agreements", "--accept-source-agreements"],
      { stdio: "inherit" },
    );
    if (result.status === 0) {
      success("Git installed.");
      return;
    }
  }

  warn("Could not install Git automatically. Download from: https://git-scm.com/download/win");
  warn("Git tools (git_status, git_commit, etc.) will not work without it.");
}

// ─── npm check ────────────────────────────────────────────────────────────────
function checkNpm(): void {
  const npmVersion = run("npm --version", { silent: true });
  if (!npmVersion) {
    fail("npm not found. This usually means Node.js installation did not complete.");
    fail("Please restart your terminal and re-run this installer.");
    process.exit(1);
  }
  success(`npm ${npmVersion}`);
}

// ─── Harmus installation ──────────────────────────────────────────────────────
function installHarmus(): void {
  info("Installing @harmus/cli and @harmus/tui globally...");

  // Try global install first
  const result = spawnSync(
    "npm",
    ["install", "-g", "@harmus/cli", "@harmus/tui"],
    { stdio: "inherit", shell: true },
  );

  if (result.status !== 0) {
    // Fall back to user-local install in AppData
    warn("Global install failed. Installing to user AppData instead...");
    const installDir = join(homedir(), "AppData", "Local", "harmus");
    mkdirSync(installDir, { recursive: true });

    spawnSync(
      "npm",
      ["install", "--prefix", installDir, "@harmus/cli", "@harmus/tui"],
      { stdio: "inherit", shell: true },
    );

    // Add wrapper batch files to a directory in PATH
    const binDir = join(homedir(), "AppData", "Local", "Microsoft", "WindowsApps");
    mkdirSync(binDir, { recursive: true });

    const harmusBat = `@echo off\nnode "%LOCALAPPDATA%\\harmus\\node_modules\\.bin\\harmus" %*\n`;
    const tuiBat    = `@echo off\nnode "%LOCALAPPDATA%\\harmus\\node_modules\\.bin\\harmus-tui" %*\n`;

    writeFileSync(join(binDir, "harmus.cmd"), harmusBat);
    writeFileSync(join(binDir, "harmus-tui.cmd"), tuiBat);
    success("Harmus installed to AppData and wrapper scripts created.");
    return;
  }

  success("@harmus/cli and @harmus/tui installed globally.");
}

// ─── PATH verification ────────────────────────────────────────────────────────
function verifyInstall(): void {
  const harmusPath = run("where harmus", { silent: true });
  if (harmusPath) {
    const version = run("harmus --version", { silent: true });
    success(`harmus ${version} at ${harmusPath.split("\n")[0]}`);
  } else {
    warn("harmus not found in PATH yet. This is normal — please restart your terminal.");
  }
}

// ─── Print next steps ────────────────────────────────────────────────────────
function printNextSteps(): void {
  console.log();
  console.log(`  ${C.bold}Next steps:${C.reset}`);
  console.log();
  console.log(`  ${C.cyan}1.${C.reset} Set your API key (PowerShell):`);
  console.log(`     ${C.bold}$env:ANTHROPIC_API_KEY = "sk-ant-..."${C.reset}`);
  console.log();
  console.log(`  ${C.cyan}   Or set it permanently via System Properties → Environment Variables.${C.reset}`);
  console.log();
  console.log(`  ${C.cyan}2.${C.reset} Run your first command:`);
  console.log(`     ${C.bold}cd your-project && harmus plan "add a health check"${C.reset}`);
  console.log();
  console.log(`  ${C.cyan}3.${C.reset} Launch the TUI:`);
  console.log(`     ${C.bold}harmus-tui${C.reset}`);
  console.log();
  console.log(`  ${C.cyan}4.${C.reset} Docs: ${C.bold}https://github.com/aarvsn/harmus${C.reset}`);
  console.log();
}

// ─── Download helper ──────────────────────────────────────────────────────────
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        downloadFile(response.headers.location!, dest).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  banner();

  console.log(`  ${C.bold}Checking dependencies...${C.reset}`);
  await checkAndInstallNode();
  checkNpm();
  await checkAndInstallGit();

  console.log();
  console.log(`  ${C.bold}Installing Harmus...${C.reset}`);
  installHarmus();

  console.log();
  console.log(`  ${C.bold}Verifying...${C.reset}`);
  verifyInstall();

  console.log();
  console.log(`  ${C.green}${C.bold}Installation complete!${C.reset}`);
  printNextSteps();

  // Keep terminal open if run by double-clicking (no parent terminal)
  if (!process.env.TERM && !process.env.WT_SESSION && !process.env.ConEmuPID) {
    console.log("  Press Enter to exit...");
    process.stdin.resume();
    process.stdin.once("data", () => process.exit(0));
  }
}

main().catch((err) => {
  fail(`Installer failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
