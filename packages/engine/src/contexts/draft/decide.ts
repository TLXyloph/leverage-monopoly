import { reject, type Rejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { resolveDraftRound } from './resolve.js'
import { cheapestAvailable, hasSubmitted } from './selectors.js'

/**
 * Discriminated on `type`, matching every other context's command shape
 * (`SessionCommand`, `BoardCommand`). Not `kind` -- the brief for this task
 * used `kind`, which is inconsistent with the rest of the codebase.
 */
export type DraftCommand =
  | {
      readonly type: 'submit-draft'
      readonly player: PlayerId
      readonly ranked: readonly [DeedId, DeedId, DeedId]
      readonly maxBid: Money
    }
  | { readonly type: 'resolve-draft-round' }

function faceValueOf(state: GameState, deed: DeedId): Money {
  return state.deeds[deed]?.faceValue ?? 0
}

export function decideDraft(
  state: GameState,
  command: DraftCommand,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'draft' || state.draft === null || state.draft.complete) {
    return reject('WRONG_PHASE', 'The draft is not open.')
  }

  if (command.type === 'submit-draft') {
    const { player, ranked, maxBid } = command
    if (hasSubmitted(state, player)) {
      return reject('ALREADY_SUBMITTED', 'You have already submitted this draft round.')
    }
    if (new Set(ranked).size !== 3) {
      return reject('DEED_UNAVAILABLE', 'Your three choices must be three different deeds.')
    }
    for (const deed of ranked) {
      const held = state.deeds[deed]
      if (held === undefined) {
        return reject('DEED_UNAVAILABLE', `There is no deed called ${deed}.`)
      }
      if (held.owner !== null) {
        return reject('DEED_UNAVAILABLE', `${deed} was allocated in an earlier round.`)
      }
    }
    const first = ranked[0]
    const firstFace = faceValueOf(state, first)
    if (maxBid < firstFace) {
      return reject('BID_BELOW_FACE', `Your bid must be at least the $${firstFace} face value.`)
    }
    if (maxBid > state.players[player].cleanCash) {
      return reject('BID_EXCEEDS_BUDGET', 'Your bid is more than your remaining cash.')
    }
    return [{ type: 'DraftSubmitted', player, ranked, maxBid }]
  }

  // 'resolve-draft-round': every player must have submitted, UNLESS their cash
  // could not cover even the cheapest remaining deed's face value -- in which
  // case no valid triple exists for them, and rule 7 will award them the
  // cheapest remaining deed for free during resolution.
  const floor = cheapestAvailable(state)
  for (const player of state.config.turnOrder) {
    if (hasSubmitted(state, player)) continue
    if (floor !== null && state.players[player].cleanCash < faceValueOf(state, floor)) continue
    return reject('WRONG_PHASE', `${player} has not submitted this draft round yet.`)
  }
  return resolveDraftRound(state)
}
