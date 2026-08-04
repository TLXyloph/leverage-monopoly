import { ECONOMY } from '../../config/economy.js'
import type { GameState } from '../../core/state.js'
import type { Era, Instrument, RoundNumber } from '../../core/types.js'

export type { Instrument }

/**
 * Spec section 2. Sourced from `ECONOMY.UNLOCK_ERA` — the single source of
 * truth for unlock eras — and re-exported here as session's public API.
 */
export const UNLOCK_ERA: Readonly<Record<Instrument, Era>> = ECONOMY.UNLOCK_ERA

export const INSTRUMENTS: readonly Instrument[] =
  Object.keys(UNLOCK_ERA) as readonly Instrument[]

export function eraForRound(round: RoundNumber): Era {
  const raw = Math.ceil(round / ECONOMY.ROUNDS_PER_ERA)
  return Math.min(4, Math.max(1, raw)) as Era
}

export function prevailingRate(state: GameState): number {
  return ECONOMY.INTEREST_RATE_BY_ERA[state.era]
}

export function isUnlocked(state: GameState, instrument: Instrument): boolean {
  if (state.config.unlockMode === 'all') return true
  return state.era >= UNLOCK_ERA[instrument]
}

export function unlockedInstruments(state: GameState): readonly Instrument[] {
  return INSTRUMENTS.filter((instrument) => isUnlocked(state, instrument))
}

/** Drives the rulebook's "what is new this era" view. */
export function newlyUnlockedIn(era: Era): readonly Instrument[] {
  return INSTRUMENTS.filter((instrument) => UNLOCK_ERA[instrument] === era)
}

export function isFinalRound(state: GameState): boolean {
  return state.round >= ECONOMY.TOTAL_ROUNDS
}

export function roundsRemaining(state: GameState): number {
  return Math.max(0, ECONOMY.TOTAL_ROUNDS - state.round)
}
