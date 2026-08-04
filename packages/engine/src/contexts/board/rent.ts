import { GROUP_MEMBERS, RAILROAD_RENT, UTILITY_MULTIPLIER } from '../../config/board.js'
import { rentMultiplier } from '../../core/card-effects.js'
import { floorPercent } from '../../core/money.js'
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

/** The board's own rent formula, before any card modifier. */
function baseRentDue(state: GameState, deedId: DeedId, dice: DiceRoll): Money {
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

/**
 * The rent actually charged. era-decks 6.2: every live `rent-multiplier` card modifier
 * composes multiplicatively against the board's own formula, in card-draw order, and a
 * SINGLE flooring happens at the end — `rentMultiplier` returns the composed factor and
 * `floorPercent` does the exact multiply, so a 1.5x on a $14 rent is $21 and never
 * $20.999999. A deed with no modifier on it returns a factor of exactly 1, which
 * `floorPercent` leaves untouched, so the uncarded game is bit-identical to before.
 *
 * Applied here rather than at the emission site so that every reader of "what does this
 * deed charge" — `board/decide.ts`'s landing resolution, `markets`' rent-future
 * valuation, the assist panel — sees the same number. A modifier that raised the charge
 * but not the valuation would let a card mint value out of the mark-to-model.
 */
export function rentDue(state: GameState, deedId: DeedId, dice: DiceRoll): Money {
  const base = baseRentDue(state, deedId, dice)
  if (base <= 0) return base
  return floorPercent(base, rentMultiplier(state, deedId))
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
