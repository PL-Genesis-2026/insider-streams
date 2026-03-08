import { z } from "zod";
export { secretMarketplaceAbi } from "@private-streams/common";

const evmConfigSchema = z.object({
  chainSelectorName: z.string().min(1),
  secretMarketplaceAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/u, "must be a 0x-prefixed 20-byte hex"),
  examplePredictionMarketAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/u, "must be a 0x-prefixed 20-byte hex"),
  gasLimit: z
    .string()
    .regex(/^\d+$/, "gasLimit must be a numeric string")
    .refine((val) => Number(val) > 0, { message: "gasLimit must be > 0" }),
});

export const configSchema = z.object({
  supabaseUrl: z.string().startsWith("https://"),
  subgraphUrl: z.string().startsWith("http"),
  evms: z.array(evmConfigSchema).min(1, "At least one EVM config is required"),
  ntfyEnabled: z.boolean().default(true),
  ntfyHost: z.string().startsWith("http").default("http://localhost:8090"),
  ntfyTopic: z.string().default("external-marketplace-settlement-resolved-handler-cre"),
  ntfyUser: z.string().default("vps"),
});

export type Config = z.infer<typeof configSchema>;

export const ACTION_RECORD_EVENT_OUTCOME = 0x02;

// ExamplePredictionMarket outcome enum values
export const OUTCOME_NO = 1;
export const OUTCOME_YES = 2;
export const OUTCOME_INCONCLUSIVE = 3;
