export const CREATE_AUCTION_EIP712_DOMAIN = {
  name: "InsiderStreams",
  version: "1",
  chainId: 11155111,
} as const;

export const CREATE_AUCTION_EIP712_TYPES = {
  CreateAuction: [
    { name: "eventId", type: "string" },
    { name: "privateLeg", type: "string" },
    { name: "duration", type: "string" },
    { name: "timestamp", type: "uint256" },
  ],
} as const;

export const CREATE_AUCTION_DURATIONS = ["5m", "15m", "30m", "1h", "3h", "6h", "12h", "24h", "48h"] as const;

export type CreateAuctionDuration = (typeof CREATE_AUCTION_DURATIONS)[number];

export const CREATE_AUCTION_DURATION_SECONDS: Record<
  CreateAuctionDuration,
  number
> = {
  "5m": 5 * 60,
  "15m": 15 * 60,
  "30m": 30 * 60,
  "1h": 3600,
  "3h": 3 * 3600,
  "6h": 6 * 3600,
  "12h": 12 * 3600,
  "24h": 24 * 3600,
  "48h": 48 * 3600,
};
