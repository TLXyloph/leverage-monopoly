import { ECONOMY } from '../../config/economy.js'
import type { GameEvent } from '../../core/events.js'
import type { GameConfig, GameState } from '../../core/state.js'
import type { Phase } from '../../core/types.js'
import { reject, type Rejection } from '../../core/errors.js'
import { eraForRound } from './selectors.js'

export type SessionCommand = { readonly type: 'advance-phase' }

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
    return events
  }
  const next = NEXT_WITHIN_ROUND[state.phase]
  if (next === undefined) {
    return reject('WRONG_PHASE', `Nothing follows the ${state.phase} phase.`)
  }
  return [{ type: 'PhaseAdvanced', phase: next }]
}
