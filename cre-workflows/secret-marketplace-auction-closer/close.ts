import {
  cre,
  type Runtime,
  getNetwork,
  bytesToHex,
  hexToBase64,
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters, concatHex } from "viem";
import { type Config, ACTION_CLOSE_AUCTION } from "./types";

/**
 * Closes an expired auction by submitting a signed CRE report to SecretMarketplace.
 *
 * Report format: [action_byte (1 byte)] [abi.encode(uint256 auctionId)]
 * Action byte 0x00 = ACTION_CLOSE_AUCTION
 */
export function closeAuction(
  runtime: Runtime<Config>,
  auctionId: bigint
): string {
  const cfg = runtime.config.evms[0];

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: cfg.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Unknown chain: ${cfg.chainSelectorName}`);

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

  // Encode report: action byte + abi-encoded auctionId
  const actionByte = `0x0${ACTION_CLOSE_AUCTION}` as `0x${string}`;
  const payload = encodeAbiParameters(
    parseAbiParameters("uint256"),
    [auctionId]
  );
  const reportData = concatHex([actionByte, payload]);

  runtime.log(`Closing auction ${auctionId} — report: ${reportData.slice(0, 20)}...`);

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
  runtime.log(`Auction ${auctionId} closed — tx: ${txHash}`);
  return txHash;
}
