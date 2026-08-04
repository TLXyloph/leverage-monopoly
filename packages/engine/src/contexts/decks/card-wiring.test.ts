import { describe, it, expect } from 'vitest'
import { ECONOMY } from '../../config/economy.js'
import type { Entitlement, ModifierEffect, TimedModifier } from './effects.js'
import type { GameEvent } from '../../core/events.js'
import type { GameState } from '../../core/state.js'
import type { PlayerId } from '../../core/types.js'
import { isRejection, type Rejection } from '../../core/errors.js'
import { reduce } from '../../core/reduce.js'
import { decideBoardAction, decidePropertyAction } from '../../core/decide.js'
import { rentDue } from '../board/index.js'
import {
  borrowingBase, creditInterestDue, creditInterestRate, liquidationRound,
  marginShortfall, settleCreditInterest,
} from '../credit/index.js'
import { decideUnderworld } from '../underworld/index.js'
import { baseState, withDeed, withPlayer } from './decks.fixture.js'

/**
 * Task 18 shipped twelve card-effect selectors and wired NONE of them: 23 `modify()`
 * and 11 `grant()` calls across the 80 authored cards changed nothing at all, and every
 * selector had passing unit tests proving it returned the right number to nobody.
 *
 * So these tests deliberately do NOT call the selectors. Every one of them drives the
 * real decider or the real settlement step and asserts that the OUTCOME moved — the
 * rent charged, the dollars a house cost, the salary paid, the event emitted. A test
 * that called `rentMultiplier` directly would have passed before this fix wave too,
 * which is exactly how the defect survived a full task review.
 */

let seq = 0

function modifier(effect: ModifierEffect, players: readonly PlayerId[]): TimedModifier {
  seq += 1
  return {
    id: `m-${seq}`,
    source: 'TEST',
    players,
    effect,
    expiry: { boundary: 'never', round: ECONOMY.TOTAL_ROUNDS },
    seq,
  }
}

function withModifier(
  state: GameState, effect: ModifierEffect, players: readonly PlayerId[] = ['P1'],
): GameState {
  return {
    ...state,
    cardEffects: {
      ...state.cardEffects,
      modifiers: [...state.cardEffects.modifiers, modifier(effect, players)],
    },
  }
}

function entitlement(
  kind: Entitlement['kind'], owner: PlayerId, capacity: number,
  params: Record<string, number>,
): Entitlement {
  seq += 1
  return {
    id: `e-${seq}`,
    source: 'TEST',
    kind,
    owner,
    remaining: capacity,
    expiry: { boundary: 'never', round: ECONOMY.TOTAL_ROUNDS },
    params,
  }
}

function withEntitlement(state: GameState, e: Entitlement): GameState {
  return {
    ...state,
    cardEffects: {
      ...state.cardEffects,
      entitlements: [...state.cardEffects.entitlements, e],
    },
  }
}

/** Unwraps a decider result, failing loudly on a rejection the test did not expect. */
function events(out: readonly GameEvent[] | Rejection): readonly GameEvent[] {
  if (isRejection(out)) throw new Error(`unexpected rejection: ${JSON.stringify(out)}`)
  return out
}

/** P1 owns the whole orange group unmortgaged, so St. James doubles to $28 base. */
function orangeOwner(): GameState {
  let s = baseState({ phase: 'movement' })
  for (const id of ['st-james-place', 'tennessee-avenue', 'new-york-avenue']) {
    s = withDeed(s, id, { owner: 'P1' })
  }
  return s
}

describe('rentMultiplier reaches the rent actually charged', () => {
  it('multiplies the rent a landing player is charged, not just a selector', () => {
    const plain = orangeOwner()
    expect(rentDue(plain, 'st-james-place', [1, 1])).toBe(28)

    const carded = withModifier(plain, { kind: 'rent-multiplier', factor: 1.5 }, ['P1'])
    // 28 * 1.5 = 42, floored once at the end.
    expect(rentDue(carded, 'st-james-place', [1, 1])).toBe(42)
  })

  it('changes the RentCharged amount board emits on a real landing', () => {
    // P2 sits on square 10 and rolls a 6 to land on St. James Place (square 16).
    const at = (s: GameState): GameState => withPlayer(s, 'P2', { position: 10, cleanCash: 900 })
    const roll = { type: 'roll-dice', player: 'P2', dice: [3, 3] } as const

    const before = events(decideBoardAction(at(orangeOwner()), roll))
      .find((e) => e.type === 'RentCharged')
    const after = events(decideBoardAction(
      at(withModifier(orangeOwner(), { kind: 'rent-multiplier', factor: 1.5 }, ['P1'])), roll,
    )).find((e) => e.type === 'RentCharged')

    expect(before?.type === 'RentCharged' && before.amount).toBe(28)
    expect(after?.type === 'RentCharged' && after.amount).toBe(42)
  })

  it('respects the group filter, so an unrelated group is untouched', () => {
    const s = withModifier(
      orangeOwner(), { kind: 'rent-multiplier', factor: 2, groups: ['red'] }, ['P1'],
    )
    expect(rentDue(s, 'st-james-place', [1, 1])).toBe(28)
  })
})

