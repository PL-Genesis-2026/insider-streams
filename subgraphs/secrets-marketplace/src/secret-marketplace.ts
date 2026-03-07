import {
  AuctionClosed as AuctionClosedEvent,
  AuctionCreated as AuctionCreatedEvent,
  AuctionCancelled as AuctionCancelledEvent,
  BidPlaced as BidPlacedEvent,
  ExpectedAuthorUpdated as ExpectedAuthorUpdatedEvent,
  ExpectedWorkflowIdUpdated as ExpectedWorkflowIdUpdatedEvent,
  ExpectedWorkflowNameUpdated as ExpectedWorkflowNameUpdatedEvent,
  ExternalEventResolved as ExternalEventResolvedEvent,
  ForwarderAddressUpdated as ForwarderAddressUpdatedEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
  SellerReputationScoreUpdated as SellerReputationScoreUpdatedEvent,
  SecurityWarning as SecurityWarningEvent,
  SellerRegistered as SellerRegisteredEvent,
  MarketplaceUpdated as MarketplaceUpdatedEvent
} from "../generated/SecretMarketplace/SecretMarketplace"
import {
  AuctionClosed,
  AuctionCreated,
  AuctionCancelled,
  BidPlaced,
  ExpectedAuthorUpdated,
  ExpectedWorkflowIdUpdated,
  ExpectedWorkflowNameUpdated,
  ExternalEventResolved,
  ForwarderAddressUpdated,
  OwnershipTransferred,
  SellerReputationScoreUpdated,
  SecurityWarning,
  SellerRegistered,
  MarketplaceUpdated,
  Auction,
  Seller
} from "../generated/schema"
import { BigInt } from "@graphprotocol/graph-ts"

