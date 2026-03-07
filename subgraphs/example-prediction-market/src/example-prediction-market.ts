import {
  EventCreated as EventCreatedEvent,
  ExpectedAuthorUpdated as ExpectedAuthorUpdatedEvent,
  ExpectedWorkflowIdUpdated as ExpectedWorkflowIdUpdatedEvent,
  ExpectedWorkflowNameUpdated as ExpectedWorkflowNameUpdatedEvent,
  ForwarderAddressUpdated as ForwarderAddressUpdatedEvent,
  LiquidityWithdrawn as LiquidityWithdrawnEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
  SecurityWarning as SecurityWarningEvent,
  SettlementRequested as SettlementRequestedEvent,
  SettlementResponse as SettlementResponseEvent,
  SharesPurchased as SharesPurchasedEvent,
  SharesRedeemed as SharesRedeemedEvent
} from "../generated/ExamplePredictionMarket/ExamplePredictionMarket"
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
} from "../generated/schema"

export function handleEventCreated(event: EventCreatedEvent): void {
  let entity = new EventCreated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.eventId = event.params.eventId
  entity.creator = event.params.creator
  entity.question = event.params.question
  entity.eventOpen = event.params.eventOpen
  entity.eventClose = event.params.eventClose
  entity.duration = event.params.duration
  entity.yesToken = event.params.yesToken
  entity.noToken = event.params.noToken

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

export function handleLiquidityWithdrawn(event: LiquidityWithdrawnEvent): void {
  let entity = new LiquidityWithdrawn(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.eventId = event.params.eventId
  entity.creator = event.params.creator
  entity.usdcOut = event.params.usdcOut

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

export function handleSettlementRequested(
  event: SettlementRequestedEvent
): void {
  let entity = new SettlementRequested(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.eventId = event.params.eventId
  entity.question = event.params.question

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleSettlementResponse(event: SettlementResponseEvent): void {
  let entity = new SettlementResponse(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.eventId = event.params.eventId
  entity.status = event.params.status
  entity.outcome = event.params.outcome

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleSharesPurchased(event: SharesPurchasedEvent): void {
  let entity = new SharesPurchased(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.eventId = event.params.eventId
  entity.buyer = event.params.buyer
  entity.outcome = event.params.outcome
  entity.usdcIn = event.params.usdcIn
  entity.sharesOut = event.params.sharesOut

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleSharesRedeemed(event: SharesRedeemedEvent): void {
  let entity = new SharesRedeemed(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.eventId = event.params.eventId
  entity.redeemer = event.params.redeemer
  entity.sharesIn = event.params.sharesIn
  entity.usdcOut = event.params.usdcOut

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
