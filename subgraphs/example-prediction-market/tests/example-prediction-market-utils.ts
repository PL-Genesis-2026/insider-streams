import { newMockEvent } from "matchstick-as"
import { ethereum, BigInt, Address, Bytes } from "@graphprotocol/graph-ts"
import {
  EventCreated,
  ExpectedAuthorUpdated,
  ExpectedWorkflowIdUpdated,
  ExpectedWorkflowNameUpdated,
  ForwarderAddressUpdated,
  LiquidityWithdrawn,
  OwnershipTransferred,
  SecurityWarning,
  SettlementRequested,
  SettlementResponse,
  SharesPurchased,
  SharesRedeemed
} from "../generated/ExamplePredictionMarket/ExamplePredictionMarket"

export function createEventCreatedEvent(
  eventId: BigInt,
  creator: Address,
  question: string,
  eventOpen: BigInt,
  eventClose: BigInt,
  duration: BigInt,
  yesToken: Address,
  noToken: Address
): EventCreated {
  let eventCreatedEvent = changetype<EventCreated>(newMockEvent())

  eventCreatedEvent.parameters = new Array()

  eventCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "eventId",
      ethereum.Value.fromUnsignedBigInt(eventId)
    )
  )
  eventCreatedEvent.parameters.push(
    new ethereum.EventParam("creator", ethereum.Value.fromAddress(creator))
  )
  eventCreatedEvent.parameters.push(
    new ethereum.EventParam("question", ethereum.Value.fromString(question))
  )
  eventCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "eventOpen",
      ethereum.Value.fromUnsignedBigInt(eventOpen)
    )
  )
  eventCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "eventClose",
      ethereum.Value.fromUnsignedBigInt(eventClose)
    )
  )
  eventCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "duration",
      ethereum.Value.fromUnsignedBigInt(duration)
    )
  )
  eventCreatedEvent.parameters.push(
    new ethereum.EventParam("yesToken", ethereum.Value.fromAddress(yesToken))
  )
  eventCreatedEvent.parameters.push(
    new ethereum.EventParam("noToken", ethereum.Value.fromAddress(noToken))
  )

  return eventCreatedEvent
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

export function createLiquidityWithdrawnEvent(
  eventId: BigInt,
  creator: Address,
  usdcOut: BigInt
): LiquidityWithdrawn {
  let liquidityWithdrawnEvent = changetype<LiquidityWithdrawn>(newMockEvent())

  liquidityWithdrawnEvent.parameters = new Array()

  liquidityWithdrawnEvent.parameters.push(
    new ethereum.EventParam(
      "eventId",
      ethereum.Value.fromUnsignedBigInt(eventId)
    )
  )
  liquidityWithdrawnEvent.parameters.push(
    new ethereum.EventParam("creator", ethereum.Value.fromAddress(creator))
  )
  liquidityWithdrawnEvent.parameters.push(
    new ethereum.EventParam(
      "usdcOut",
      ethereum.Value.fromUnsignedBigInt(usdcOut)
    )
  )

  return liquidityWithdrawnEvent
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

export function createSecurityWarningEvent(message: string): SecurityWarning {
  let securityWarningEvent = changetype<SecurityWarning>(newMockEvent())

  securityWarningEvent.parameters = new Array()

  securityWarningEvent.parameters.push(
    new ethereum.EventParam("message", ethereum.Value.fromString(message))
  )

  return securityWarningEvent
}

export function createSettlementRequestedEvent(
  eventId: BigInt,
  question: string
): SettlementRequested {
  let settlementRequestedEvent = changetype<SettlementRequested>(newMockEvent())

  settlementRequestedEvent.parameters = new Array()

  settlementRequestedEvent.parameters.push(
    new ethereum.EventParam(
      "eventId",
      ethereum.Value.fromUnsignedBigInt(eventId)
    )
  )
  settlementRequestedEvent.parameters.push(
    new ethereum.EventParam("question", ethereum.Value.fromString(question))
  )

  return settlementRequestedEvent
}

export function createSettlementResponseEvent(
  eventId: BigInt,
  status: i32,
  outcome: i32
): SettlementResponse {
  let settlementResponseEvent = changetype<SettlementResponse>(newMockEvent())

  settlementResponseEvent.parameters = new Array()

  settlementResponseEvent.parameters.push(
    new ethereum.EventParam(
      "eventId",
      ethereum.Value.fromUnsignedBigInt(eventId)
    )
  )
  settlementResponseEvent.parameters.push(
    new ethereum.EventParam(
      "status",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(status))
    )
  )
  settlementResponseEvent.parameters.push(
    new ethereum.EventParam(
      "outcome",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(outcome))
    )
  )

  return settlementResponseEvent
}

export function createSharesPurchasedEvent(
  eventId: BigInt,
  buyer: Address,
  outcome: i32,
  usdcIn: BigInt,
  sharesOut: BigInt
): SharesPurchased {
  let sharesPurchasedEvent = changetype<SharesPurchased>(newMockEvent())

  sharesPurchasedEvent.parameters = new Array()

  sharesPurchasedEvent.parameters.push(
    new ethereum.EventParam(
      "eventId",
      ethereum.Value.fromUnsignedBigInt(eventId)
    )
  )
  sharesPurchasedEvent.parameters.push(
    new ethereum.EventParam("buyer", ethereum.Value.fromAddress(buyer))
  )
  sharesPurchasedEvent.parameters.push(
    new ethereum.EventParam(
      "outcome",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(outcome))
    )
  )
  sharesPurchasedEvent.parameters.push(
    new ethereum.EventParam("usdcIn", ethereum.Value.fromUnsignedBigInt(usdcIn))
  )
  sharesPurchasedEvent.parameters.push(
    new ethereum.EventParam(
      "sharesOut",
      ethereum.Value.fromUnsignedBigInt(sharesOut)
    )
  )

  return sharesPurchasedEvent
}

export function createSharesRedeemedEvent(
  eventId: BigInt,
  redeemer: Address,
  sharesIn: BigInt,
  usdcOut: BigInt
): SharesRedeemed {
  let sharesRedeemedEvent = changetype<SharesRedeemed>(newMockEvent())

  sharesRedeemedEvent.parameters = new Array()

  sharesRedeemedEvent.parameters.push(
    new ethereum.EventParam(
      "eventId",
      ethereum.Value.fromUnsignedBigInt(eventId)
    )
  )
  sharesRedeemedEvent.parameters.push(
    new ethereum.EventParam("redeemer", ethereum.Value.fromAddress(redeemer))
  )
  sharesRedeemedEvent.parameters.push(
    new ethereum.EventParam(
      "sharesIn",
      ethereum.Value.fromUnsignedBigInt(sharesIn)
    )
  )
  sharesRedeemedEvent.parameters.push(
    new ethereum.EventParam(
      "usdcOut",
      ethereum.Value.fromUnsignedBigInt(usdcOut)
    )
  )

  return sharesRedeemedEvent
}
