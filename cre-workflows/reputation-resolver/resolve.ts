import {
  cre,
  type Runtime,
  getNetwork,
  bytesToHex,
  hexToBase64,
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters, concatHex } from "viem";
import { type Config, ACTION_RECORD_EVENT_OUTCOME } from "./types";

export interface AuctionResultTuple {
  auctionId: bigint;
  predictionOutcome: number;
}

/**
 * Submits a signed CRE report to resolve an external event with per-auction results.
 *
 * Report format: [0x02] [abi.encode(uint256 eventId, (uint256,uint8)[] results)]
 */
export function submitResolveReport(
  runtime: Runtime<Config>,
  eventId: bigint,
  results: AuctionResultTuple[],
): string {
  const cfg = runtime.config.evms[0];

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: cfg.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Unknown chain: ${cfg.chainSelectorName}`);

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

  // Encode report: action byte + abi-encoded (eventId, results[])
  const actionByte = `0x0${ACTION_RECORD_EVENT_OUTCOME}` as `0x${string}`;
  const tuples = results.map((r) => ({
    auctionId: r.auctionId,
    predictionOutcome: r.predictionOutcome,
  }));
  const payload = encodeAbiParameters(
    parseAbiParameters("uint256, (uint256 auctionId, uint8 predictionOutcome)[]"),
    [eventId, tuples],
  );
  const reportData = concatHex([actionByte, payload]);

  runtime.log(
    `Recording outcome for event ${eventId} with ${results.length} result(s) — report: ${reportData.slice(0, 30)}...`,
  );

  // Sign the report
  const signedReport = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  // Submit to SecretMarketplace via onReport()
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: cfg.secretMarketplaceAddress,
      report: signedReport,
      gasConfig: { gasLimit: cfg.gasLimit },
    })
    .result();

  const txHash = bytesToHex(writeResult.txHash ?? new Uint8Array(32));
  runtime.log(`Event ${eventId} resolved — tx: ${txHash}`);
  return txHash;
}
