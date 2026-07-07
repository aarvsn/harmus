import * as readline from "node:readline/promises";
import chalk from "chalk";

export type ApprovalDecision = "approve" | "edit" | "reject";

export interface ApprovalResult {
  decision: ApprovalDecision;
  /** Only set if decision === "edit" — the user's modified goal */
  revisedGoal?: string;
}

/**
 * Presents an approval prompt after `plan` completes. The user can:
 *   [a] approve  → proceed to Build Mode with the same goal
 *   [e] edit     → revise the goal text, then approve
 *   [r] reject   → abort, do nothing
 *
 * Returns the user's decision so the CLI caller can decide what to do next.
 */
export async function promptApproval(
  originalGoal: string,
  planText: string,
): Promise<ApprovalResult> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log(chalk.cyan("\n─── Plan complete ─────────────────────────────────────────────"));
    console.log(planText);
    console.log(chalk.cyan("───────────────────────────────────────────────────────────────\n"));

    while (true) {
      const answer = await rl.question(
        chalk.bold("Proceed? ") +
        chalk.green("[a]pprove") + " / " +
        chalk.yellow("[e]dit goal") + " / " +
        chalk.red("[r]eject") + " > ",
      );

      const trimmed = answer.trim().toLowerCase();

      if (trimmed === "a" || trimmed === "approve" || trimmed === "") {
        return { decision: "approve" };
      }

      if (trimmed === "r" || trimmed === "reject") {
        console.log(chalk.dim("Rejected. No changes made."));
        return { decision: "reject" };
      }

      if (trimmed === "e" || trimmed === "edit") {
        const revised = await rl.question(
          chalk.bold("Revised goal: "),
        );
        const revisedGoal = revised.trim() || originalGoal;
        console.log(chalk.dim(`Will build: "${revisedGoal}"`));
        return { decision: "edit", revisedGoal };
      }

      console.log(chalk.dim("Please type a, e, or r."));
    }
  } finally {
    rl.close();
  }
}
