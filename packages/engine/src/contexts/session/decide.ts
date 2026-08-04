import { ECONOMY } from '../../config/economy.js'
import type { GameEvent } from '../../core/events.js'
import type { GameConfig, GameState } from '../../core/state.js'
import type { Phase } from '../../core/types.js'
import { reject, type Rejection } from '../../core/errors.js'
import { advanceEraIIStimulus } from '../credit/index.js'
import { eraForRound } from './selectors.js'
import type { SettlementInput } from './settlement.js'
import { runFinalSettlement, runSettlement } from './settlement.js'

export type SessionCommand =
  | { readonly type: 'advance-phase' }
  | { readonly type: 'settle'; readonly input: SettlementInput }

/** Bootstraps a game. Emitted before any state exists, so it takes no state. */
export function createGame(config: GameConfig): readonly GameEvent[] {
  return [{ type: 'GameCreated', config }]
}

const NEXT_WITHIN_ROUND: Partial<Record<Phase, Phase>> = {
  setup: 'draft',
  draft: 'market',
  market: 'open',
  open: 'movement',
  movement: 'settlement',
  scoring: 'complete',
}

export function decideSession(
  state: GameState,
  command: SessionCommand,
): readonly GameEvent[] | Rejection {
  /**
   * Spec 19.1. Runs the eleven-step Settlement fold, and on round 24 the three extra
   * steps (pool termination, CDS triggering, scoring). Separate from `advance-phase`,
   * which moves the clock, so a facilitator can re-read a Settlement's events before
   * committing to the next round.
   */
  if (command.type === 'settle') {
    if (state.phase !== 'settlement') {
      return reject('WRONG_PHASE', 'Settlement runs at the end of the round.')
    }
    return state.round >= ECONOMY.TOTAL_ROUNDS
      ? runFinalSettlement(state, command.input)
      : runSettlement(state, command.input)
  }
  if (command.type !== 'advance-phase') {
    return reject('WRONG_PHASE', 'Unknown session command.')
  }
  if (state.phase === 'complete') {
    return reject('WRONG_PHASE', 'The game is over. There is nothing to advance to.')
  }
  if (state.phase === 'draft' && state.draft?.complete !== true) {
    return reject('WRONG_PHASE', 'All seven draft rounds must resolve before play begins.')
  }
  if (state.phase === 'settlement') {
    if (state.round >= ECONOMY.TOTAL_ROUNDS) {
      return [{ type: 'PhaseAdvanced', phase: 'scoring' }]
    }
    const round = state.round + 1
    const era = eraForRound(round)
    const events: GameEvent[] = [{ type: 'RoundAdvanced', round }]
    if (era !== state.era) events.push({ type: 'EraAdvanced', era })
    events.push({ type: 'PhaseAdvanced', phase: 'market' })
    // Spec section 4: the Era II stimulus advances "at the start of round 7," the
    // instant the Market phase of round 7 opens. `credit/settlement.ts`'s own
    // docstring says this is "Called by `session` on entering the Market phase," but
    // Task 20 found no call site anywhere in the engine — the function existed,
    // was unit-tested in isolation, and was never wired in, so no game ever actually
    // advanced it. Checked against the state this batch is ABOUT to produce (`round`
    // and phase `'market'`), not the state before it, since `advanceEraIIStimulus`'s
    // own guard reads both.
    events.push(...advanceEraIIStimulus({ ...state, round, phase: 'market' }))
    return events
  }
  const next = NEXT_WITHIN_ROUND[state.phase]
  if (next === undefined) {
    return reject('WRONG_PHASE', `Nothing follows the ${state.phase} phase.`)
  }
  return [{ type: 'PhaseAdvanced', phase: next }]
}
