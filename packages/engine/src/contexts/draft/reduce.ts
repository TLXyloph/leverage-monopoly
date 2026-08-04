import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import { DRAFT_ROUNDS } from './selectors.js'

export function reduceDraft(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'PhaseAdvanced': {
      if (event.phase !== 'draft') return state
      return { ...state, draft: { round: 1, submissions: [], complete: false } }
    }

    case 'DraftSubmitted': {
      if (state.draft === null) return state
      const [first, second, third] = event.ranked
      if (first === undefined || second === undefined || third === undefined) return state
      return {
        ...state,
        draft: {
          ...state.draft,
          submissions: [
            ...state.draft.submissions,
            { player: event.player, ranked: [first, second, third], maxBid: event.maxBid },
          ],
        },
      }
    }

    case 'DraftDeedAwarded': {
      const deed = state.deeds[event.deed]
      if (deed === undefined) return state
      const player = state.players[event.player]
      return {
        ...state,
        deeds: { ...state.deeds, [event.deed]: { ...deed, owner: event.player } },
        players: {
          ...state.players,
          // Spec section 4: one unified pot. The draft spends operating cash.
          [event.player]: { ...player, cleanCash: player.cleanCash - event.price },
        },
        treasury: state.treasury + event.price,
      }
    }

    case 'DraftRoundResolved': {
      if (state.draft === null) return state
      const round = state.draft.round + 1
      return {
        ...state,
        draft: { round, submissions: [], complete: round > DRAFT_ROUNDS },
      }
    }

    default:
      return state
  }
}
