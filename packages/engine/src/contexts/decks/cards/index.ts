import type { Era } from '../../../core/types.js'
import type { Card, CardId } from '../effects.js'
import { ERA_I } from './era1.js'
import { ERA_II } from './era2.js'
import { ERA_III } from './era3.js'
import { ERA_IV } from './era4.js'

export const DECKS: Readonly<Record<Era, readonly Card[]>> = {
  1: ERA_I, 2: ERA_II, 3: ERA_III, 4: ERA_IV,
}

export const ALL_CARDS: readonly Card[] = [...ERA_I, ...ERA_II, ...ERA_III, ...ERA_IV]

export function deckFor(era: Era): readonly Card[] {
  return DECKS[era]
}

export function cardById(id: CardId): Card {
  const found = ALL_CARDS.find((c) => c.id === id)
  if (found === undefined) throw new Error(`unknown card ${id}`)
  return found
}
