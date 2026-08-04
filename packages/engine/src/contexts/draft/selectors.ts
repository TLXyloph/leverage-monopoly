import { DEED_IDS } from '../../config/board.js'
import type { GameState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { PLAYER_IDS } from '../../core/types.js'

/** 28 deeds / 4 players. Every player ends the draft with exactly seven. Spec section 3. */
export const DRAFT_ROUNDS: number = DEED_IDS.length / PLAYER_IDS.length

/** Unallocated deeds, cheapest first; square index breaks face-value ties. */
export function availableDeeds(state: GameState): readonly DeedId[] {
  return Object.values(state.deeds)
    .filter((deed) => deed.owner === null)
    .sort((a, b) => a.faceValue - b.faceValue || a.square - b.square)
    .map((deed) => deed.id)
}

export function cheapestAvailable(state: GameState): DeedId | null {
  return availableDeeds(state)[0] ?? null
}

/** Sum of face value across every deed currently owned by `player`. */
export function faceValueAcquired(state: GameState, player: PlayerId): Money {
  return Object.values(state.deeds)
    .filter((deed) => deed.owner === player)
    .reduce((total, deed) => total + deed.faceValue, 0)
}

export function deedCount(state: GameState, player: PlayerId): number {
  return Object.values(state.deeds).filter((deed) => deed.owner === player).length
}

export function hasSubmitted(state: GameState, player: PlayerId): boolean {
  return state.draft?.submissions.some((submission) => submission.player === player) ?? false
}

export function turnIndex(state: GameState, player: PlayerId): number {
  return state.config.turnOrder.indexOf(player)
}
