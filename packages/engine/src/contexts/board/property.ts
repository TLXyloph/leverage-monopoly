import { GROUP_MEMBERS } from '../../config/board.js'
import { ECONOMY } from '../../config/economy.js'
import { floorPercent } from '../../core/money.js'
import type { DeedState, GameState } from '../../core/state.js'
import type { ColorGroup, Money } from '../../core/types.js'

/** A hotel is recorded as the fifth building on a deed. Task 2, DeedState.houses. */
export const HOTEL_LEVEL = 5

/** Houses handed back to the table when a hotel replaces them. */
export const HOUSES_PER_HOTEL = 4

/** Movement of the table supply, expressed as a delta on the remaining counts. */
export interface SupplyDelta {
  readonly houses: number
  readonly hotels: number
}

/** Railroads and utilities have no rent table and no house cost. Spec section 2. */
export function isBuildable(deed: DeedState): boolean {
  return deed.group !== 'railroad' && deed.group !== 'utility'
}

export function groupDeeds(state: GameState, group: ColorGroup): readonly DeedState[] {
  return GROUP_MEMBERS[group].flatMap((id) => {
    const deed = state.deeds[id]
    return deed === undefined ? [] : [deed]
  })
}

export function lowestInGroup(state: GameState, group: ColorGroup): number {
  return groupDeeds(state, group).reduce(
    (low, d) => Math.min(low, d.houses), HOTEL_LEVEL,
  )
}

export function highestInGroup(state: GameState, group: ColorGroup): number {
  return groupDeeds(state, group).reduce((high, d) => Math.max(high, d.houses), 0)
}

/** True when any deed in the group carries a building. Gates mortgaging and trading. */
export function groupIsDeveloped(state: GameState, group: ColorGroup): boolean {
  return groupDeeds(state, group).some((d) => d.houses > 0)
}

/**
 * The even-build rule: no deed may run more than one building ahead of a sibling.
 * Building is therefore legal only on a deed currently at the group minimum, and
 * selling only from one at the group maximum. Both directions are enforced, and
 * both are tested.
 */
export function canBuildOn(state: GameState, deed: DeedState): boolean {
  return deed.houses < HOTEL_LEVEL && deed.houses === lowestInGroup(state, deed.group)
}

export function canSellFrom(state: GameState, deed: DeedState): boolean {
  return deed.houses > 0 && deed.houses === highestInGroup(state, deed.group)
}

/**
 * Task 3 already multiplied the printed board figure by HOUSE_COST_MULTIPLIER when it
 * built DEED_LIST, so `houseCost` is the 90% price. Re-applying the multiplier here
 * would charge 81%.
 */
export function buildingCost(deed: DeedState): Money {
  return deed.houseCost
}

/** Spec 19.6: buildings sell back at 50% of the price PAID. */
export function sellbackValue(deed: DeedState): Money {
  return floorPercent(deed.houseCost, ECONOMY.BUILDING_SELLBACK_RATE)
}

export function mortgageProceeds(deed: DeedState): Money {
  return floorPercent(deed.faceValue, ECONOMY.MORTGAGE_RATE)
}

export function unmortgageCost(deed: DeedState): Money {
  return floorPercent(deed.faceValue, ECONOMY.UNMORTGAGE_RATE)
}

/**
 * Supply movement for placing the (houses + 1)-th building. A hotel consumes one
 * hotel and RETURNS its four houses to the table, which is the whole point of the
 * housing shortage: four hotels free up sixteen houses for everyone else.
 */
export function supplyForBuild(houses: number): SupplyDelta {
  return houses + 1 === HOTEL_LEVEL
    ? { houses: HOUSES_PER_HOTEL, hotels: -1 }
    : { houses: -1, hotels: 0 }
}

/** The exact inverse. Breaking a hotel takes four houses back OUT of the supply. */
export function supplyForSell(houses: number): SupplyDelta {
  return houses === HOTEL_LEVEL
    ? { houses: -HOUSES_PER_HOTEL, hotels: 1 }
    : { houses: 1, hotels: 0 }
}
