import { cre, type Runtime, Runner, type CronPayload } from "@chainlink/cre-sdk";
import { configSchema, CRON_SCHEDULE, type Config } from "./types";
import { fetchTransactions } from "./transactions";
import { recordTransactions } from "./supabase";
import { sendNotification } from "./notify";

/**
 * Cron handler — polls Private Token API for recent transactions,
 * batch-inserts new deposits and outgoing transfers into Supabase.
 * The balances VIEW automatically reflects credited/debited amounts.
 *
 * Only tracks API `type: "transfer"` transactions (private transfers):
 * - is_incoming: true  → deposit (someone transferred TO our platform EOA)
 * - is_incoming: false → withdrawal (platform EOA transferred to a user)
 *
 * Total HTTP calls per execution: 2 (fetch + batch insert),
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

    // Filter for private transfer transactions with the correct token
    const tokenAddress = runtime.config.tokenAddress.toLowerCase();
    const transfers = transactions.filter(
      (tx) =>
        tx.type === "transfer" &&
        tx.token.toLowerCase() === tokenAddress,
    );

    runtime.log(`Found ${transfers.length} transfer(s) for token ${tokenAddress}`);

    // Split by direction: incoming = deposits, outgoing = withdrawals
    const incoming = transfers.filter((tx) => tx.is_incoming === true);
    const outgoing = transfers.filter((tx) => tx.is_incoming === false);

    runtime.log(`Incoming (deposits): ${incoming.length}, Outgoing (withdrawals): ${outgoing.length}`);

    // Batch-insert all transactions (duplicates silently ignored by Supabase)
    const newCount = recordTransactions(runtime, incoming, outgoing);

    const summary = `Recorded ${newCount} new of ${transfers.length} transfers (${incoming.length} deposits, ${outgoing.length} withdrawals)`;
    runtime.log(summary);
    sendNotification(runtime, "Transfers Recorded", summary);
    return summary;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`onCronTrigger error: ${msg}`);
    sendNotification(runtime, "Balance Recording FAILED", msg);
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
