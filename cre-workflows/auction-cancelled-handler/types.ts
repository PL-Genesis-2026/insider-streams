/*
NOTE TO CLAUDE: This code relates to the old CRE based system. It's being kept in until you've confirmed the Zama port works end to end. You can use it as reference for how the old system used to work, but you should not update or maintain these files.
*/
import { z } from "zod";
export { secretMarketplaceAbi } from "@private-streams/common";

const evmConfigSchema = z.object({
  chainSelectorName: z.string().min(1),
  secretMarketplaceAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/u, "must be a 0x-prefixed 20-byte hex"),
});

export const configSchema = z.object({
  supabaseUrl: z.string().startsWith("https://"),
  evms: z.array(evmConfigSchema).min(1, "At least one EVM config is required"),
  ntfyEnabled: z.boolean().default(true),
  ntfyHost: z.string().startsWith("http").default("http://localhost:8090"),
  ntfyTopic: z.string().default("auction-cancelled-handler-cre"),
  ntfyUser: z.string().default("vps"),
});

export type Config = z.infer<typeof configSchema>;
