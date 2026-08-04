import { GROUP_MEMBERS, RAILROAD_RENT, UTILITY_MULTIPLIER } from '../../config/board.js'
import type { DeedState, GameState, RentFuture } from '../../core/state.js'
import type { ColorGroup, DeedId, DiceRoll, Money, PlayerId } from '../../core/types.js'
import { diceTotal } from './selectors.js'

/** A mortgaged or bank/unowned deed collects no rent and counts as unowned. */
function collectingOwner(deed: DeedState): PlayerId | null {
  if (deed.owner === null || deed.owner === 'bank') return null
  if (deed.mortgaged) return null
  return deed.owner
}

export function countOwnedInGroup(
  state: GameState,
  group: ColorGroup,
  owner: PlayerId,
): number {
  return GROUP_MEMBERS[group].filter((id) => {
    const deed = state.deeds[id]
    return deed !== undefined && deed.owner === owner && !deed.mortgaged
  }).length
}

/**
 * Owning every deed in a colour group doubles the rent on each INDIVIDUALLY
 * undeveloped deed in it. Houses on one deed do not stop its undeveloped
 * siblings from doubling. A mortgaged member breaks the group entirely, since
 * a mortgaged deed counts as unowned for every ownership test.
 */
export function ownsWholeGroup(
  state: GameState,
  group: ColorGroup,
  owner: PlayerId,
): boolean {
  return GROUP_MEMBERS[group].every((id) => {
    const deed = state.deeds[id]
    return deed !== undefined && deed.owner === owner && !deed.mortgaged
  })
}

export function rentDue(state: GameState, deedId: DeedId, dice: DiceRoll): Money {
  const deed = state.deeds[deedId]
  if (deed === undefined) return 0
  const owner = collectingOwner(deed)
  if (owner === null) return 0

  if (deed.group === 'railroad') {
    return RAILROAD_RENT[countOwnedInGroup(state, 'railroad', owner)] ?? 0
  }
  if (deed.group === 'utility') {
    const multiplier = UTILITY_MULTIPLIER[countOwnedInGroup(state, 'utility', owner)] ?? 0
    return multiplier * diceTotal(dice)
  }
  // A developed deed reads its rent table and is never doubled.
  if (deed.houses > 0) {
    return deed.rentTable[deed.houses] ?? 0
  }
  const base = deed.rentTable[0] ?? 0
  return ownsWholeGroup(state, deed.group, owner) ? base * 2 : base
}

export function activeFutureOn(state: GameState, deedId: DeedId): RentFuture | null {
  return state.futures.find(
    (f) => f.deed === deedId
      && state.round >= f.startRound
      && state.round <= f.endRound,
  ) ?? null
}

/** The active futures holder if a contract is live, otherwise the collecting owner. */
export function rentRecipient(state: GameState, deedId: DeedId): PlayerId | null {
  const deed = state.deeds[deedId]
  if (deed === undefined) return null
  const owner = collectingOwner(deed)
  if (owner === null) return null
  return activeFutureOn(state, deedId)?.holder ?? owner
}
