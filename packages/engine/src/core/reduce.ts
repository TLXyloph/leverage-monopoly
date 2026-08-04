import { reduceBoard, reduceProperty } from '../contexts/board/index.js'
import { reduceCredit, reducePeerLoans } from '../contexts/credit/index.js'
import { reduceDecks } from '../contexts/decks/index.js'
import { reduceDraft } from '../contexts/draft/index.js'
import { reduceMarkets } from '../contexts/markets/index.js'
import { initialState, reduceSession } from '../contexts/session/index.js'
import type { GameEvent } from './events.js'
import type { GameState } from './state.js'

/**
 * `decks` is deliberately last: it both handles its own three events (DeckShuffled,
 * CardDrawn, DeckReordered) and observes every other event to maintain the rent,
 * dirty-action and laundering counters dynamic card targets rank on, so it must see
 * state and events strictly after every owning context has applied them.
 *
 * NOTE: this dispatch chain does not yet route to `reduceUnderworld` or
 * `reduceSecuritization` — that gap predates Task 18 (see underworld/securitization's
 * own test suites, which apply their reducers directly rather than through this
 * function) and is out of this task's scope; flagged in the Task 18 report.
 */
export function reduce(state: GameState, event: GameEvent): GameState {
  const owned = reduceProperty(
    reduceMarkets(
      reducePeerLoans(
        reduceDraft(reduceCredit(reduceBoard(reduceSession(state, event), event), event), event),
        event,
      ),
      event,
    ),
    event,
  )
  return reduceDecks(owned, event)
}

export function replay(events: readonly GameEvent[]): GameState {
  const [first, ...rest] = events
  if (first === undefined || first.type !== 'GameCreated') {
    throw new Error('The first event in a log must be GameCreated.')
  }
  return rest.reduce(reduce, initialState(first.config))
}
