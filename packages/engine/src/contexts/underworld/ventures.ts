import type { GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { ECONOMY } from '../../config/economy.js'
import { applyBps, runsVenture, toBps } from './selectors.js'

type RentCharged = Extract<GameEvent, { type: 'RentCharged' }>

/**
 * Spec 19.5. Escort Service and Chop Shop pay the DEED'S OWNER, computed on rent
 * CHARGED on deeds they own, regardless of who receives it. `rent.to` — which is
 * the futures holder whenever a rent-future contract is live — is deliberately
 * never read here; only `state.deeds[rent.deed].owner` decides who is paid.
 * Selling a rent future therefore does not extinguish venture income, and a
 * futures holder earns nothing from a deed they do not own.
 *
 * Spec 19.9: a mortgaged deed charges no rent, so it pays no venture bonus
 * either. In real play `board` never emits a `RentCharged` for a mortgaged
 * deed (`rentDue` returns 0), so this is a defence-in-depth guard rather than
 * a path exercised in normal flow — but 19.5's "regardless of who receives
 * it" governs only the RECIPIENT, not whether rent was charged at all, so the
 * guard stays explicit rather than relying on the caller never doing this.
 *
 * Called by `board` for every `RentCharged` event it emits (wired at the Task
 * 19 orchestration layer, per the plan's context-dependency rule: `board` may
 * import `underworld`, but `underworld` must never import `board`).
 */
export function ventureIncomeFromRent(
  state: GameState, rent: RentCharged,
): readonly GameEvent[] {
  const deed = state.deeds[rent.deed]
  if (deed === undefined) return []
  const owner = deed.owner
  if (owner === null || owner === 'bank') return []
  if (deed.mortgaged) return []

  const events: GameEvent[] = []

  if (runsVenture(state, owner, 'escort')) {
    const amount = applyBps(rent.amount, toBps(ECONOMY.VENTURES.escort.rentShare))
    if (amount > 0) {
      events.push({ type: 'DirtyCashEarned', player: owner, amount, source: 'escort' })
    }
  }

  if (runsVenture(state, owner, 'chop-shop')) {
    events.push({
      type: 'DirtyCashEarned', player: owner,
      amount: ECONOMY.VENTURES['chop-shop'].perLanding, source: 'chop-shop',
    })
  }

  return events
}

/**
 * Settlement step 2, spec 19.1: venture payouts accrue as dirty cash and venture
 * timers decrement in the same step. Only the Numbers Racket has a flat
 * per-round payout here — Escort Service and Chop Shop are event-driven and
 * already paid out at the moment rent was charged during Movement, which
 * precedes Settlement in the same round.
 *
 * Emission order is turn order then venture order (append-only on
 * `PlayerState.ventures`), so replay is exact.
 */
export function settleVentures(state: GameState): readonly GameEvent[] {
  const events: GameEvent[] = []
  for (const id of state.config.turnOrder) {
    for (const venture of state.players[id].ventures) {
      if (venture.kind === 'numbers') {
        events.push({
          type: 'DirtyCashEarned', player: id,
          amount: ECONOMY.VENTURES.numbers.perRound, source: 'numbers',
        })
      }
      events.push({
        type: 'VentureTicked', player: id, venture: venture.kind,
        roundsRemaining: venture.roundsRemaining - 1,
      })
    }
  }
  return events
}
