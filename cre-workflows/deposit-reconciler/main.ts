import { cre, type Runtime, Runner, type CronPayload } from "@chainlink/cre-sdk";
import { configSchema, CRON_SCHEDULE, type Config } from "./types";
import { fetchTransactions } from "./transactions";
import { recordDeposits, recordTransfers } from "./supabase";

/**
 * Cron handler — polls Private Token API for recent transactions,
 * batch-inserts new deposits and outgoing transfers into Supabase.
 * The balances VIEW automatically reflects credited/debited amounts.
 *
 * Total HTTP calls per execution: 3 (fetch + batch deposits + batch transfers),
 * well within CRE's per-workflow limit of 5.
 */
const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload): string => {
  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    runtime.log(`Deposit reconciler cron fired (now=${nowSeconds})`);

    // Poll the Private Token API for recent transactions
    const response = fetchTransactions(runtime);
    const transactions = response.transactions ?? [];

    runtime.log(`Fetched ${transactions.length} transaction(s)`);

    if (transactions.length === 0) {
      return "No transactions found";
    }

    // Filter for deposit-type transactions with the correct token
    const tokenAddress = runtime.config.tokenAddress.toLowerCase();
    const deposits = transactions.filter(
      (tx) =>
        tx.type === "deposit" &&
        tx.token.toLowerCase() === tokenAddress,
    );

    runtime.log(`Found ${deposits.length} deposit(s) for token ${tokenAddress}`);

    // Batch-insert deposits (duplicates silently ignored by Supabase)
    const newDeposits = recordDeposits(runtime, deposits);

    // Filter for outgoing private transfers (platform sending tokens to users)
    const outgoing = transactions.filter(
      (tx) =>
        tx.type === "transfer" &&
        tx.is_incoming === false &&
        tx.token.toLowerCase() === tokenAddress,
    );

    runtime.log(`Found ${outgoing.length} outgoing transfer(s) for token ${tokenAddress}`);

    // Batch-insert transfers (duplicates silently ignored by Supabase)
    const newTransfers = recordTransfers(runtime, outgoing);

    const summary = `Deposits: ${newDeposits} new of ${deposits.length} | Transfers: ${newTransfers} new of ${outgoing.length}`;
    runtime.log(summary);
    return summary;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`onCronTrigger error: ${msg}`);
    throw err;
  }
};

/**
 * Workflow init — registers cron trigger to poll every 60 seconds.
 */
const initWorkflow = (config: Config) => {
  const cronCap = new cre.capabilities.CronCapability();

  return [
    cre.handler(
      cronCap.trigger({ schedule: CRON_SCHEDULE }),
      onCronTrigger,
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
