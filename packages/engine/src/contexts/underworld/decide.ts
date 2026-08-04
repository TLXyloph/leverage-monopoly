import { ECONOMY } from '../../config/economy.js'
import { reject } from '../../core/errors.js'
import type { Rejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import type { ActiveVenture, GameState } from '../../core/state.js'
import type { DiceRoll, Money, PlayerId } from '../../core/types.js'
import { isUnlocked } from '../session/index.js'
import { isLegal2d6, runsVenture, speakeasyPayout } from './selectors.js'

export type UnderworldCommand =
  | { readonly type: 'LaunchVenture'; readonly player: PlayerId
      readonly venture: ActiveVenture['kind']; readonly fundedFrom: 'clean' | 'dirty' }
  | { readonly type: 'PlaySpeakeasy'; readonly player: PlayerId
      readonly dice: DiceRoll; readonly fundedFrom: 'clean' | 'dirty' }

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

export function decideUnderworld(
  state: GameState, command: UnderworldCommand,
): readonly GameEvent[] | Rejection {
  switch (command.type) {
    case 'LaunchVenture': return decideLaunchVenture(state, command)
    case 'PlaySpeakeasy': return decidePlaySpeakeasy(state, command)
  }
}
