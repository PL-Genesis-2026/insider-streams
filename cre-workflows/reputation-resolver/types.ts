import { z } from "zod";
export { secretMarketplaceAbi, examplePredictionMarketAbi } from "@private-streams/common";

export const CRON_SCHEDULE = "*/60 * * * * *";

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
  evms: z.array(evmConfigSchema).min(1, "At least one EVM config is required"),
});

export type Config = z.infer<typeof configSchema>;

export const ACTION_RECORD_EVENT_OUTCOME = 0x02;

// ExamplePredictionMarket outcome enum values
export const OUTCOME_NO = 1;
export const OUTCOME_YES = 2;

// ExamplePredictionMarket status enum values
export const STATUS_SETTLED = 2;
