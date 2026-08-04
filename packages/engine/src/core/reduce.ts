import { reduceBoard, reduceProperty } from '../contexts/board/index.js'
import { reduceCredit, reducePeerLoans } from '../contexts/credit/index.js'
import { reduceDecks } from '../contexts/decks/index.js'
import { reduceDraft } from '../contexts/draft/index.js'
import { reduceMarkets } from '../contexts/markets/index.js'
import { reduceSecuritization } from '../contexts/securitization/index.js'
import { initialState, reduceSession } from '../contexts/session/index.js'
import { reduceUnderworld } from '../contexts/underworld/index.js'
import type { GameEvent } from './events.js'
import type { GameState } from './state.js'

/**
 * `decks` is deliberately last: it both handles its own three events (DeckShuffled,
 * CardDrawn, DeckReordered) and observes every other event to maintain the rent,
 * dirty-action and laundering counters dynamic card targets rank on, so it must see
 * state and events strictly after every owning context has applied them.
 *
 * `reduceUnderworld` and `reduceSecuritization` are wired in immediately before
 * `decks`, alongside `reduceProperty`. Task 19 closed a gap here (proven by
 * `git log -S"reduceUnderworld" -- core/reduce.ts`, and by underworld/securitization's
 * own test suites applying their reducers directly rather than through this function):
 * neither event set overlaps any other context's switch cases (the only shared event
 * types are the meta events `PhaseAdvanced`/`RoundAdvanced`, which every context patches
 * independently on its own slice of state), so their exact position among the "owned"
 * reducers is not load-bearing for correctness — only their position relative to `decks`
 * is, since `decks`' counters must observe state and events after every domain reducer
 * has applied them. Placed last among the domain reducers (after `board`'s five property
 * events) because `securitization` is the only context that reaches into `credit` AND
 * `markets` for its own selectors (`findPeerLoan`, `borrowingBase`, `markRentFuture`,
 * `markDeedOption`), so its state-affecting reduction naturally comes after both.
 */
export function reduce(state: GameState, event: GameEvent): GameState {
  const owned = reduceSecuritization(
    reduceUnderworld(
      reduceProperty(
        reduceMarkets(
          reducePeerLoans(
            reduceDraft(reduceCredit(reduceBoard(reduceSession(state, event), event), event), event),
            event,
          ),
          event,
        ),
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
