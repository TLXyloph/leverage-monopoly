import { describe, it, expect } from 'vitest'
import { decideBoard, rentDue, rentRecipient } from './index.js'
import { initialState } from '../session/index.js'
import { reduce } from '../../core/reduce.js'
import { isRejection } from '../../core/errors.js'
import { ECONOMY } from '../../config/economy.js'
import type { GameConfig, GameState } from '../../core/state.js'
import type { DeedId, DiceRoll, PlayerId } from '../../core/types.js'

const CONFIG: GameConfig = {
  turnOrder: ['P1', 'P2', 'P3', 'P4'],
  unlockMode: 'progressive',
  winCondition: { kind: 'fixed-rounds' },
}

interface Holding {
  readonly deed: DeedId
  readonly owner: PlayerId
  readonly houses?: number
  readonly mortgaged?: boolean
}

function board(holdings: readonly Holding[], patch: Partial<GameState> = {}): GameState {
  const base = initialState(CONFIG)
  const deeds = { ...base.deeds }
  for (const h of holdings) {
    const deed = deeds[h.deed]
    if (deed === undefined) throw new Error(`No such deed: ${h.deed}`)
    deeds[h.deed] = {
      ...deed,
      owner: h.owner,
      houses: h.houses ?? 0,
      mortgaged: h.mortgaged ?? false,
    }
  }
  return { ...base, phase: 'movement', deeds, ...patch }
}

const ROLL: DiceRoll = [3, 4]

describe('colour group rent', () => {
  it('charges base rent on a single unimproved deed', () => {
    expect(rentDue(board([{ deed: 'boardwalk', owner: 'P2' }]), 'boardwalk', ROLL)).toBe(50)
  })

  it('doubles base rent when the owner holds the whole group', () => {
    const state = board([
      { deed: 'boardwalk', owner: 'P2' },
      { deed: 'park-place', owner: 'P2' },
    ])
    expect(rentDue(state, 'boardwalk', ROLL)).toBe(100)
    expect(rentDue(state, 'park-place', ROLL)).toBe(70)
  })

  it('does not double a partially owned group', () => {
    const state = board([
      { deed: 'boardwalk', owner: 'P2' },
      { deed: 'park-place', owner: 'P3' },
    ])
    expect(rentDue(state, 'boardwalk', ROLL)).toBe(50)
  })

  it('keeps doubling undeveloped siblings when another deed is developed', () => {
    const state = board([
      { deed: 'boardwalk', owner: 'P2' },
      { deed: 'park-place', owner: 'P2', houses: 1 },
    ])
    // Doubling is per-square: Boardwalk is still unimproved, so it still doubles.
    expect(rentDue(state, 'boardwalk', ROLL)).toBe(100)
    // Park Place is improved, so it reads its rent table and is never doubled.
    expect(rentDue(state, 'park-place', ROLL)).toBe(175)
  })

  it('doubles each undeveloped member of a three-deed group independently', () => {
    const state = board([
      { deed: 'st-james-place', owner: 'P2', houses: 2 },
      { deed: 'tennessee-avenue', owner: 'P2' },
      { deed: 'new-york-avenue', owner: 'P2' },
    ])
    expect(rentDue(state, 'st-james-place', ROLL)).toBe(200)
    expect(rentDue(state, 'tennessee-avenue', ROLL)).toBe(28)
    expect(rentDue(state, 'new-york-avenue', ROLL)).toBe(32)
  })

  it('stops doubling when any deed in the group is mortgaged', () => {
    const state = board([
      { deed: 'boardwalk', owner: 'P2' },
      { deed: 'park-place', owner: 'P2', mortgaged: true },
    ])
    expect(rentDue(state, 'boardwalk', ROLL)).toBe(50)
    expect(rentDue(state, 'park-place', ROLL)).toBe(0)
  })

  it('reads the rent table by house count, hotel at index 5', () => {
    const houses = [50, 200, 600, 1400, 1700, 2000]
    for (let n = 0; n < houses.length; n += 1) {
      const state = board([{ deed: 'boardwalk', owner: 'P2', houses: n }])
      expect(rentDue(state, 'boardwalk', ROLL), `${n} houses`).toBe(houses[n])
    }
  })

  it('charges nothing on an unowned, bank-owned or mortgaged deed', () => {
    expect(rentDue(initialState(CONFIG), 'boardwalk', ROLL)).toBe(0)
    expect(rentDue(board([{ deed: 'boardwalk', owner: 'P2', mortgaged: true }]), 'boardwalk', ROLL)).toBe(0)
  })
})

