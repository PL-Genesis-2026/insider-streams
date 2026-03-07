import {
  AuctionClosed as AuctionClosedEvent,
  AuctionCreated as AuctionCreatedEvent,
  AuctionForceClosed as AuctionForceClosedEvent,
  BidPlaced as BidPlacedEvent,
  ExpectedAuthorUpdated as ExpectedAuthorUpdatedEvent,
  ExpectedWorkflowIdUpdated as ExpectedWorkflowIdUpdatedEvent,
  ExpectedWorkflowNameUpdated as ExpectedWorkflowNameUpdatedEvent,
  ExternalEventResolved as ExternalEventResolvedEvent,
  ForwarderAddressUpdated as ForwarderAddressUpdatedEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
  ReputationUpdated as ReputationUpdatedEvent,
  SecurityWarning as SecurityWarningEvent,
  SellerRegistered as SellerRegisteredEvent,
  MarketplaceUpdated as MarketplaceUpdatedEvent
} from "../generated/SecretMarketplace/SecretMarketplace"
import {
  AuctionClosed,
  AuctionCreated,
  AuctionForceClosed,
  BidPlaced,
  ExpectedAuthorUpdated,
  ExpectedWorkflowIdUpdated,
  ExpectedWorkflowNameUpdated,
  ExternalEventResolved,
  ForwarderAddressUpdated,
  OwnershipTransferred,
  ReputationUpdated,
  SecurityWarning,
  SellerRegistered,
  MarketplaceUpdated
} from "../generated/schema"

export function handleAuctionClosed(event: AuctionClosedEvent): void {
  let entity = new AuctionClosed(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.auctionId = event.params.auctionId
  entity.winningBid = event.params.winningBid
  entity.sellerId = event.params.seller
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
  entity.sellerId = event.params.seller
  entity.eventTitle = event.params.eventTitle
  entity.endTime = event.params.endTime

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleAuctionForceClosed(event: AuctionForceClosedEvent): void {
  let entity = new AuctionForceClosed(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.auctionId = event.params.auctionId
  entity.heldAmount = event.params.heldAmount
  entity.sellerId = event.params.seller
  entity.eventId = event.params.eventId
  entity.reputationDelta = event.params.reputationDelta

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleBidPlaced(event: BidPlacedEvent): void {
  let entity = new BidPlaced(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.auctionId = event.params.auctionId
  entity.bidAmount = event.params.bidAmount
  entity.previousBid = event.params.previousBid

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
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
  entity.reputationDelta = event.params.delta
  entity.auctionsAffected = event.params.auctionsAffected

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

export function handleReputationUpdated(event: ReputationUpdatedEvent): void {
  let entity = new ReputationUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.sellerId = event.params.seller
  entity.auctionId = event.params.auctionId
  entity.reputationDelta = event.params.delta
  entity.newScore = event.params.newScore

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
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
  entity.sellerId = event.params.seller

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
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
