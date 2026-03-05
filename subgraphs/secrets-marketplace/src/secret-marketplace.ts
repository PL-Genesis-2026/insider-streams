import {
  AuctionClosed as AuctionClosedEvent,
  AuctionCreated as AuctionCreatedEvent,
  AuctionForceClosed as AuctionForceClosedEvent,
  BidPlaced as BidPlacedEvent,
  ExpectedAuthorUpdated as ExpectedAuthorUpdatedEvent,
  ExpectedWorkflowIdUpdated as ExpectedWorkflowIdUpdatedEvent,
  ExpectedWorkflowNameUpdated as ExpectedWorkflowNameUpdatedEvent,
  ForwarderAddressUpdated as ForwarderAddressUpdatedEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
  ReputationUpdated as ReputationUpdatedEvent,
  SecurityWarning as SecurityWarningEvent,
  TradeExecuted as TradeExecutedEvent
} from "../generated/SecretMarketplace/SecretMarketplace"
import {
  AuctionClosed,
  AuctionCreated,
  AuctionForceClosed,
  BidPlaced,
  ExpectedAuthorUpdated,
  ExpectedWorkflowIdUpdated,
  ExpectedWorkflowNameUpdated,
  ForwarderAddressUpdated,
  OwnershipTransferred,
  ReputationUpdated,
  SecurityWarning,
  TradeExecuted
} from "../generated/schema"

export function handleAuctionClosed(event: AuctionClosedEvent): void {
  let entity = new AuctionClosed(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.auctionId = event.params.auctionId
  entity.buyer = event.params.buyer
  entity.winningBid = event.params.winningBid
  entity.seller = event.params.seller
  entity.externalMarketId = event.params.externalMarketId

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
  entity.seller = event.params.seller
  entity.externalMarketId = event.params.externalMarketId
  entity.reservePrice = event.params.reservePrice
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
  entity.refundedBidder = event.params.refundedBidder
  entity.refundAmount = event.params.refundAmount
  entity.seller = event.params.seller
  entity.externalMarketId = event.params.externalMarketId
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
  entity.bidder = event.params.bidder
  entity.amount = event.params.amount
  entity.previousBidder = event.params.previousBidder
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
  entity.seller = event.params.seller
  entity.auctionId = event.params.auctionId
  entity.delta = event.params.delta
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

export function handleTradeExecuted(event: TradeExecutedEvent): void {
  let entity = new TradeExecuted(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.auctionId = event.params.auctionId
  entity.externalMarketId = event.params.externalMarketId
  entity.buyer = event.params.buyer
  entity.amount = event.params.amount

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
