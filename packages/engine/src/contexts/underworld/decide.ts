import { ECONOMY } from '../../config/economy.js'
import { reject } from '../../core/errors.js'
import type { Rejection } from '../../core/errors.js'
import type { BriberyEffect, GameEvent } from '../../core/events.js'
import { isWholeDollars } from '../../core/money.js'
import type { ActiveVenture, GameState } from '../../core/state.js'
import type { DiceRoll, Money, PlayerId } from '../../core/types.js'
import { isUnlocked } from '../session/index.js'
import { settleAudits } from './audit.js'
import {
  isLegal2d6, launderHaircutBps, launderProceeds, runsVenture, speakeasyPayout,
} from './selectors.js'

export type UnderworldCommand =
  | { readonly type: 'LaunchVenture'; readonly player: PlayerId
      readonly venture: ActiveVenture['kind']; readonly fundedFrom: 'clean' | 'dirty' }
  | { readonly type: 'PlaySpeakeasy'; readonly player: PlayerId
      readonly dice: DiceRoll; readonly fundedFrom: 'clean' | 'dirty' }
  | { readonly type: 'LaunderCash'; readonly player: PlayerId; readonly amount: Money }
  | { readonly type: 'Bribe'; readonly player: PlayerId; readonly effect: BriberyEffect }
  | { readonly type: 'InsiderTrade'; readonly player: PlayerId
      readonly fundedFrom: 'clean' | 'dirty' }
  | { readonly type: 'RunAuditChecks'
      readonly dice: Readonly<Partial<Record<PlayerId, DiceRoll>>> }

/** Shared funding guard. Returns a Rejection or null. Names the pocket that
 * came up short, per spec section 10: clean and dirty cash reject differently. */
function checkFunds(
  state: GameState, player: PlayerId, cost: Money, from: 'clean' | 'dirty', what: string,
): Rejection | null {
  const p = state.players[player]
  if (from === 'clean' && p.cleanCash < cost) {
    return reject('INSUFFICIENT_CLEAN_CASH',
      `${what} costs $${cost} and you hold $${p.cleanCash} in clean cash.`)
  }
  if (from === 'dirty' && p.dirtyCash < cost) {
    return reject('INSUFFICIENT_DIRTY_CASH',
      `${what} costs $${cost} and you hold $${p.dirtyCash} in dirty cash.`)
  }
  return null
}

/**
 * Spec section 10 / 19.2. Only one instance of a given venture may be active
 * per player at a time (`VENTURE_ALREADY_ACTIVE`) — nothing stops two
 * DIFFERENT ventures running simultaneously, or a fresh launch the instant an
 * old one of the same kind retires.
 */
function decideLaunchVenture(
  state: GameState,
  cmd: Extract<UnderworldCommand, { type: 'LaunchVenture' }>,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Ventures are launched during the Open phase.')
  }
  if (!isUnlocked(state, 'venture')) {
    return reject('INSTRUMENT_LOCKED_THIS_ERA',
      `Ventures unlock in Era ${ECONOMY.UNLOCK_ERA.venture}.`)
  }
  if (runsVenture(state, cmd.player, cmd.venture)) {
    return reject('VENTURE_ALREADY_ACTIVE',
      `Your ${cmd.venture} is already running. Wait for it to finish.`)
  }
  const spec = ECONOMY.VENTURES[cmd.venture]
  const funds = checkFunds(state, cmd.player, spec.cost, cmd.fundedFrom, `The ${cmd.venture}`)
  if (funds !== null) return funds

  return [
    { type: 'VentureLaunched', player: cmd.player, venture: cmd.venture,
      cost: spec.cost, rounds: spec.rounds, fundedFrom: cmd.fundedFrom },
    { type: 'HeatChanged', player: cmd.player, delta: spec.heat,
      reason: `launched ${cmd.venture}` },
  ]
}

/**
 * Spec section 10. The roll arrives as command payload from the physical dice
 * — the engine never generates it. `payout` is computed once, here, from the
 * same table `speakeasyPayout` reads, so the emitted event and the reducer
 * agree by construction rather than by two callers separately consulting
 * ECONOMY.
 */
function decidePlaySpeakeasy(
  state: GameState,
  cmd: Extract<UnderworldCommand, { type: 'PlaySpeakeasy' }>,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'The Speakeasy is played during the Open phase.')
  }
  if (!isUnlocked(state, 'venture')) {
    return reject('INSTRUMENT_LOCKED_THIS_ERA',
      `The Speakeasy unlocks in Era ${ECONOMY.UNLOCK_ERA.venture}.`)
  }
  if (!isLegal2d6(cmd.dice)) {
    return reject('INVALID_DICE',
      `${cmd.dice[0]} and ${cmd.dice[1]} is not a legal 2d6 result.`)
  }
  const funds = checkFunds(
    state, cmd.player, ECONOMY.SPEAKEASY_COST, cmd.fundedFrom, 'The Speakeasy')
  if (funds !== null) return funds

  const payout = speakeasyPayout(cmd.dice)
  const events: GameEvent[] = [
    { type: 'SpeakeasyPlayed', player: cmd.player, dice: cmd.dice, payout,
      fundedFrom: cmd.fundedFrom },
  ]
  if (payout > 0) {
    events.push({
      type: 'DirtyCashEarned', player: cmd.player, amount: payout, source: 'speakeasy',
    })
  }
  events.push({
    type: 'HeatChanged', player: cmd.player, delta: ECONOMY.SPEAKEASY_HEAT,
    reason: 'played the Speakeasy',
  })
  return events
}

