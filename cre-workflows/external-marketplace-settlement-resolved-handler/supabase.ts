import {
  cre,
  ok,
  type Runtime,
  type HTTPSendRequester,
  consensusIdenticalAggregation,
} from "@chainlink/cre-sdk";
import type { Config } from "./types";

export interface SecretWithPrediction {
  auction_id: string;
  event_data: {
    marketplace: string;
    event: string;
    marketId: number;
    outcome: "yes" | "no";
  } | null;
}

/**
 * Batch-fetches secrets for the given auction IDs from Supabase.
 * 1 HTTP call total.
 */
export function fetchSecretsForAuctions(
  runtime: Runtime<Config>,
  auctionIds: string[],
): SecretWithPrediction[] {
  if (auctionIds.length === 0) return [];

  const serviceRoleKey = runtime.getSecret({ id: "SUPABASE_SERVICE_ROLE_KEY" }).result();
  const httpClient = new cre.capabilities.HTTPClient();

  const auctionIdList = auctionIds.map((id) => `"${id}"`).join(",");

  const secrets: SecretWithPrediction[] = httpClient
    .sendRequest(
      runtime,
      getSecrets(runtime.config.supabaseUrl, serviceRoleKey.value, auctionIdList),
      consensusIdenticalAggregation<SecretWithPrediction[]>(),
    )(runtime.config)
    .result();

  runtime.log(`Fetched ${secrets.length} secret(s) for ${auctionIds.length} auction(s)`);
  return secrets;
}

const getSecrets =
  (supabaseUrl: string, serviceRoleKey: string, auctionIdList: string) =>
  (sendRequester: HTTPSendRequester, config: Config): SecretWithPrediction[] => {
    const url = `${supabaseUrl}/rest/v1/secrets?auction_id=in.(${auctionIdList})&select=auction_id,event_data`;

    const resp = sendRequester
      .sendRequest({
        url,
        method: "GET" as const,
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Accept": "application/json",
        },
        cacheSettings: {
          readFromCache: false,
          maxAgeMs: 0,
        },
      })
      .result();

    if (!ok(resp)) {
      const bodyText = new TextDecoder().decode(resp.body);
      throw new Error(`Supabase GET /secrets failed (${resp.statusCode}): ${bodyText}`);
    }

    const bodyText = new TextDecoder().decode(resp.body);
    return JSON.parse(bodyText) as SecretWithPrediction[];
  };
