import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { Era, PlayerId } from '../../core/types.js'
import { type Rejection, reject } from '../../core/errors.js'
import { deckFor } from './cards/index.js'

export type DeckCommand =
  | { readonly type: 'ShuffleDeck'; readonly era: Era; readonly order: readonly number[] }
  | { readonly type: 'DrawCard'; readonly era: Era; readonly player: PlayerId }
  | {
      readonly type: 'ReorderDeck'; readonly era: Era; readonly player: PlayerId
      readonly order: readonly number[]
    }

function decideShuffle(
  state: GameState, cmd: Extract<DeckCommand, { type: 'ShuffleDeck' }>,
): readonly GameEvent[] | Rejection {
  const size = deckFor(cmd.era).length
  const sorted = [...cmd.order].sort((a, b) => a - b)
  const valid = sorted.length === size && sorted.every((v, i) => v === i)
  if (!valid) return reject('INVALID_WINDOW', 'The shuffle order must be a permutation of the deck.')
  if (state.decks[cmd.era].drawn > 0) {
    return reject('INVALID_WINDOW', 'This era deck has already been drawn from.')
  }
  return [{ type: 'DeckShuffled', era: cmd.era, order: cmd.order }]
}

function decideDraw(
  state: GameState, cmd: Extract<DeckCommand, { type: 'DrawCard' }>,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'movement') {
    return reject(
      'WRONG_PHASE', 'Cards are drawn during Movement, when a token rests on a card square.',
    )
  }
  const deck = state.decks[cmd.era]
  if (deck.order.length === 0) {
    return reject('CONTRACT_NOT_FOUND', 'This era deck has not been shuffled yet.')
  }
  if (deck.drawn >= deck.order.length) {
    return reject('CONTRACT_NOT_FOUND', 'This era deck is exhausted.')
  }
  return [{ type: 'CardDrawn', era: cmd.era, index: deck.drawn, player: cmd.player }]
}

/** Only E3-05 (Material Non-Public Information) grants the right to reorder. The
 * private reveal itself is a client-side concern; the engine records only the chosen
 * permutation of the next three undrawn slots, so replay stays exact. */
function decideReorder(
  state: GameState, cmd: Extract<DeckCommand, { type: 'ReorderDeck' }>,
): readonly GameEvent[] | Rejection {
  const deck = state.decks[cmd.era]
  const head = deck.order.slice(deck.drawn, deck.drawn + 3)
  const permutes = [...cmd.order].sort().join(',') === [...head].sort().join(',')
  if (!permutes || cmd.order.length !== head.length) {
    return reject('CONTRACT_NOT_FOUND', 'You may only reorder the cards you were shown.')
  }
  const next = [...deck.order]
  cmd.order.forEach((v, i) => { next[deck.drawn + i] = v })
  return [{ type: 'DeckReordered', era: cmd.era, order: next, player: cmd.player }]
}

export function decideDeck(state: GameState, cmd: DeckCommand): readonly GameEvent[] | Rejection {
  switch (cmd.type) {
    case 'ShuffleDeck': return decideShuffle(state, cmd)
    case 'DrawCard': return decideDraw(state, cmd)
    case 'ReorderDeck': return decideReorder(state, cmd)
  }
}
