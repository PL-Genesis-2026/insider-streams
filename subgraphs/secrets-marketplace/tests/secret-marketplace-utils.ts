import { newMockEvent } from "matchstick-as"
import { ethereum, BigInt, Address, Bytes } from "@graphprotocol/graph-ts"
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
} from "../generated/SecretMarketplace/SecretMarketplace"

export function createAuctionClosedEvent(
  auctionId: BigInt,
  buyer: Address,
  winningBid: BigInt,
  seller: Address,
  externalEventId: BigInt
): AuctionClosed {
  let auctionClosedEvent = changetype<AuctionClosed>(newMockEvent())

  auctionClosedEvent.parameters = new Array()

  auctionClosedEvent.parameters.push(
    new ethereum.EventParam(
      "auctionId",
      ethereum.Value.fromUnsignedBigInt(auctionId)
    )
  )
  auctionClosedEvent.parameters.push(
    new ethereum.EventParam("buyer", ethereum.Value.fromAddress(buyer))
  )
  auctionClosedEvent.parameters.push(
    new ethereum.EventParam(
      "winningBid",
      ethereum.Value.fromUnsignedBigInt(winningBid)
    )
  )
  auctionClosedEvent.parameters.push(
    new ethereum.EventParam("seller", ethereum.Value.fromAddress(seller))
  )
  auctionClosedEvent.parameters.push(
    new ethereum.EventParam(
      "externalEventId",
      ethereum.Value.fromUnsignedBigInt(externalEventId)
    )
  )

  return auctionClosedEvent
}

export function createAuctionCreatedEvent(
  auctionId: BigInt,
  seller: Address,
  externalEventId: BigInt,
  reservePrice: BigInt,
  endTime: BigInt
): AuctionCreated {
  let auctionCreatedEvent = changetype<AuctionCreated>(newMockEvent())

  auctionCreatedEvent.parameters = new Array()

  auctionCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "auctionId",
      ethereum.Value.fromUnsignedBigInt(auctionId)
    )
  )
  auctionCreatedEvent.parameters.push(
    new ethereum.EventParam("seller", ethereum.Value.fromAddress(seller))
  )
  auctionCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "externalEventId",
      ethereum.Value.fromUnsignedBigInt(externalEventId)
    )
  )
  auctionCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "reservePrice",
      ethereum.Value.fromUnsignedBigInt(reservePrice)
    )
  )
  auctionCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "endTime",
      ethereum.Value.fromUnsignedBigInt(endTime)
    )
  )

  return auctionCreatedEvent
}

export function createAuctionForceClosedEvent(
  auctionId: BigInt,
  refundedBidder: Address,
  refundAmount: BigInt,
  seller: Address,
  externalEventId: BigInt,
  reputationDelta: i32
): AuctionForceClosed {
  let auctionForceClosedEvent = changetype<AuctionForceClosed>(newMockEvent())

  auctionForceClosedEvent.parameters = new Array()

  auctionForceClosedEvent.parameters.push(
    new ethereum.EventParam(
      "auctionId",
      ethereum.Value.fromUnsignedBigInt(auctionId)
    )
  )
  auctionForceClosedEvent.parameters.push(
    new ethereum.EventParam(
      "refundedBidder",
      ethereum.Value.fromAddress(refundedBidder)
    )
  )
  auctionForceClosedEvent.parameters.push(
    new ethereum.EventParam(
      "refundAmount",
      ethereum.Value.fromUnsignedBigInt(refundAmount)
    )
  )
  auctionForceClosedEvent.parameters.push(
    new ethereum.EventParam("seller", ethereum.Value.fromAddress(seller))
  )
  auctionForceClosedEvent.parameters.push(
    new ethereum.EventParam(
      "externalEventId",
      ethereum.Value.fromUnsignedBigInt(externalEventId)
    )
  )
  auctionForceClosedEvent.parameters.push(
    new ethereum.EventParam(
      "reputationDelta",
      ethereum.Value.fromI32(reputationDelta)
    )
  )

  return auctionForceClosedEvent
}

export function createBidPlacedEvent(
  auctionId: BigInt,
  bidder: Address,
  amount: BigInt,
  previousBidder: Address,
  previousBid: BigInt
): BidPlaced {
  let bidPlacedEvent = changetype<BidPlaced>(newMockEvent())

  bidPlacedEvent.parameters = new Array()

  bidPlacedEvent.parameters.push(
    new ethereum.EventParam(
      "auctionId",
      ethereum.Value.fromUnsignedBigInt(auctionId)
    )
  )
  bidPlacedEvent.parameters.push(
    new ethereum.EventParam("bidder", ethereum.Value.fromAddress(bidder))
  )
  bidPlacedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )
  bidPlacedEvent.parameters.push(
    new ethereum.EventParam(
      "previousBidder",
      ethereum.Value.fromAddress(previousBidder)
    )
  )
  bidPlacedEvent.parameters.push(
    new ethereum.EventParam(
      "previousBid",
      ethereum.Value.fromUnsignedBigInt(previousBid)
    )
  )

  return bidPlacedEvent
}

