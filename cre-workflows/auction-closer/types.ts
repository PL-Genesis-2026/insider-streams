import { z } from "zod";
export { secretMarketplaceAbi } from "@private-streams/common";

// ┌──────────────────────────────────────────────────────────────────────┐
// │ CRON SCHEDULE — Change this to reduce polling frequency after demo  │
// │ Current: every 30 seconds                                          │
// │ Production suggestion: "0 */1 * * * *" (every 1 minute)            │
// └──────────────────────────────────────────────────────────────────────┘
export const CRON_SCHEDULE = "*/30 * * * * *";

// Config schema validated at startup by CRE Runner
const evmConfigSchema = z.object({
  chainSelectorName: z.string().min(1),
  secretMarketplaceAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/u, "must be a 0x-prefixed 20-byte hex"),
  gasLimit: z
    .string()
    .regex(/^\d+$/, "gasLimit must be a numeric string")
    .refine((val) => Number(val) > 0, { message: "gasLimit must be > 0" }),
});

export const configSchema = z.object({
  evms: z.array(evmConfigSchema).min(1, "At least one EVM config is required"),
});

export type Config = z.infer<typeof configSchema>;

// CRE report action byte for closing an auction
export const ACTION_CLOSE_AUCTION = 0x00;
