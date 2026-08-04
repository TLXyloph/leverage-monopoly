import { describe, it, expect } from 'vitest'
import { destination, isDoubles, passesGo } from './index.js'
import { decideBoardAction } from '../../core/decide.js'
import { initialState } from '../session/index.js'
import { reduce } from '../../core/reduce.js'
import { isRejection } from '../../core/errors.js'
import { ECONOMY } from '../../config/economy.js'
import type { GameConfig, GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { DiceRoll, PlayerId } from '../../core/types.js'

const CONFIG: GameConfig = {
  turnOrder: ['P1', 'P2', 'P3', 'P4'],
  unlockMode: 'progressive',
  winCondition: { kind: 'fixed-rounds' },
}

function movementState(overrides: Partial<GameState['players']['P1']> = {}): GameState {
  const base = initialState(CONFIG)
  return {
    ...base,
    phase: 'movement',
    players: { ...base.players, P1: { ...base.players.P1, ...overrides } },
  }
}

function roll(state: GameState, dice: DiceRoll, player: PlayerId = 'P1'): readonly GameEvent[] {
  const result = decideBoardAction(state, { type: 'roll-dice', player, dice })
  if (isRejection(result)) throw new Error(`${result.code}: ${result.message}`)
  return result
}

function apply(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce(reduce, state)
}

/**
 * Cash held by players, plus the Treasury, less what the bank has lent out.
 * Every event must leave this constant.
 */
function totalMoney(state: GameState): number {
  return Object.values(state.players)
    .reduce((t, p) => t + p.cleanCash - p.drawnCredit, 0) + state.treasury
}

describe('movement arithmetic', () => {
  it('wraps the board and detects passing GO', () => {
    expect(destination(0, 7)).toBe(7)
    expect(destination(39, 3)).toBe(2)
    expect(destination(34, 6)).toBe(0)
    expect(passesGo(0, 7)).toBe(false)
    expect(passesGo(39, 3)).toBe(true)
    expect(passesGo(34, 6)).toBe(true)
    expect(isDoubles([4, 4])).toBe(true)
    expect(isDoubles([4, 5])).toBe(false)
  })
})

describe('rolling and moving', () => {
  it('moves the token and emits nothing else on a quiet square', () => {
    const before = movementState({ position: 0 })
    const events = roll(before, [3, 4])
    expect(events).toEqual([
      { type: 'DiceRolled', player: 'P1', dice: [3, 4] },
      { type: 'TokenMoved', player: 'P1', from: 0, to: 7, passedGo: false },
    ])
    const after = apply(before, events)
    expect(after.players.P1.position).toBe(7)
    expect(after.activePlayer).toBe('P1')
  })

  it('pays the $350 GO salary on passing GO', () => {
    const before = movementState({ position: 36 })
    const events = roll(before, [2, 4])
    expect(events).toContainEqual({
      type: 'SalaryPaid', player: 'P1', amount: ECONOMY.GO_SALARY,
    })
    const after = apply(before, events)
    expect(after.players.P1.position).toBe(2)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH + 350)
    expect(after.treasury).toBe(-350)
    expect(totalMoney(after)).toBe(totalMoney(before))
  })

  it('pays the GO salary on landing exactly on GO', () => {
    const before = movementState({ position: 34 })
    const after = apply(before, roll(before, [3, 3]))
    expect(after.players.P1.position).toBe(0)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH + 350)
  })

  it('charges $200 Income Tax on square 4 and $100 Luxury Tax on square 38', () => {
    const income = movementState({ position: 0 })
    const afterIncome = apply(income, roll(income, [1, 3]))
    expect(afterIncome.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 200)
    expect(afterIncome.treasury).toBe(200)

    const luxury = movementState({ position: 33 })
    const afterLuxury = apply(luxury, roll(luxury, [2, 3]))
    expect(afterLuxury.players.P1.position).toBe(38)
    expect(afterLuxury.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 100)
    expect(afterLuxury.treasury).toBe(100)
  })

  it('capitalises an unpayable tax into drawn credit, uncapped', () => {
    const before = movementState({ position: 0, cleanCash: 30 })
    const events = roll(before, [1, 3])
    expect(events).toContainEqual({
      type: 'TaxPaid', player: 'P1', amount: 200, kind: 'income',
    })
    expect(events).toContainEqual({
      type: 'ObligationCapitalised', player: 'P1', amount: 170, obligation: 'tax',
    })
    const after = apply(before, events)
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P1.drawnCredit).toBe(170)
    // The Treasury is paid the full assessed tax regardless.
    expect(after.treasury).toBe(200)
    expect(after.players.P1.distressedDebt).toBe(0)
    expect(totalMoney(after)).toBe(totalMoney(before))
  })

  it('capitalises without regard to the borrowing base', () => {
    // No deeds, so the borrowing base is zero and a voluntary draw is impossible.
    const before = movementState({ position: 0, cleanCash: 0 })
    const after = apply(before, roll(before, [1, 3]))
    expect(after.players.P1.drawnCredit).toBe(200)
    expect(after.players.P1.cleanCash).toBe(0)
  })
})

describe('jail', () => {
  it('sends a player to jail from square 30 without paying GO', () => {
    const before = movementState({ position: 26 })
    const events = roll(before, [1, 3])
    expect(events).toContainEqual({
      type: 'SentToJail', player: 'P1', reason: 'square',
    })
    const after = apply(before, events)
    expect(after.players.P1.position).toBe(10)
    expect(after.players.P1.inJail).toBe(true)
    expect(after.players.P1.consecutiveDoubles).toBe(0)
  })

  it('sends a player to jail on the third consecutive double without moving', () => {
    const before = movementState({ position: 18, consecutiveDoubles: 2 })
    const events = roll(before, [5, 5])
    expect(events).toEqual([
      { type: 'DiceRolled', player: 'P1', dice: [5, 5] },
      { type: 'SentToJail', player: 'P1', reason: 'triple-doubles' },
    ])
    const after = apply(before, events)
    expect(after.players.P1.position).toBe(10)
  })

  it('counts consecutive doubles and resets on a non-double', () => {
    let state = movementState({ position: 0 })
    state = apply(state, roll(state, [2, 2]))
    expect(state.players.P1.consecutiveDoubles).toBe(1)
    state = apply(state, roll(state, [3, 3]))
    expect(state.players.P1.consecutiveDoubles).toBe(2)
    state = apply(state, roll(state, [1, 2]))
    expect(state.players.P1.consecutiveDoubles).toBe(0)
  })

  it('charges the mandatory $50 to leave jail, then moves normally', () => {
    const before = movementState({ position: 10, inJail: true })
    const events = roll(before, [3, 4])
    expect(events[1]).toEqual({
      type: 'JailExited', player: 'P1', fee: ECONOMY.JAIL_FEE,
    })
    const after = apply(before, events)
    expect(after.players.P1.inJail).toBe(false)
    expect(after.players.P1.position).toBe(17)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 50)
    expect(after.treasury).toBe(50)
    expect(totalMoney(after)).toBe(totalMoney(before))
  })
})

describe('validation', () => {
  it('refuses a roll outside the movement phase', () => {
    const state = { ...movementState(), phase: 'open' as const }
    const result = decideBoardAction(state, { type: 'roll-dice', player: 'P1', dice: [1, 1] })
    expect(isRejection(result) && result.code).toBe('WRONG_PHASE')
  })

  it('refuses dice outside 1-6', () => {
    const result = decideBoardAction(movementState(), {
      type: 'roll-dice', player: 'P1', dice: [0, 7],
    })
    expect(isRejection(result) && result.code).toBe('INVALID_DICE')
  })
})