export function handleAuctionClosed(event: AuctionClosedEvent): void {
  let entity = new AuctionClosed(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.auctionId = event.params.auctionId
  entity.winningBid = event.params.winningBid
  entity.sellerId = event.params.sellerId
  entity.eventId = event.params.eventId

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()

  // Update Auction summary
  let auction = Auction.load(event.params.auctionId.toString())
  if (auction != null) {
    auction.status = "Closed"
    auction.save()
  }

  // Update Seller summary
  let seller = Seller.load(event.params.sellerId)
  if (seller != null) {
    seller.openAuctionCount = seller.openAuctionCount - 1
    seller.totalEarnings = seller.totalEarnings.plus(event.params.winningBid)
    seller.save()
  }
}

export function handleAuctionCreated(event: AuctionCreatedEvent): void {
  let entity = new AuctionCreated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.auctionId = event.params.auctionId
  entity.eventId = event.params.eventId
  entity.sellerId = event.params.sellerId
  entity.eventTitle = event.params.eventTitle
  entity.endTime = event.params.endTime

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()

  // Create Auction summary
  let auction = new Auction(event.params.auctionId.toString())
  auction.auctionId = event.params.auctionId
  auction.eventId = event.params.eventId
  auction.sellerId = event.params.sellerId
  auction.seller = event.params.sellerId
  auction.eventTitle = event.params.eventTitle
  auction.endTime = event.params.endTime
  auction.currentBid = BigInt.fromI32(0)
  auction.bidCount = 0
  auction.status = "Open"
  auction.blockNumber = event.block.number
  auction.blockTimestamp = event.block.timestamp
  auction.transactionHash = event.transaction.hash
  auction.save()

  // Update Seller summary
  let seller = Seller.load(event.params.sellerId)
  if (seller != null) {
    seller.totalAuctionCount = seller.totalAuctionCount + 1
    seller.openAuctionCount = seller.openAuctionCount + 1
    seller.save()
  }
}

export function handleAuctionCancelled(event: AuctionCancelledEvent): void {
  let entity = new AuctionCancelled(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.auctionId = event.params.auctionId
  entity.cancelledBidAmount = event.params.cancelledBidAmount
  entity.sellerId = event.params.sellerId
  entity.eventId = event.params.eventId

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()

  // Update Auction summary
  let auction = Auction.load(event.params.auctionId.toString())
  if (auction != null) {
    auction.status = "Cancelled"
    auction.save()
  }

  // Update Seller summary
  let seller = Seller.load(event.params.sellerId)
  if (seller != null) {
    seller.openAuctionCount = seller.openAuctionCount - 1
    seller.save()
  }
}

export function handleBidPlaced(event: BidPlacedEvent): void {
  let entity = new BidPlaced(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.auctionId = event.params.auctionId
  entity.bidAmount = event.params.bidAmount
  entity.previousBid = event.params.previousBid
  entity.auction = event.params.auctionId.toString()

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()

  // Update Auction summary
  let auction = Auction.load(event.params.auctionId.toString())
  if (auction != null) {
    auction.currentBid = event.params.bidAmount
    auction.bidCount = auction.bidCount + 1
    auction.save()
  }
}

export function handleExpectedAuthorUpdated(
  event: ExpectedAuthorUpdatedEvent
): void {
  let entity = new ExpectedAuthorUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.previousAuthor = event.params.previousAuthor
  entity.newAuthor = event.params.newAuthor

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleExpectedWorkflowIdUpdated(
  event: ExpectedWorkflowIdUpdatedEvent
): void {
  let entity = new ExpectedWorkflowIdUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.previousId = event.params.previousId
  entity.newId = event.params.newId

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleExpectedWorkflowNameUpdated(
  event: ExpectedWorkflowNameUpdatedEvent
): void {
  let entity = new ExpectedWorkflowNameUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.previousName = event.params.previousName
  entity.newName = event.params.newName

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleExternalEventResolved(
  event: ExternalEventResolvedEvent
): void {
  let entity = new ExternalEventResolved(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.externalEventId = event.params.externalEventId
  entity.auctionsAffected = event.params.auctionsAffected
  entity.resultsApplied = event.params.resultsApplied

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleForwarderAddressUpdated(
  event: ForwarderAddressUpdatedEvent
): void {
  let entity = new ForwarderAddressUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.previousForwarder = event.params.previousForwarder
  entity.newForwarder = event.params.newForwarder

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleOwnershipTransferred(
  event: OwnershipTransferredEvent
): void {
  let entity = new OwnershipTransferred(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.previousOwner = event.params.previousOwner
  entity.newOwner = event.params.newOwner

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleSellerReputationScoreUpdated(event: SellerReputationScoreUpdatedEvent): void {
  let entity = new SellerReputationScoreUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.sellerId = event.params.sellerId
  entity.auctionId = event.params.auctionId
  entity.predictionOutcome = event.params.predictionOutcome
  entity.scoreChange = event.params.scoreChange
  entity.newScore = event.params.newScore

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()

  // Update Auction summary
  let auction = Auction.load(event.params.auctionId.toString())
  if (auction != null) {
    auction.predictionOutcome = event.params.predictionOutcome
    auction.scoreChange = event.params.scoreChange
    auction.save()
  }

  // Update Seller summary
  let seller = Seller.load(event.params.sellerId)
  if (seller != null) {
    seller.reputationScore = event.params.newScore

    let outcome = event.params.predictionOutcome
    if (outcome == 1) {
      seller.auctionsWithCorrectPredictionsCount = seller.auctionsWithCorrectPredictionsCount + 1
    } else if (outcome == 2) {
      seller.auctionsWithWrongPredictionsCount = seller.auctionsWithWrongPredictionsCount + 1
    } else {
      seller.unscorableAuctionCount = seller.unscorableAuctionCount + 1
    }

    seller.save()
  }
}

export function handleSecurityWarning(event: SecurityWarningEvent): void {
  let entity = new SecurityWarning(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.message = event.params.message

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleSellerRegistered(event: SellerRegisteredEvent): void {
  let entity = new SellerRegistered(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.sellerId = event.params.sellerId

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()

  // Create Seller summary (idempotent — createAuction auto-registers)
  let sellerId = event.params.sellerId
  let seller = Seller.load(sellerId)
  if (seller == null) {
    seller = new Seller(sellerId)
    seller.sellerId = sellerId
    seller.reputationScore = BigInt.fromI32(0)
    seller.totalAuctionCount = 0
    seller.openAuctionCount = 0
    seller.auctionsWithCorrectPredictionsCount = 0
    seller.auctionsWithWrongPredictionsCount = 0
    seller.unscorableAuctionCount = 0
    seller.totalEarnings = BigInt.fromI32(0)
    seller.blockNumber = event.block.number
    seller.blockTimestamp = event.block.timestamp
    seller.transactionHash = event.transaction.hash
    seller.save()
  }
}

export function handleMarketplaceUpdated(event: MarketplaceUpdatedEvent): void {
  let entity = new MarketplaceUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.previousMarketplace = event.params.previousMarketplace
  entity.newMarketplace = event.params.newMarketplace

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
