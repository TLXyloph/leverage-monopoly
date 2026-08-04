import { isRejection, reject, type Rejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import type { DeedState, GameState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { creditHeadroom } from '../credit/index.js'
import { ownsWholeGroup } from './rent.js'
import {
  HOTEL_LEVEL, HOUSES_PER_HOTEL, buildingCost, canBuildOn, canSellFrom, groupIsDeveloped,
  isBuildable, mortgageProceeds, sellbackValue, unmortgageCost,
} from './property.js'

/**
 * Functions owned by the `markets` context that this task needs. They are injected
 * rather than imported because `markets` imports `contexts/board/index.js` (Task 14),
 * so a direct import here would close a cycle. The root decider, which may import
 * both, supplies the real implementations. Task 9 uses the same device for CreditPorts.
 */
export interface PropertyPorts {
  /**
   * Spec section 6. Called against the state BEFORE DeedMortgaged is applied,
   * because a mortgaged deed collects no rent and values every contract at zero.
   */
  readonly makeWholeOnMortgage: (state: GameState, deed: DeedId) => readonly GameEvent[]
  /** Spec section 9. A DEED_ENCUMBERED rejection while an option is outstanding. */
  readonly assertDeedTransferable: (state: GameState, deed: DeedId) => Rejection | null
}

/** Safe default for states carrying no futures and no options. */
export const NO_PROPERTY_ENCUMBRANCES: PropertyPorts = {
  makeWholeOnMortgage: () => [],
  assertDeedTransferable: () => null,
}

export type PropertyCommand =
  | { readonly type: 'BuildHouse'; readonly player: PlayerId; readonly deed: DeedId }
  | { readonly type: 'SellHouse'; readonly player: PlayerId; readonly deed: DeedId }
  | { readonly type: 'MortgageDeed'; readonly player: PlayerId; readonly deed: DeedId }
  | { readonly type: 'UnmortgageDeed'; readonly player: PlayerId; readonly deed: DeedId }
  | {
      readonly type: 'TradeAssets'
      readonly from: PlayerId
      readonly to: PlayerId
      readonly deedsFrom: readonly DeedId[]
      readonly deedsTo: readonly DeedId[]
      readonly cashFrom: Money
      readonly cashTo: Money
      /**
       * Both parties. Negotiation happens at the table and the facilitator submits
       * the command only once both have said yes, so the engine holds no pending-trade
       * state and no trade can be left half-open across a phase boundary.
       */
      readonly confirmedBy: readonly PlayerId[]
    }

function ownedDeed(
  state: GameState,
  player: PlayerId,
  id: DeedId,
): DeedState | Rejection {
  const deed = state.deeds[id]
  if (deed === undefined) {
    return reject('DEED_UNAVAILABLE', `There is no deed called ${id}.`)
  }
  if (deed.owner !== player) {
    return reject('NOT_OWNER', `${player} does not own ${id}.`)
  }
  return deed
}

/**
 * Spec 19.8. Building and unmortgaging are VOLUNTARY, so the shortfall draws on the
 * credit line at the ordinary cap or the command is refused. It never capitalises:
 * the uncapped path belongs to automatic obligations alone, and the gap between the
 * two is the only mechanism in the game that produces a margin call.
 *
 * The base is read BEFORE the purchase, so a player cannot borrow against the very
 * house or the very unmortgaged deed the draw is paying for.
 */
function fundVoluntary(
  state: GameState,
  player: PlayerId,
  amount: Money,
): readonly GameEvent[] | Rejection {
  const cash = state.players[player].cleanCash
  if (cash >= amount) return []
  const needed = amount - cash
  const headroom = Math.max(0, creditHeadroom(state, player))
  if (headroom < needed) {
    return reject(
      'INSUFFICIENT_BORROWING_BASE',
      `That costs $${amount}. You hold $${cash} in clean cash and can draw $${headroom} `
      + `more against your borrowing base, which leaves you $${needed - headroom} short.`,
    )
  }
  return [{ type: 'CreditDrawn', player, amount: needed }]
}

function decideBuild(
  state: GameState,
  command: Extract<PropertyCommand, { type: 'BuildHouse' }>,
): readonly GameEvent[] | Rejection {
  const deed = ownedDeed(state, command.player, command.deed)
  if (isRejection(deed)) return deed
  if (!isBuildable(deed)) {
    return reject('NOT_BUILDABLE', 'Railroads and utilities cannot be developed.')
  }
  if (deed.mortgaged) {
    return reject(
      'DEED_MORTGAGED',
      `${command.deed} is mortgaged. Lift the mortgage before building on it.`,
    )
  }
  if (!ownsWholeGroup(state, deed.group, command.player)) {
    return reject(
      'INCOMPLETE_COLOUR_GROUP',
      `Building on ${command.deed} needs every ${deed.group} deed, owned by you and `
      + 'unmortgaged.',
    )
  }
  if (deed.houses >= HOTEL_LEVEL) {
    return reject('UNEVEN_BUILD', `${command.deed} already has a hotel, the maximum.`)
  }
  if (!canBuildOn(state, deed)) {
    return reject(
      'UNEVEN_BUILD',
      `Build evenly: another ${deed.group} deed has fewer buildings than ${command.deed}.`,
    )
  }
  const placingHotel = deed.houses + 1 === HOTEL_LEVEL
  if (placingHotel && state.hotelsRemaining < 1) {
    return reject('NO_HOTELS_REMAINING', 'The bank has no hotels left.')
  }
  if (!placingHotel && state.housesRemaining < 1) {
    return reject(
      'NO_HOUSES_REMAINING',
      'The bank has no houses left. Another player is holding the supply.',
    )
  }
  const cost = buildingCost(deed)
  const funding = fundVoluntary(state, command.player, cost)
  if (isRejection(funding)) return funding
  return [
    ...funding,
    { type: 'HouseBuilt', player: command.player, deed: command.deed, cost },
  ]
}

function decideSell(
  state: GameState,
  command: Extract<PropertyCommand, { type: 'SellHouse' }>,
): readonly GameEvent[] | Rejection {
  const deed = ownedDeed(state, command.player, command.deed)
  if (isRejection(deed)) return deed
  if (deed.houses < 1) {
    return reject(
      'DEED_UNAVAILABLE',
      `There are no buildings on ${command.deed} to sell.`,
    )
  }
  if (!canSellFrom(state, deed)) {
    return reject(
      'UNEVEN_BUILD',
      `Sell evenly: another ${deed.group} deed has more buildings than ${command.deed}.`,
    )
  }
  if (deed.houses === HOTEL_LEVEL && state.housesRemaining < HOUSES_PER_HOTEL) {
    return reject(
      'NO_HOUSES_REMAINING',
      `Breaking this hotel needs ${HOUSES_PER_HOTEL} houses back from the bank and `
      + `only ${state.housesRemaining} remain. Wait for a house to come free.`,
    )
  }
  return [{
    type: 'HouseSold',
    player: command.player,
    deed: command.deed,
    proceeds: sellbackValue(deed),
  }]
}

function decideMortgage(
  state: GameState,
  command: Extract<PropertyCommand, { type: 'MortgageDeed' }>,
  ports: PropertyPorts,
): readonly GameEvent[] | Rejection {
  const deed = ownedDeed(state, command.player, command.deed)
  if (isRejection(deed)) return deed
  if (deed.mortgaged) {
    return reject('DEED_MORTGAGED', `${command.deed} is already mortgaged.`)
  }
  /**
   * Spec 19.6. The test is on the whole colour group, not just this deed: buildings
   * may only ever stand on a group that is wholly owned and wholly unmortgaged, and
   * because sell-back is even across the group, clearing one deed to zero means
   * bringing the whole group down with it.
   */
  if (groupIsDeveloped(state, deed.group)) {
    return reject(
      'DEED_DEVELOPED',
      `The ${deed.group} group still has buildings on it. Sell them back to the bank `
      + `before mortgaging ${command.deed} - sell-back is even across the group, so `
      + 'that means stripping the whole group.',
    )
  }
  const locked = ports.assertDeedTransferable(state, command.deed)
  if (locked !== null) return locked
  // Valued against the pre-mortgage state, sequenced after the proceeds arrive.
  return [
    {
      type: 'DeedMortgaged',
      player: command.player,
      deed: command.deed,
      proceeds: mortgageProceeds(deed),
    },
    ...ports.makeWholeOnMortgage(state, command.deed),
  ]
}

function decideUnmortgage(
  state: GameState,
  command: Extract<PropertyCommand, { type: 'UnmortgageDeed' }>,
): readonly GameEvent[] | Rejection {
  const deed = ownedDeed(state, command.player, command.deed)
  if (isRejection(deed)) return deed
  if (!deed.mortgaged) {
    return reject('DEED_UNAVAILABLE', `${command.deed} is not mortgaged.`)
  }
  const cost = unmortgageCost(deed)
  const funding = fundVoluntary(state, command.player, cost)
  if (isRejection(funding)) return funding
  return [
    ...funding,
    { type: 'DeedUnmortgaged', player: command.player, deed: command.deed, cost },
  ]
}

type TradeCommand = Extract<PropertyCommand, { type: 'TradeAssets' }>

/** One direction of a trade: giver, taker, and the deeds moving that way. */
type TradeLeg = readonly [PlayerId, PlayerId, readonly DeedId[], Money]

function decideTrade(
  state: GameState,
  command: TradeCommand,
  ports: PropertyPorts,
): readonly GameEvent[] | Rejection {
  if (command.from === command.to) {
    return reject('SELF_DEALING', 'You cannot trade with yourself.')
  }
  for (const amount of [command.cashFrom, command.cashTo]) {
    if (!Number.isInteger(amount) || amount < 0) {
      return reject('NEGATIVE_AMOUNT', 'Cash in a trade must be whole dollars, zero or more.')
    }
  }
  for (const side of [command.from, command.to]) {
    if (!command.confirmedBy.includes(side)) {
      return reject('TRADE_NOT_CONFIRMED', `${side} has not confirmed this trade.`)
    }
  }

  const legs: readonly TradeLeg[] = [
    [command.from, command.to, command.deedsFrom, command.cashFrom],
    [command.to, command.from, command.deedsTo, command.cashTo],
  ]

  const seen = new Set<DeedId>()
  for (const [giver, , deeds, cash] of legs) {
    for (const id of deeds) {
      if (seen.has(id)) {
        return reject('DEED_UNAVAILABLE', `${id} appears on both sides of this trade.`)
      }
      seen.add(id)
      const deed = ownedDeed(state, giver, id)
      if (isRejection(deed)) return deed
      if (deed.houses > 0) {
        return reject(
          'DEED_DEVELOPED',
          `Sell the buildings on ${id} back to the bank before trading it. They belong `
          + `to the ${deed.group} group, which the new owner may not complete.`,
        )
      }
      const locked = ports.assertDeedTransferable(state, id)
      if (locked !== null) return locked
    }
    if (state.players[giver].cleanCash < cash) {
      return reject(
        'INSUFFICIENT_CLEAN_CASH',
        `${giver} offered $${cash} but holds $${state.players[giver].cleanCash} in clean `
        + 'cash. Draw on the credit line first, then trade.',
      )
    }
  }

  const events: GameEvent[] = []
  for (const [giver, taker, deeds, cash] of legs) {
    if (deeds.length === 0 && cash === 0) continue
    events.push({ type: 'DeedTraded', from: giver, to: taker, deeds, cash })
  }
  if (events.length === 0) {
    return reject('DEED_UNAVAILABLE', 'A trade must move at least one deed or some cash.')
  }
  return events
}

export function decideProperty(
  state: GameState,
  command: PropertyCommand,
  ports: PropertyPorts = NO_PROPERTY_ENCUMBRANCES,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject(
      'WRONG_PHASE',
      'Property actions are only available during the Open phase.',
    )
  }
  switch (command.type) {
    case 'BuildHouse':
      return decideBuild(state, command)
    case 'SellHouse':
      return decideSell(state, command)
    case 'MortgageDeed':
      return decideMortgage(state, command, ports)
    case 'UnmortgageDeed':
      return decideUnmortgage(state, command)
    case 'TradeAssets':
      return decideTrade(state, command, ports)
  }
}
