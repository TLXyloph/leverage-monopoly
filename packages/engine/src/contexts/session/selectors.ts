import { ECONOMY } from '../../config/economy.js'
import type { GameState } from '../../core/state.js'
import type { Era, RoundNumber } from '../../core/types.js'

/** Every player-facing capability that era gating can withhold. */
export type Instrument =
  | 'trade' | 'building' | 'mortgage' | 'credit-line'
  | 'peer-loan' | 'rent-future' | 'venture' | 'laundering' | 'bribery'
  | 'cdo' | 'cds' | 'deed-option' | 'insider-trading'

/**
 * Spec section 2. Era IV deliberately unlocks nothing: the last six rounds are
 * about surviving existing leverage, not learning a new instrument.
 */
export const UNLOCK_ERA: Readonly<Record<Instrument, Era>> = {
  trade: 1,
  building: 1,
  mortgage: 1,
  'credit-line': 1,
  'peer-loan': 2,
  'rent-future': 2,
  venture: 2,
  laundering: 2,
  bribery: 2,
  cdo: 3,
  cds: 3,
  'deed-option': 3,
  'insider-trading': 3,
}

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
