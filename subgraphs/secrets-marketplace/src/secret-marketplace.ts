import {
  AuctionClosed as AuctionClosedEvent,
  AuctionClosePending as AuctionClosePendingEvent,
  AuctionCreated as AuctionCreatedEvent,
  AuctionCancelled as AuctionCancelledEvent,
  AuctionAdminExpired as AuctionAdminExpiredEvent,
  BidPlaced as BidPlacedEvent,
  DepositedFor as DepositedForEvent,
  WithdrawnFor as WithdrawnForEvent,
  ExternalEventResolved as ExternalEventResolvedEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
  SellerReputationScoreUpdated as SellerReputationScoreUpdatedEvent,
  SellerRegistered as SellerRegisteredEvent,
  SettlerUpdated as SettlerUpdatedEvent
} from "../generated/FHESecretMarketplace/FHESecretMarketplace"
import {
  AuctionClosed,
  AuctionClosePending,
  AuctionCreated,
  AuctionCancelled,
  AuctionAdminExpired,
  BidPlaced,
  DepositedFor,
  WithdrawnFor,
  ExternalEventResolved,
  OwnershipTransferred,
  SellerReputationScoreUpdated,
  SellerRegistered,
  SettlerUpdated,
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

export function handleAuctionClosePending(event: AuctionClosePendingEvent): void {
  let entity = new AuctionClosePending(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.auctionId = event.params.auctionId
  entity.sellerId = event.params.sellerId
  entity.eventId = event.params.eventId

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
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
  entity.secretDataCid = event.params.secretDataCid

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()

  // Upsert Seller
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

  // Create Auction summary
  let auction = new Auction(event.params.auctionId.toString())
  auction.auctionId = event.params.auctionId
  auction.eventId = event.params.eventId
  auction.sellerId = sellerId
  auction.seller = sellerId
  auction.eventTitle = event.params.eventTitle
  auction.endTime = event.params.endTime
  auction.secretDataCid = event.params.secretDataCid
  auction.bidCount = 0
  auction.currentBid = BigInt.fromI32(0)
  auction.status = "Open"
  auction.blockNumber = event.block.number
  auction.blockTimestamp = event.block.timestamp
  auction.transactionHash = event.transaction.hash
  auction.save()

  // Update Seller summary
  seller.totalAuctionCount = seller.totalAuctionCount + 1
  seller.openAuctionCount = seller.openAuctionCount + 1
  seller.save()
}

export function handleAuctionCancelled(event: AuctionCancelledEvent): void {
  let entity = new AuctionCancelled(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.auctionId = event.params.auctionId
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
    auction.bidCount = auction.bidCount + 1
    auction.currentBid = event.params.bidAmount
    auction.save()
  }
}

export function handleDepositedFor(event: DepositedForEvent): void {
  let entity = new DepositedFor(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.userId = event.params.userId

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleWithdrawnFor(event: WithdrawnForEvent): void {
  let entity = new WithdrawnFor(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.userId = event.params.userId

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

export function handleSettlerUpdated(event: SettlerUpdatedEvent): void {
  let entity = new SettlerUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.previousSettler = event.params.previousSettler
  entity.newSettler = event.params.newSettler

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleAuctionAdminExpired(event: AuctionAdminExpiredEvent): void {
  let entity = new AuctionAdminExpired(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.auctionId = event.params.auctionId

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()

  // Update Auction.endTime to reflect the forced expiry (set to block.timestamp by contract)
  let auction = Auction.load(event.params.auctionId.toString())
  if (auction != null) {
    auction.endTime = event.block.timestamp
    auction.save()
  }
}
