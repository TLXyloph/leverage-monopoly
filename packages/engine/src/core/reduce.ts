import { reduceBoard } from '../contexts/board/index.js'
import { reduceCredit } from '../contexts/credit/index.js'
import { reduceDraft } from '../contexts/draft/index.js'
import { initialState, reduceSession } from '../contexts/session/index.js'
import type { GameEvent } from './events.js'
import type { GameState } from './state.js'

export function reduce(state: GameState, event: GameEvent): GameState {
  return reduceDraft(reduceCredit(reduceBoard(reduceSession(state, event), event), event), event)
}

export function replay(events: readonly GameEvent[]): GameState {
  const [first, ...rest] = events
  if (first === undefined || first.type !== 'GameCreated') {
    throw new Error('The first event in a log must be GameCreated.')
  }
  return rest.reduce(reduce, initialState(first.config))
}
