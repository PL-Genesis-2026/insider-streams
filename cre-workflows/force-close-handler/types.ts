import { z } from "zod";
export { secretMarketplaceAbi } from "@private-streams/common";

const evmConfigSchema = z.object({
  chainSelectorName: z.string().min(1),
  secretMarketplaceAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/u, "must be a 0x-prefixed 20-byte hex"),
});

export const configSchema = z.object({
  supabaseUrl: z.string().startsWith("https://"),
  evms: z.array(evmConfigSchema).min(1, "At least one EVM config is required"),
});

export type Config = z.infer<typeof configSchema>;
