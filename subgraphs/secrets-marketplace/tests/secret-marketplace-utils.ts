import { newMockEvent } from "matchstick-as"
import { ethereum, BigInt, Address, Bytes } from "@graphprotocol/graph-ts"
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
  SettlerUpdated
} from "../generated/FHESecretMarketplace/FHESecretMarketplace"

export function createAuctionClosedEvent(
  auctionId: BigInt,
  winningBid: u64,
  sellerId: string,
  eventId: BigInt
): AuctionClosed {
  let event = changetype<AuctionClosed>(newMockEvent())
  event.parameters = new Array()
  event.parameters.push(new ethereum.EventParam("auctionId", ethereum.Value.fromUnsignedBigInt(auctionId)))
  event.parameters.push(new ethereum.EventParam("winningBid", ethereum.Value.fromUnsignedBigInt(BigInt.fromU64(winningBid))))
  event.parameters.push(new ethereum.EventParam("sellerId", ethereum.Value.fromString(sellerId)))
  event.parameters.push(new ethereum.EventParam("eventId", ethereum.Value.fromUnsignedBigInt(eventId)))
  return event
}

export function createAuctionClosePendingEvent(
  auctionId: BigInt,
  sellerId: string,
  eventId: BigInt
): AuctionClosePending {
  let event = changetype<AuctionClosePending>(newMockEvent())
  event.parameters = new Array()
  event.parameters.push(new ethereum.EventParam("auctionId", ethereum.Value.fromUnsignedBigInt(auctionId)))
  event.parameters.push(new ethereum.EventParam("sellerId", ethereum.Value.fromString(sellerId)))
  event.parameters.push(new ethereum.EventParam("eventId", ethereum.Value.fromUnsignedBigInt(eventId)))
  return event
}

export function createAuctionCreatedEvent(
  auctionId: BigInt,
  eventId: BigInt,
  sellerId: string,
  eventTitle: string,
  endTime: BigInt,
  secretDataCid: Bytes
): AuctionCreated {
  let event = changetype<AuctionCreated>(newMockEvent())
  event.parameters = new Array()
  event.parameters.push(new ethereum.EventParam("auctionId", ethereum.Value.fromUnsignedBigInt(auctionId)))
  event.parameters.push(new ethereum.EventParam("eventId", ethereum.Value.fromUnsignedBigInt(eventId)))
  event.parameters.push(new ethereum.EventParam("sellerId", ethereum.Value.fromString(sellerId)))
  event.parameters.push(new ethereum.EventParam("eventTitle", ethereum.Value.fromString(eventTitle)))
  event.parameters.push(new ethereum.EventParam("endTime", ethereum.Value.fromUnsignedBigInt(endTime)))
  event.parameters.push(new ethereum.EventParam("secretDataCid", ethereum.Value.fromFixedBytes(secretDataCid)))
  return event
}

export function createAuctionCancelledEvent(
  auctionId: BigInt,
  sellerId: string,
  eventId: BigInt
): AuctionCancelled {
  let event = changetype<AuctionCancelled>(newMockEvent())
  event.parameters = new Array()
  event.parameters.push(new ethereum.EventParam("auctionId", ethereum.Value.fromUnsignedBigInt(auctionId)))
  event.parameters.push(new ethereum.EventParam("sellerId", ethereum.Value.fromString(sellerId)))
  event.parameters.push(new ethereum.EventParam("eventId", ethereum.Value.fromUnsignedBigInt(eventId)))
  return event
}

export function createBidPlacedEvent(
  auctionId: BigInt,
  bidAmount: BigInt = BigInt.fromI32(0),
  previousBid: BigInt = BigInt.fromI32(0)
): BidPlaced {
  let event = changetype<BidPlaced>(newMockEvent())
  event.parameters = new Array()
  event.parameters.push(new ethereum.EventParam("auctionId", ethereum.Value.fromUnsignedBigInt(auctionId)))
  event.parameters.push(new ethereum.EventParam("bidAmount", ethereum.Value.fromUnsignedBigInt(bidAmount)))
  event.parameters.push(new ethereum.EventParam("previousBid", ethereum.Value.fromUnsignedBigInt(previousBid)))
  return event
}

export function createDepositedForEvent(userId: string): DepositedFor {
  let event = changetype<DepositedFor>(newMockEvent())
  event.parameters = new Array()
  event.parameters.push(new ethereum.EventParam("userId", ethereum.Value.fromString(userId)))
  return event
}

export function createWithdrawnForEvent(userId: string): WithdrawnFor {
  let event = changetype<WithdrawnFor>(newMockEvent())
  event.parameters = new Array()
  event.parameters.push(new ethereum.EventParam("userId", ethereum.Value.fromString(userId)))
  return event
}

export function createExternalEventResolvedEvent(
  externalEventId: BigInt,
  auctionsAffected: BigInt
): ExternalEventResolved {
  let event = changetype<ExternalEventResolved>(newMockEvent())
  event.parameters = new Array()
  event.parameters.push(new ethereum.EventParam("externalEventId", ethereum.Value.fromUnsignedBigInt(externalEventId)))
  event.parameters.push(new ethereum.EventParam("auctionsAffected", ethereum.Value.fromUnsignedBigInt(auctionsAffected)))
  return event
}

export function createSellerRegisteredEvent(
  sellerId: string
): SellerRegistered {
  let event = changetype<SellerRegistered>(newMockEvent())
  event.parameters = new Array()
  event.parameters.push(new ethereum.EventParam("sellerId", ethereum.Value.fromString(sellerId)))
  return event
}

export function createSettlerUpdatedEvent(
  previousSettler: Address,
  newSettler: Address
): SettlerUpdated {
  let event = changetype<SettlerUpdated>(newMockEvent())
  event.parameters = new Array()
  event.parameters.push(new ethereum.EventParam("previousSettler", ethereum.Value.fromAddress(previousSettler)))
  event.parameters.push(new ethereum.EventParam("newSettler", ethereum.Value.fromAddress(newSettler)))
  return event
}
