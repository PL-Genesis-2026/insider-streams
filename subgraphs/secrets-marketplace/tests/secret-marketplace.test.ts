import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts"
import { AuctionClosed } from "../generated/schema"
import { AuctionClosed as AuctionClosedEvent } from "../generated/SecretMarketplace/SecretMarketplace"
import { handleAuctionClosed } from "../src/secret-marketplace"
import { createAuctionClosedEvent } from "./secret-marketplace-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#tests-structure

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let auctionId = BigInt.fromI32(234)
    let buyer = Address.fromString("0x0000000000000000000000000000000000000001")
    let winningBid = BigInt.fromI32(234)
    let seller = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let externalMarketId = BigInt.fromI32(234)
    let newAuctionClosedEvent = createAuctionClosedEvent(
      auctionId,
      buyer,
      winningBid,
      seller,
      externalMarketId
    )
    handleAuctionClosed(newAuctionClosedEvent)
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#write-a-unit-test

  test("AuctionClosed created and stored", () => {
    assert.entityCount("AuctionClosed", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "AuctionClosed",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "auctionId",
      "234"
    )
    assert.fieldEquals(
      "AuctionClosed",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "buyer",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "AuctionClosed",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "winningBid",
      "234"
    )
    assert.fieldEquals(
      "AuctionClosed",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "seller",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "AuctionClosed",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "externalMarketId",
      "234"
    )

    // More assert options:
    // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#asserts
  })
})
