import {
  assert,
  describe,
  test,
  clearStore,
  afterAll
} from "matchstick-as/assembly/index"
import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts"
import { AuctionCreated, Auction, Seller, BidPlaced } from "../generated/schema"
import {
  handleAuctionCreated,
  handleAuctionClosed,
  handleBidPlaced,
  handleAuctionCancelled,
  handleSellerRegistered,
  handleDepositedFor,
  handleWithdrawnFor,
  handleSettlerUpdated,
  handleExternalEventResolved
} from "../src/secret-marketplace"
import {
  createAuctionCreatedEvent,
  createAuctionClosedEvent,
  createBidPlacedEvent,
  createAuctionCancelledEvent,
  createSellerRegisteredEvent,
  createDepositedForEvent,
  createWithdrawnForEvent,
  createSettlerUpdatedEvent,
  createExternalEventResolvedEvent
} from "./secret-marketplace-utils"

let FAKE_CID = Bytes.fromHexString("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890") as Bytes

describe("FHESecretMarketplace — Subgraph Entities", () => {
  afterAll(() => {
    clearStore()
  })

  test("AuctionCreated creates Auction and Seller entities", () => {
    let event = createAuctionCreatedEvent(
      BigInt.fromI32(0),
      BigInt.fromI32(100),
      "alice",
      "Will BTC hit 100k?",
      BigInt.fromI32(1700000000),
      FAKE_CID
    )
    handleAuctionCreated(event)

    assert.entityCount("AuctionCreated", 1)
    assert.entityCount("Auction", 1)
    assert.entityCount("Seller", 1)

    assert.fieldEquals("Auction", "0", "sellerId", "alice")
    assert.fieldEquals("Auction", "0", "eventTitle", "Will BTC hit 100k?")
    assert.fieldEquals("Auction", "0", "status", "Open")
    assert.fieldEquals("Auction", "0", "bidCount", "0")

    assert.fieldEquals("Seller", "alice", "totalAuctionCount", "1")
    assert.fieldEquals("Seller", "alice", "openAuctionCount", "1")

    clearStore()
  })

  test("BidPlaced increments auction bidCount", () => {
    // Create auction first
    let createEvent = createAuctionCreatedEvent(
      BigInt.fromI32(0),
      BigInt.fromI32(100),
      "alice",
      "Test event",
      BigInt.fromI32(1700000000),
      FAKE_CID
    )
    handleAuctionCreated(createEvent)

    // Place bid — 10 USDC
    let bidEvent = createBidPlacedEvent(BigInt.fromI32(0), BigInt.fromI32(10000000), BigInt.fromI32(0))
    handleBidPlaced(bidEvent)

    assert.entityCount("BidPlaced", 1)
    assert.fieldEquals("Auction", "0", "bidCount", "1")
    assert.fieldEquals("Auction", "0", "currentBid", "10000000")

    // Place another bid — 20 USDC (previous was 10)
    let bidEvent2 = createBidPlacedEvent(BigInt.fromI32(0), BigInt.fromI32(20000000), BigInt.fromI32(10000000))
    handleBidPlaced(bidEvent2)

    assert.fieldEquals("Auction", "0", "bidCount", "2")
    assert.fieldEquals("Auction", "0", "currentBid", "20000000")

    clearStore()
  })

  test("AuctionCancelled updates status and seller counts", () => {
    // Create auction
    let createEvent = createAuctionCreatedEvent(
      BigInt.fromI32(0),
      BigInt.fromI32(100),
      "alice",
      "Test",
      BigInt.fromI32(1700000000),
      FAKE_CID
    )
    handleAuctionCreated(createEvent)

    // Cancel
    let cancelEvent = createAuctionCancelledEvent(BigInt.fromI32(0), "alice", BigInt.fromI32(100))
    handleAuctionCancelled(cancelEvent)

    assert.fieldEquals("Auction", "0", "status", "Cancelled")
    assert.fieldEquals("Seller", "alice", "openAuctionCount", "0")

    clearStore()
  })

  test("DepositedFor creates entity", () => {
    let event = createDepositedForEvent("user-123")
    handleDepositedFor(event)

    assert.entityCount("DepositedFor", 1)

    clearStore()
  })

  test("WithdrawnFor creates entity", () => {
    let event = createWithdrawnForEvent("user-123")
    handleWithdrawnFor(event)

    assert.entityCount("WithdrawnFor", 1)

    clearStore()
  })

  test("ExternalEventResolved creates entity", () => {
    let event = createExternalEventResolvedEvent(BigInt.fromI32(100), BigInt.fromI32(2))
    handleExternalEventResolved(event)

    assert.entityCount("ExternalEventResolved", 1)

    clearStore()
  })

  test("SettlerUpdated creates entity", () => {
    let prev = Address.fromString("0x0000000000000000000000000000000000000001")
    let next = Address.fromString("0x0000000000000000000000000000000000000002")
    let event = createSettlerUpdatedEvent(prev, next)
    handleSettlerUpdated(event)

    assert.entityCount("SettlerUpdated", 1)

    clearStore()
  })
})