describe('railroad and utility rent', () => {
  const RAILROADS: readonly DeedId[] = [
    'reading-railroad', 'pennsylvania-railroad', 'b-and-o-railroad', 'short-line',
  ]

  it('charges 25/50/100/200 by number of railroads owned', () => {
    const expected = [25, 50, 100, 200]
    for (let n = 1; n <= 4; n += 1) {
      const state = board(RAILROADS.slice(0, n).map((deed) => ({ deed, owner: 'P2' as const })))
      expect(rentDue(state, 'reading-railroad', ROLL), `${n} owned`).toBe(expected[n - 1])
    }
  })

  it('excludes mortgaged railroads from the count', () => {
    const state = board([
      { deed: 'reading-railroad', owner: 'P2' },
      { deed: 'short-line', owner: 'P2', mortgaged: true },
    ])
    expect(rentDue(state, 'reading-railroad', ROLL)).toBe(25)
    expect(rentDue(state, 'short-line', ROLL)).toBe(0)
  })

  it('charges 4x the dice roll for one utility and 10x for both', () => {
    const one = board([{ deed: 'electric-company', owner: 'P2' }])
    expect(rentDue(one, 'electric-company', [3, 4])).toBe(28)
    const both = board([
      { deed: 'electric-company', owner: 'P2' },
      { deed: 'water-works', owner: 'P2' },
    ])
    expect(rentDue(both, 'electric-company', [3, 4])).toBe(70)
    expect(rentDue(both, 'water-works', [6, 6])).toBe(120)
  })
})

describe('who pays and who receives', () => {
  function land(state: GameState, from: number, dice: DiceRoll, player: PlayerId = 'P1') {
    const seeded: GameState = {
      ...state,
      players: { ...state.players, [player]: { ...state.players[player], position: from } },
    }
    const result = decideBoard(seeded, { type: 'roll-dice', player, dice })
    if (isRejection(result)) throw new Error(result.message)
    return { seeded, events: result }
  }

  it('charges rent from the lander to the owner', () => {
    const state = board([{ deed: 'boardwalk', owner: 'P2' }])
    const { seeded, events } = land(state, 32, [3, 4])
    expect(events).toContainEqual({
      type: 'RentCharged', from: 'P1', to: 'P2', deed: 'boardwalk', amount: 50,
    })
    const after = events.reduce(reduce, seeded)
    expect(after.players.P1.cleanCash).toBe(ECONOMY.STARTING_CASH - 50)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH + 50)
  })

  it('charges the owner nothing on their own deed', () => {
    const state = board([{ deed: 'boardwalk', owner: 'P1' }])
    const { events } = land(state, 32, [3, 4])
    expect(events.some((e) => e.type === 'RentCharged')).toBe(false)
  })

  it('routes rent to an active futures holder', () => {
    const state = board([{ deed: 'boardwalk', owner: 'P2' }], {
      round: 5,
      futures: [{ id: 'F1', deed: 'boardwalk', holder: 'P3', startRound: 4, endRound: 9 }],
    })
    expect(rentRecipient(state, 'boardwalk')).toBe('P3')
    const { events } = land(state, 32, [3, 4])
    expect(events).toContainEqual({
      type: 'RentCharged', from: 'P1', to: 'P3', deed: 'boardwalk', amount: 50,
    })
    expect(events).toContainEqual({
      type: 'RentRoutedToFuture', contract: 'F1', holder: 'P3', amount: 50,
    })
  })

  it('ignores a contract whose window has not started or has ended', () => {
    const early = board([{ deed: 'boardwalk', owner: 'P2' }], {
      round: 3,
      futures: [{ id: 'F1', deed: 'boardwalk', holder: 'P3', startRound: 4, endRound: 9 }],
    })
    expect(rentRecipient(early, 'boardwalk')).toBe('P2')
    const late = { ...early, round: 10 }
    expect(rentRecipient(late, 'boardwalk')).toBe('P2')
  })

  it('collects nothing when the futures holder lands on a deed they do not own', () => {
    const state = board([{ deed: 'boardwalk', owner: 'P2' }], {
      round: 5,
      futures: [{ id: 'F1', deed: 'boardwalk', holder: 'P1', startRound: 4, endRound: 9 }],
    })
    const { events } = land(state, 32, [3, 4])
    expect(events.some((e) => e.type === 'RentCharged')).toBe(false)
  })

  it('pays the payee in full and capitalises the payer shortfall', () => {
    const base = board([{ deed: 'boardwalk', owner: 'P2' }])
    const state: GameState = {
      ...base,
      players: { ...base.players, P1: { ...base.players.P1, cleanCash: 10 } },
    }
    const { seeded, events } = land(state, 32, [3, 4])
    expect(events).toContainEqual({
      type: 'ObligationCapitalised', player: 'P1', amount: 40, obligation: 'rent',
    })
    const after = events.reduce(reduce, seeded)
    expect(after.players.P1.cleanCash).toBe(0)
    expect(after.players.P1.drawnCredit).toBe(40)
    expect(after.players.P1.distressedDebt).toBe(0)
    expect(after.players.P2.cleanCash).toBe(ECONOMY.STARTING_CASH + 50)
    // The Treasury funds nothing; the bank does, via the drawn balance.
    expect(after.treasury).toBe(0)
  })
})
