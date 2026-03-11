/*
NOTE TO CLAUDE: This code relates to the old CRE based system. It's being kept in until you've confirmed the Zama port works end to end. You can use it as reference for how the old system used to work, but you should not update or maintain these files.
*/
/**
 * CRE CLI runner — invokes `cre workflow simulate` for a given workflow.
 */

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { Hex } from "viem";

const __filename_ = fileURLToPath(import.meta.url);
const __dirname_ = dirname(__filename_);
const PROJECT_ROOT = resolve(__dirname_, "../../..");
const CRE_BIN = `${process.env.HOME}/.cre/bin/cre`;

export function runCRE(opts: {
  workflow: string;
  broadcast?: boolean;
  evmTxHash?: Hex;
  evmEventIndex?: number;
  triggerIndex?: number;
  timeoutMs?: number;
}): string {
  const args = [
    CRE_BIN,
    "workflow",
    "simulate",
    opts.workflow,
    "--target",
    "local-simulation",
    "--non-interactive",
  ];

  if (opts.triggerIndex !== undefined) {
    args.push("--trigger-index", String(opts.triggerIndex));
  }
  if (opts.evmTxHash) {
    args.push("--evm-tx-hash", opts.evmTxHash);
  }
  if (opts.evmEventIndex !== undefined) {
    args.push("--evm-event-index", String(opts.evmEventIndex));
  }
  if (opts.broadcast) {
    args.push("--broadcast");
  }

  const label = `CRE ${opts.workflow}${opts.broadcast ? " (broadcast)" : " (dry run)"}`;
  console.log(`  Running ${label}...`);

  const output = execSync(args.join(" "), {
    cwd: `${PROJECT_ROOT}/cre-workflows`,
    encoding: "utf-8",
    timeout: opts.timeoutMs ?? 120_000,
    env: {
      ...process.env,
      PATH: `${process.env.HOME}/.cre/bin:${process.env.PATH}`,
    },
  });

  // Print relevant lines
  const lines = output.split("\n");
  const userLogs = lines.filter(
    (l) => l.includes("[USER LOG]") || l.includes("Workflow Simulation Result"),
  );
  for (const line of userLogs) {
    console.log(`  CRE: ${line.trim()}`);
  }

  return output;
}