describe('borrowingBaseOverride reaches the borrowing base', () => {
  const owner = (): GameState => withDeed(baseState(), 'st-james-place', { owner: 'P1' })

  it('applies an addend', () => {
    expect(borrowingBase(owner(), 'P1')).toBe(135) // floor(180 * 0.75)
    const s = withModifier(owner(), { kind: 'borrowing-base-addend', dollars: 100 }, ['P1'])
    expect(borrowingBase(s, 'P1')).toBe(235)
  })

  it('applies a multiplier after the addend, in that order', () => {
    let s = withModifier(owner(), { kind: 'borrowing-base-addend', dollars: 100 }, ['P1'])
    s = withModifier(s, { kind: 'borrowing-base-multiplier', factor: 0.5 }, ['P1'])
    // (135 + 100) * 0.5 = 117.5 -> 117. Multiplier-then-addend would give 167.
    expect(borrowingBase(s, 'P1')).toBe(117)
  })

  it('redefines the advance RATES themselves', () => {
    const s = withModifier(
      owner(),
      { kind: 'borrowing-base-formula', deedRateFactor: 0.5, buildingRateFactor: 1 },
      ['P1'],
    )
    expect(borrowingBase(s, 'P1')).toBe(67) // floor(180 * 0.375)
  })

  it('leaves a player the modifier does not name alone', () => {
    const s = withModifier(owner(), { kind: 'borrowing-base-addend', dollars: 100 }, ['P2'])
    expect(borrowingBase(s, 'P1')).toBe(135)
  })
})

describe('marginThreshold reaches the margin check', () => {
  it('turns a compliant position into a breach', () => {
    let s = withDeed(baseState(), 'st-james-place', { owner: 'P1' })
    s = withPlayer(s, 'P1', { drawnCredit: 130 }) // base 135, so no breach
    expect(marginShortfall(s, 'P1')).toBe(-5)

    const tightened = withModifier(s, { kind: 'margin-threshold', ratio: 0.8 }, ['P1'])
    // Tolerated is now floor(135 * 0.8) = 108, so 130 drawn is $22 over.
    expect(marginShortfall(tightened, 'P1')).toBe(22)
  })
})

describe('interestRateFor and creditInterestWaived reach Settlement step 4', () => {
  const drawn = (): GameState => withPlayer(baseState({ era: 2 }), 'P1', { drawnCredit: 1000 })

  it('an override rate changes both the amount charged and the rate logged', () => {
    expect(creditInterestDue(drawn(), 'P1')).toBe(60) // era 2 = 6%
    const s = withModifier(drawn(), { kind: 'interest-rate-override', rate: 0.01 }, ['P1'])
    expect(creditInterestDue(s, 'P1')).toBe(10)

    const accrued = settleCreditInterest(s).find(
      (e) => e.type === 'InterestAccrued' && e.player === 'P1',
    )
    expect(accrued?.type === 'InterestAccrued' && accrued.amount).toBe(10)
    expect(accrued?.type === 'InterestAccrued' && accrued.rate).toBe(0.01)
  })

  it('a waiver cancels the charge for a levered player', () => {
    const s = withModifier(
      drawn(), { kind: 'waive-credit-interest', ifZeroBalanceCollect: 75 }, ['P1'],
    )
    expect(creditInterestDue(s, 'P1')).toBe(0)
    expect(creditInterestRate(s, 'P1')).toBe(0)
    expect(settleCreditInterest(s).some(
      (e) => e.type === 'InterestAccrued' && e.player === 'P1',
    )).toBe(false)
  })

  it('but charges the flat alternative to a debt-free player', () => {
    const s = withModifier(
      baseState({ era: 2 }), { kind: 'waive-credit-interest', ifZeroBalanceCollect: 75 }, ['P1'],
    )
    expect(creditInterestDue(s, 'P1')).toBe(75)
    const accrued = settleCreditInterest(s).find(
      (e) => e.type === 'InterestAccrued' && e.player === 'P1',
    )
    expect(accrued?.type === 'InterestAccrued' && accrued.amount).toBe(75)
  })
})

