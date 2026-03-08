import {
  CREATE_AUCTION_DURATIONS,
  CREATE_AUCTION_DURATION_SECONDS,
  CREATE_AUCTION_EIP712_DOMAIN,
  CREATE_AUCTION_EIP712_TYPES,
  type CreateAuctionDuration,
} from "@private-streams/common";
import { z } from "zod";

export {
  CREATE_AUCTION_DURATIONS,
  CREATE_AUCTION_DURATION_SECONDS,
  CREATE_AUCTION_EIP712_DOMAIN,
  CREATE_AUCTION_EIP712_TYPES,
};
export type { CreateAuctionDuration };

const nonNegativeIntegerString = z
  .string()
  .min(1, "eventId is required")
  .refine((value) => {
    try {
      return BigInt(value) >= BigInt(0);
    } catch {
      return false;
    }
  }, "eventId must be a non-negative integer string");

export const createAuctionInputSchema = z.object({
  eventId: nonNegativeIntegerString,
  privateLeg: z.enum(["yes", "no"], "privateLeg must be yes or no"),
  secretPayload: z.string().trim().min(1, "secretPayload is required"),
  duration: z.enum(
    CREATE_AUCTION_DURATIONS,
    "duration must be 6h, 12h, 24h, or 48h",
  ),
});

export const createAuctionRequestSchema = createAuctionInputSchema.extend({
  timestamp: z.number().int("timestamp must be an integer"),
  signature: z
    .string()
    .regex(/^0x[a-fA-F0-9]+$/, "signature must be a hex string"),
});

export type CreateAuctionInput = z.infer<typeof createAuctionInputSchema>;
export type CreateAuctionRequest = z.infer<typeof createAuctionRequestSchema>;

export type CreateAuctionSuccessResponse = {
  success: true;
  auctionId: string;
  sellerId: string;
  txHash: `0x${string}`;
};

export type CreateAuctionErrorResponse = {
  success?: false;
  error: string;
  code: string;
  auctionId?: string;
  txHash?: `0x${string}`;
};

export type CreateAuctionResponse =
  | CreateAuctionSuccessResponse
  | CreateAuctionErrorResponse;
