// Minimal ABIs for daemon contract interactions

export const ExamplePredictionMarketABI = [
  "event SettlementRequested(uint256 indexed eventId, string question)",
  "event SettlementResponse(uint256 indexed eventId, uint8 indexed status, uint8 indexed outcome)",
  "function settleEvent(uint256 eventId, uint8 outcome, uint16 confidenceBps, string calldata evidenceURI) external",
  "function getMarketEvent(uint256 eventId) view returns (tuple(string question, address creator, uint256 eventOpen, uint256 eventClose, uint8 status, uint8 outcome, uint256 settledAt, string evidenceURI, uint16 confidenceBps, address yesToken, address noToken, uint256 yesShares, uint256 noShares, bool liquidityWithdrawn))",
  "function nextEventId() view returns (uint256)",
] as const;

export const FHESecretMarketplaceABI = [
  // Views
  "function getOpenAuctions() view returns (uint256[])",
  "function getAuction(uint256 auctionId) view returns (string sellerId, uint256 endTime, bytes32 currentBid, string currentBidderId, uint256 eventId, string eventTitle, uint8 status, bool reputationResolved, bytes32 secretDataCid, uint64 currentBidPlaintext)",
  "function getUnresolvedEvents() view returns (uint256[])",
  "function getEventAuctions(uint256 eventId) view returns (uint256[])",
  "function getSellerAuctions(string sellerId) view returns (uint256[])",
  "function getSeller(string sellerId) view returns (tuple(int256 reputationScore, bool registered))",
  "function getBalance(string userId) view returns (bytes32)",
  "function pendingAuctionClose(uint256 auctionId) view returns (bool)",
  "function pendingReputationDecrypt(uint256 auctionId) view returns (bool)",
  "function eventResolved(uint256 eventId) view returns (bool)",
  "function settler() view returns (address)",
  "function nextAuctionId() view returns (uint256)",
  "function paymentToken() view returns (address)",

  // Admin actions (onlyOwner)
  "function depositFor(string userId, bytes32 encryptedAmount, bytes inputProof) external",
  "function withdrawFor(string userId, bytes32 encryptedAmount, bytes inputProof) external",
  "function createAuction(string sellerId, uint256 eventId, string eventTitle, uint256 endTime, bytes32 encryptedPrediction, bytes32 secretDataCid, bytes32 encryptedSecretKey, bytes inputProof) external returns (uint256)",
  "function placeBid(uint256 auctionId, string bidderId, string previousBidderId, bytes32 encryptedAmount, bytes inputProof, uint64 bidAmountPlaintext) external",
  "function requestBalanceDecrypt(string userId) external",
  "function closeAuction(uint256 auctionId) external",
  "function cancelAuction(uint256 auctionId) external",
  "function adminExpireAuction(uint256 auctionId) external",
  "function finalizeAuctionClose(uint256 auctionId, uint64 winningBid, bytes decryptionProof) external",
  "function resolveEventPredictions(uint256 eventId, bool actualOutcomeIsYes) external",
  "function finalizeReputationResult(uint256 auctionId, bool predictionWasCorrect, bytes decryptionProof) external",
  "function setSettler(address newSettler) external",

  // Events
  "event SellerRegistered(string sellerId)",
  "event AuctionCreated(uint256 indexed auctionId, uint256 indexed eventId, string sellerId, string eventTitle, uint256 endTime, bytes32 secretDataCid)",
  "event BidPlaced(uint256 indexed auctionId, uint64 bidAmount, uint64 previousBid)",
  "event AuctionClosePending(uint256 indexed auctionId, string sellerId, uint256 eventId)",
  "event AuctionClosed(uint256 indexed auctionId, uint64 winningBid, string sellerId, uint256 eventId)",
  "event AuctionCancelled(uint256 indexed auctionId, string sellerId, uint256 eventId)",
  "event ExternalEventResolved(uint256 indexed externalEventId, uint256 auctionsAffected)",
  "event SellerReputationScoreUpdated(string sellerId, uint256 indexed auctionId, uint8 predictionOutcome, int8 scoreChange, int256 newScore)",
  "event AuctionAdminExpired(uint256 indexed auctionId)",
  "event SettlerUpdated(address indexed previousSettler, address indexed newSettler)",
  "event DepositedFor(string userId)",
  "event WithdrawnFor(string userId)",
] as const;

export const MockUsdcABI = [
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address account) view returns (uint256)",
] as const;
