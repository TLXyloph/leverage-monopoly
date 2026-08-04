import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { Money, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'
import { ECONOMY } from '../../config/economy.js'
import { instrumentsHeld, portfolioValue } from './marks.js'

export interface NetWorthBreakdown {
  readonly cleanCash: Money
  readonly deedValue: Money
  readonly buildingCost: Money
  readonly instruments: Money
  readonly drawnCredit: Money
  readonly peerLoansOwed: Money
  readonly distressedDebt: Money
  /** Always 0. Carried so the player-facing panel can show the line and the zero. */
  readonly dirtyCash: Money
  readonly total: Money
}

/**
 * Spec section 12. There is no term for CDS written and triggered: `SwapTriggered`
 * moves the notional in cash when it fires, so the writer's loss is already in their
 * clean cash — or, if they could not cover it, in their drawn credit via the
 * obligation waterfall (`ObligationCapitalised`). A separate deduction here would
 * count the same loss twice. `settlement.test.ts` pins this to exactly once.
 */
export function netWorthBreakdown(state: GameState, player: PlayerId): NetWorthBreakdown {
  const p = state.players[player]
  const { deeds, buildings } = portfolioValue(state, player)
  const instruments = instrumentsHeld(state, player)
  const peerLoansOwed = state.loans
    .filter((l) => l.borrower === player && l.status === 'active')
    .reduce((t, l) => t + l.outstanding, 0)
  const dirtyCash = p.dirtyCash * ECONOMY.DIRTY_CASH_SCORING_VALUE

  return {
    cleanCash: p.cleanCash,
    deedValue: deeds,
    buildingCost: buildings,
    instruments,
    drawnCredit: p.drawnCredit,
    peerLoansOwed,
    distressedDebt: p.distressedDebt,
    dirtyCash,
    total:
      p.cleanCash + deeds + buildings + instruments + dirtyCash
      - p.drawnCredit - peerLoansOwed - p.distressedDebt,
  }
}

export function netWorth(state: GameState, player: PlayerId): Money {
  return netWorthBreakdown(state, player).total
}

export function netWorths(state: GameState): Readonly<Record<PlayerId, Money>> {
  return Object.fromEntries(
    PLAYER_IDS.map((p) => [p, netWorth(state, p)]),
  ) as Record<PlayerId, Money>
}

export interface Standing {
  readonly player: PlayerId
  readonly netWorth: Money
  readonly rank: number
}

/**
 * Descending net worth, ties broken by turn order for a stable display order but
 * sharing a rank, because spec section 12 names no tie-break for the win itself.
 */
export function standings(state: GameState): readonly Standing[] {
  const order = new Map(state.config.turnOrder.map((p, i) => [p, i]))
  const scored = state.config.turnOrder
    .map((player) => ({ player, netWorth: netWorth(state, player) }))
    .sort((a, b) =>
      b.netWorth - a.netWorth || (order.get(a.player) ?? 0) - (order.get(b.player) ?? 0))

  let rank = 0
  let previous: Money | null = null
  return scored.map((row, index) => {
    if (previous === null || row.netWorth !== previous) rank = index + 1
    previous = row.netWorth
    return { ...row, rank }
  })
}

export function scoreGame(state: GameState): GameEvent {
  return { type: 'GameScored', netWorths: netWorths(state) }
}

export interface WinProgress {
  readonly kind: 'fixed-rounds' | 'net-worth-target'
  readonly netWorth: Money
  /** null under fixed-rounds, where there is nothing to progress toward. */
  readonly target: Money | null
  readonly remaining: Money | null
  readonly achieved: boolean
}

export function winProgress(state: GameState, player: PlayerId): WinProgress {
  const current = netWorth(state, player)
  const condition = state.config.winCondition
  if (condition.kind === 'fixed-rounds') {
    return {
      kind: 'fixed-rounds', netWorth: current, target: null, remaining: null, achieved: false,
    }
  }
  return {
    kind: 'net-worth-target',
    netWorth: current,
    target: condition.target,
    remaining: Math.max(0, condition.target - current),
    achieved: current >= condition.target,
  }
}

export function targetReachedBy(state: GameState): readonly PlayerId[] {
  return state.config.turnOrder.filter((p) => winProgress(state, p).achieved)
}

/**
 * Fixed-rounds games end when the scoring phase is reached, not when round 24 begins —
 * spec 19.1 adds three Settlement steps after round 24's step 11 (pool termination, CDS
 * triggering, scoring), and all three run while the phase is still `settlement`.
 */
export function isGameOver(state: GameState): boolean {
  if (state.phase === 'scoring' || state.phase === 'complete') return true
  return state.config.winCondition.kind === 'net-worth-target'
    && targetReachedBy(state).length > 0
}

export function winner(state: GameState): PlayerId | null {
  if (!isGameOver(state)) return null
  if (state.config.winCondition.kind === 'net-worth-target') {
    const reached = targetReachedBy(state)
    if (reached.length === 0) return null
    const best = reached.reduce<Money>((m, p) => Math.max(m, netWorth(state, p)), -Infinity)
    return reached.find((p) => netWorth(state, p) === best) ?? null
  }
  return standings(state)[0]?.player ?? null
}