/**
 * Spec section 10 / 19.9. Once per Open phase. The haircut is read from the
 * player's Heat BEFORE this transaction's own +1 — see `launderHaircutBps`.
 * Proceeds are funded by the Treasury (clean money entering the game); the
 * dirty cash consumed is destroyed, not banked.
 */
function decideLaunder(
  state: GameState,
  cmd: Extract<UnderworldCommand, { type: 'LaunderCash' }>,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Laundering happens during the Open phase.')
  }
  if (!isUnlocked(state, 'laundering')) {
    return reject('INSTRUMENT_LOCKED_THIS_ERA',
      `Laundering unlocks in Era ${ECONOMY.UNLOCK_ERA.laundering}.`)
  }
  const p = state.players[cmd.player]
  if (p.launderedThisPhase) {
    return reject('ALREADY_LAUNDERED_THIS_PHASE',
      'You may launder at most once per Open phase.')
  }
  if (cmd.amount <= 0 || !isWholeDollars(cmd.amount)) {
    return reject('INVALID_AMOUNT', 'Launder at least $1, in whole dollars.')
  }
  if (p.dirtyCash < cmd.amount) {
    return reject('INSUFFICIENT_DIRTY_CASH', `You hold $${p.dirtyCash} in dirty cash.`)
  }

  // Spec 19.9: the haircut reads Heat BEFORE this transaction's +1.
  const haircutBps = launderHaircutBps(p.heat)
  const cleanOut = launderProceeds(cmd.amount, p.heat)

  return [
    { type: 'CashLaundered', player: cmd.player, dirtyIn: cmd.amount, cleanOut,
      haircut: haircutBps / 10_000 },
    { type: 'HeatChanged', player: cmd.player, delta: ECONOMY.LAUNDER_HEAT,
      reason: 'laundering' },
  ]
}

/**
 * Spec section 10. $200, payable in DIRTY cash only, once per round. Barred
 * from Settlement entirely — none of the three effects needs a Settlement
 * window and this satisfies "cannot be used during Settlement after an audit
 * has already resolved" without a per-Settlement audit-resolved flag.
 */
function decideBribe(
  state: GameState,
  cmd: Extract<UnderworldCommand, { type: 'Bribe' }>,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open' && state.phase !== 'movement') {
    return reject('WRONG_PHASE',
      'Bribery is available during the Open and Movement phases only.')
  }
  if (!isUnlocked(state, 'bribery')) {
    return reject('INSTRUMENT_LOCKED_THIS_ERA',
      `Bribery unlocks in Era ${ECONOMY.UNLOCK_ERA.bribery}.`)
  }
  const p = state.players[cmd.player]
  if (p.briberyUsedThisRound) {
    return reject('BRIBERY_ALREADY_USED', 'You have already paid a bribe this round.')
  }
  if (p.dirtyCash < ECONOMY.BRIBERY_COST) {
    return reject('INSUFFICIENT_DIRTY_CASH',
      `Bribery costs $${ECONOMY.BRIBERY_COST} in dirty cash and you hold $${p.dirtyCash}.`)
  }
  if (cmd.effect.kind === 'delay-margin-call' && p.marginCallFlaggedAt === null) {
    return reject('INVALID_BRIBERY_TARGET', 'You have no margin call to delay.')
  }

  return [
    { type: 'BriberyUsed', player: cmd.player, cost: ECONOMY.BRIBERY_COST, effect: cmd.effect },
    { type: 'HeatChanged', player: cmd.player, delta: ECONOMY.BRIBERY_HEAT, reason: 'bribery' },
  ]
}

/** Spec section 10. $100, clean or dirty cash, unlimited per round — after the
 * first purchase the reveal is already known, which is self-limiting. */
function decideInsiderTrade(
  state: GameState,
  cmd: Extract<UnderworldCommand, { type: 'InsiderTrade' }>,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Insider trading happens during the Open phase.')
  }
  if (!isUnlocked(state, 'insider-trading')) {
    return reject('INSTRUMENT_LOCKED_THIS_ERA',
      `Insider trading unlocks in Era ${ECONOMY.UNLOCK_ERA['insider-trading']}.`)
  }
  const funds = checkFunds(
    state, cmd.player, ECONOMY.INSIDER_TRADING_COST, cmd.fundedFrom, 'Insider trading')
  if (funds !== null) return funds

  return [
    { type: 'InsiderTradingUsed', player: cmd.player,
      cost: ECONOMY.INSIDER_TRADING_COST, fundedFrom: cmd.fundedFrom },
    { type: 'HeatChanged', player: cmd.player, delta: ECONOMY.INSIDER_TRADING_HEAT,
      reason: 'insider trading' },
  ]
}

export function decideUnderworld(
  state: GameState, command: UnderworldCommand,
): readonly GameEvent[] | Rejection {
  switch (command.type) {
    case 'LaunchVenture': return decideLaunchVenture(state, command)
    case 'PlaySpeakeasy': return decidePlaySpeakeasy(state, command)
    case 'LaunderCash': return decideLaunder(state, command)
    case 'Bribe': return decideBribe(state, command)
    case 'InsiderTrade': return decideInsiderTrade(state, command)
    case 'RunAuditChecks':
      return state.phase !== 'settlement'
        ? reject('WRONG_PHASE', 'Audit checks run during Settlement.')
        : settleAudits(state, command.dice)
  }
}