describe('goSalaryAddend reaches the GO payment', () => {
  it('tops up SalaryPaid for the player the card names', () => {
    // Position 38, roll 4 -> square 2, passing GO.
    const at = (s: GameState): GameState => withPlayer(s, 'P1', { position: 38 })
    const roll = { type: 'roll-dice', player: 'P1', dice: [2, 2] } as const

    const plain = events(decideBoardAction(at(baseState({ phase: 'movement' })), roll))
      .find((e) => e.type === 'SalaryPaid')
    expect(plain?.type === 'SalaryPaid' && plain.amount).toBe(ECONOMY.GO_SALARY)

    const carded = events(decideBoardAction(
      at(withModifier(baseState({ phase: 'movement' }), {
        kind: 'go-salary-addend', dollars: 150,
      }, ['P1'])),
      roll,
    )).find((e) => e.type === 'SalaryPaid')
    expect(carded?.type === 'SalaryPaid' && carded.amount).toBe(ECONOMY.GO_SALARY + 150)
  })
})

describe('buildingCostMultiplier reaches the build cost', () => {
  function buildable(): GameState {
    let s = baseState({ phase: 'open' })
    for (const id of ['st-james-place', 'tennessee-avenue', 'new-york-avenue']) {
      s = withDeed(s, id, { owner: 'P1' })
    }
    return withPlayer(s, 'P1', { cleanCash: 5000 })
  }
  const build = { type: 'BuildHouse', player: 'P1', deed: 'st-james-place' } as const

  it('discounts the HouseBuilt cost', () => {
    const plain = events(decidePropertyAction(buildable(), build))
      .find((e) => e.type === 'HouseBuilt')
    // St. James' houseCost is 90: $100 standard scaled by HOUSE_COST_MULTIPLIER.
    expect(plain?.type === 'HouseBuilt' && plain.cost).toBe(90)

    const carded = events(decidePropertyAction(
      withModifier(buildable(), { kind: 'building-cost-multiplier', factor: 0.75 }, ['P1']),
      build,
    )).find((e) => e.type === 'HouseBuilt')
    expect(carded?.type === 'HouseBuilt' && carded.cost).toBe(67) // floor(90 * 0.75)
  })

  it('composes with a half-price voucher, rate before dollars', () => {
    let s = withModifier(buildable(), { kind: 'building-cost-multiplier', factor: 0.75 }, ['P1'])
    s = withEntitlement(s, entitlement('half-price-house', 'P1', 1, { factor: 0.5 }))
    const built = events(decidePropertyAction(s, build)).find((e) => e.type === 'HouseBuilt')
    expect(built?.type === 'HouseBuilt' && built.cost).toBe(33) // floor(floor(90*.75)*.5)
  })

  it('spends the building credit and leaves the unused remainder', () => {
    const s = withEntitlement(
      buildable(), entitlement('building-credit', 'P1', 200, {}),
    )
    const out = events(decidePropertyAction(s, build))
    const built = out.find((e) => e.type === 'HouseBuilt')
    expect(built?.type === 'HouseBuilt' && built.cost).toBe(0)

    // $200 of capacity against a $90 house spends exactly $90 and keeps $110.
    const spend = out.find((e) => e.type === 'EntitlementConsumed')
    expect(spend?.type === 'EntitlementConsumed' && spend.used).toBe(90)

    const after = out.reduce(reduce, s)
    expect(after.cardEffects.entitlements[0]?.remaining).toBe(110)
  })
})

describe('discount-unmortgage reaches the unmortgage cost', () => {
  const cmd = { type: 'UnmortgageDeed', player: 'P1', deed: 'st-james-place' } as const
  function mortgaged(): GameState {
    const s = withDeed(baseState({ phase: 'open' }), 'st-james-place',
      { owner: 'P1', mortgaged: true })
    return withPlayer(s, 'P1', { cleanCash: 5000 })
  }

  it('prices at the voucher rate of face and spends the voucher', () => {
    const plain = events(decidePropertyAction(mortgaged(), cmd))
      .find((e) => e.type === 'DeedUnmortgaged')
    expect(plain?.type === 'DeedUnmortgaged' && plain.cost).toBe(99) // 180 * 0.55

    const s = withEntitlement(mortgaged(), entitlement('discount-unmortgage', 'P1', 1, { rate: 0.5 }))
    const out = events(decidePropertyAction(s, cmd))
    const carded = out.find((e) => e.type === 'DeedUnmortgaged')
    expect(carded?.type === 'DeedUnmortgaged' && carded.cost).toBe(90)
    expect(out.some((e) => e.type === 'EntitlementConsumed')).toBe(true)
    // Spent to zero. The record itself is swept at the next phase boundary by
    // `expireOn`, not the instant it empties, so `remaining` is what to assert here.
    expect(out.reduce(reduce, s).cardEffects.entitlements[0]?.remaining).toBe(0)
  })
})

