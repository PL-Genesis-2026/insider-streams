import {
  EventAdminClosed as EventAdminClosedEvent,
  EventCreated as EventCreatedEvent,
  LiquidityWithdrawn as LiquidityWithdrawnEvent,
  SettlementRequested as SettlementRequestedEvent,
  SettlementResponse as SettlementResponseEvent,
  SharesPurchased as SharesPurchasedEvent,
  SharesRedeemed as SharesRedeemedEvent,
} from "../generated/ExamplePredictionMarket/ExamplePredictionMarket"
import {
  EventAdminClosed,
  EventCreated,
  LiquidityWithdrawn,
  SettlementRequested,
  SettlementResponse,
  SharesPurchased,
  SharesRedeemed,
} from "../generated/schema"

export function handleEventAdminClosed(event: EventAdminClosedEvent): void {
  let entity = new EventAdminClosed(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.eventId = event.params.eventId

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleEventCreated(event: EventCreatedEvent): void {
  let entity = new EventCreated(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
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

export function handleLiquidityWithdrawn(event: LiquidityWithdrawnEvent): void {
  let entity = new LiquidityWithdrawn(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.eventId = event.params.eventId
  entity.creator = event.params.creator
  entity.usdcOut = event.params.usdcOut

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleSettlementRequested(
  event: SettlementRequestedEvent,
): void {
  let entity = new SettlementRequested(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
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
    event.transaction.hash.concatI32(event.logIndex.toI32()),
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
    event.transaction.hash.concatI32(event.logIndex.toI32()),
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
    event.transaction.hash.concatI32(event.logIndex.toI32()),
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