export function createExpectedAuthorUpdatedEvent(
  previousAuthor: Address,
  newAuthor: Address
): ExpectedAuthorUpdated {
  let expectedAuthorUpdatedEvent =
    changetype<ExpectedAuthorUpdated>(newMockEvent())

  expectedAuthorUpdatedEvent.parameters = new Array()

  expectedAuthorUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "previousAuthor",
      ethereum.Value.fromAddress(previousAuthor)
    )
  )
  expectedAuthorUpdatedEvent.parameters.push(
    new ethereum.EventParam("newAuthor", ethereum.Value.fromAddress(newAuthor))
  )

  return expectedAuthorUpdatedEvent
}

export function createExpectedWorkflowIdUpdatedEvent(
  previousId: Bytes,
  newId: Bytes
): ExpectedWorkflowIdUpdated {
  let expectedWorkflowIdUpdatedEvent =
    changetype<ExpectedWorkflowIdUpdated>(newMockEvent())

  expectedWorkflowIdUpdatedEvent.parameters = new Array()

  expectedWorkflowIdUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "previousId",
      ethereum.Value.fromFixedBytes(previousId)
    )
  )
  expectedWorkflowIdUpdatedEvent.parameters.push(
    new ethereum.EventParam("newId", ethereum.Value.fromFixedBytes(newId))
  )

  return expectedWorkflowIdUpdatedEvent
}

export function createExpectedWorkflowNameUpdatedEvent(
  previousName: Bytes,
  newName: Bytes
): ExpectedWorkflowNameUpdated {
  let expectedWorkflowNameUpdatedEvent =
    changetype<ExpectedWorkflowNameUpdated>(newMockEvent())

  expectedWorkflowNameUpdatedEvent.parameters = new Array()

  expectedWorkflowNameUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "previousName",
      ethereum.Value.fromFixedBytes(previousName)
    )
  )
  expectedWorkflowNameUpdatedEvent.parameters.push(
    new ethereum.EventParam("newName", ethereum.Value.fromFixedBytes(newName))
  )

  return expectedWorkflowNameUpdatedEvent
}

export function createForwarderAddressUpdatedEvent(
  previousForwarder: Address,
  newForwarder: Address
): ForwarderAddressUpdated {
  let forwarderAddressUpdatedEvent =
    changetype<ForwarderAddressUpdated>(newMockEvent())

  forwarderAddressUpdatedEvent.parameters = new Array()

  forwarderAddressUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "previousForwarder",
      ethereum.Value.fromAddress(previousForwarder)
    )
  )
  forwarderAddressUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "newForwarder",
      ethereum.Value.fromAddress(newForwarder)
    )
  )

  return forwarderAddressUpdatedEvent
}

export function createOwnershipTransferredEvent(
  previousOwner: Address,
  newOwner: Address
): OwnershipTransferred {
  let ownershipTransferredEvent =
    changetype<OwnershipTransferred>(newMockEvent())

  ownershipTransferredEvent.parameters = new Array()

  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam(
      "previousOwner",
      ethereum.Value.fromAddress(previousOwner)
    )
  )
  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam("newOwner", ethereum.Value.fromAddress(newOwner))
  )

  return ownershipTransferredEvent
}

export function createReputationUpdatedEvent(
  seller: Address,
  auctionId: BigInt,
  delta: i32,
  newScore: BigInt
): ReputationUpdated {
  let reputationUpdatedEvent = changetype<ReputationUpdated>(newMockEvent())

  reputationUpdatedEvent.parameters = new Array()

  reputationUpdatedEvent.parameters.push(
    new ethereum.EventParam("seller", ethereum.Value.fromAddress(seller))
  )
  reputationUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "auctionId",
      ethereum.Value.fromUnsignedBigInt(auctionId)
    )
  )
  reputationUpdatedEvent.parameters.push(
    new ethereum.EventParam("delta", ethereum.Value.fromI32(delta))
  )
  reputationUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "newScore",
      ethereum.Value.fromSignedBigInt(newScore)
    )
  )

  return reputationUpdatedEvent
}

export function createSecurityWarningEvent(message: string): SecurityWarning {
  let securityWarningEvent = changetype<SecurityWarning>(newMockEvent())

  securityWarningEvent.parameters = new Array()

  securityWarningEvent.parameters.push(
    new ethereum.EventParam("message", ethereum.Value.fromString(message))
  )

  return securityWarningEvent
}

export function createTradeExecutedEvent(
  auctionId: BigInt,
  externalEventId: BigInt,
  buyer: Address,
  amount: BigInt
): TradeExecuted {
  let tradeExecutedEvent = changetype<TradeExecuted>(newMockEvent())

  tradeExecutedEvent.parameters = new Array()

  tradeExecutedEvent.parameters.push(
    new ethereum.EventParam(
      "auctionId",
      ethereum.Value.fromUnsignedBigInt(auctionId)
    )
  )
  tradeExecutedEvent.parameters.push(
    new ethereum.EventParam(
      "externalEventId",
      ethereum.Value.fromUnsignedBigInt(externalEventId)
    )
  )
  tradeExecutedEvent.parameters.push(
    new ethereum.EventParam("buyer", ethereum.Value.fromAddress(buyer))
  )
  tradeExecutedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return tradeExecutedEvent
}
