import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts"
import { EventCreated } from "../generated/schema"
import { EventCreated as EventCreatedEvent } from "../generated/ExamplePredictionMarket/ExamplePredictionMarket"
import { handleEventCreated } from "../src/example-prediction-market"
import { createEventCreatedEvent } from "./example-prediction-market-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#tests-structure

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let eventId = BigInt.fromI32(234)
    let creator = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let question = "Example string value"
    let eventOpen = BigInt.fromI32(234)
    let eventClose = BigInt.fromI32(234)
    let duration = BigInt.fromI32(234)
    let yesToken = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let noToken = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let newEventCreatedEvent = createEventCreatedEvent(
      eventId,
      creator,
      question,
      eventOpen,
      eventClose,
      duration,
      yesToken,
      noToken
    )
    handleEventCreated(newEventCreatedEvent)
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#write-a-unit-test

  test("EventCreated created and stored", () => {
    assert.entityCount("EventCreated", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "EventCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "eventId",
      "234"
    )
    assert.fieldEquals(
      "EventCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "creator",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "EventCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "question",
      "Example string value"
    )
    assert.fieldEquals(
      "EventCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "eventOpen",
      "234"
    )
    assert.fieldEquals(
      "EventCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "eventClose",
      "234"
    )
    assert.fieldEquals(
      "EventCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "duration",
      "234"
    )
    assert.fieldEquals(
      "EventCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "yesToken",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "EventCreated",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "noToken",
      "0x0000000000000000000000000000000000000001"
    )

    // More assert options:
    // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#asserts
  })
})