describe('briberyTerms reaches bribery pricing', () => {
  const cmd = { type: 'Bribe', player: 'P1', effect: { kind: 'cancel-card' } } as const
  const briber = (dirty: number): GameState =>
    withPlayer(baseState({ phase: 'open', era: 3 }), 'P1', { dirtyCash: dirty })

  it('reprices the cost and the Heat charge', () => {
    const plain = events(decideUnderworld(briber(500), cmd))
    expect(plain[0]?.type === 'BriberyUsed' && plain[0].cost).toBe(ECONOMY.BRIBERY_COST)

    const s = withModifier(briber(500), { kind: 'bribery-terms', cost: 400, heat: 3 }, ['P1'])
    const carded = events(decideUnderworld(s, cmd))
    expect(carded[0]?.type === 'BriberyUsed' && carded[0].cost).toBe(400)
    expect(carded[1]?.type === 'HeatChanged' && carded[1].delta).toBe(3)
  })

  it('rejects against the CARDED price, not the ECONOMY one', () => {
    // $300 covers the standard $200 bribe but not the carded $400 one.
    expect(isRejection(decideUnderworld(briber(300), cmd))).toBe(false)
    const s = withModifier(briber(300), { kind: 'bribery-terms', cost: 400, heat: 3 }, ['P1'])
    expect(isRejection(decideUnderworld(s, cmd))).toBe(true)
  })
})

describe('entitlements reach underworld pricing', () => {
  it('half-price-venture discounts the launch and is spent', () => {
    const rich = withPlayer(baseState({ phase: 'open', era: 2 }), 'P1', { cleanCash: 5000 })
    const cmd = {
      type: 'LaunchVenture', player: 'P1', venture: 'escort', fundedFrom: 'clean',
    } as const

    const plain = events(decideUnderworld(rich, cmd))
    expect(plain[0]?.type === 'VentureLaunched' && plain[0].cost).toBe(150)

    const s = withEntitlement(rich, entitlement('half-price-venture', 'P1', 1, { factor: 0.5 }))
    const out = events(decideUnderworld(s, cmd))
    expect(out[0]?.type === 'VentureLaunched' && out[0].cost).toBe(75)
    expect(out.some((e) => e.type === 'EntitlementConsumed')).toBe(true)
  })

  it('cheap-launder replaces both the haircut and the Heat charge', () => {
    const dirty = withPlayer(
      baseState({ phase: 'open', era: 2 }), 'P1', { dirtyCash: 1000, heat: 4 },
    )
    const cmd = { type: 'LaunderCash', player: 'P1', amount: 400 } as const

    const plain = events(decideUnderworld(dirty, cmd))
    expect(plain[0]?.type === 'CashLaundered' && plain[0].cleanOut).toBeLessThan(400)
    expect(plain.some((e) => e.type === 'HeatChanged')).toBe(true)

    const s = withEntitlement(
      dirty, entitlement('cheap-launder', 'P1', 1, { haircut: 0.1, heatDelta: 0 }),
    )
    const out = events(decideUnderworld(s, cmd))
    expect(out[0]?.type === 'CashLaundered' && out[0].cleanOut).toBe(360)
    expect(out.some((e) => e.type === 'HeatChanged')).toBe(false)
    expect(out.some((e) => e.type === 'EntitlementConsumed')).toBe(true)
  })
})

describe('margin-call-waiver reaches the liquidation deadline', () => {
  it('pushes the deadline out by the token\'s extraRounds', () => {
    const flagged = withPlayer(baseState(), 'P1', { marginCallFlaggedAt: 7 })
    expect(liquidationRound(flagged, 'P1')).toBe(9)

    const s = withEntitlement(flagged, entitlement('margin-call-waiver', 'P1', 1, { extraRounds: 1 }))
    expect(liquidationRound(s, 'P1')).toBe(10)
  })
})
