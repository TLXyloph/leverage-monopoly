import { describe, expect, it } from 'vitest'
import { isRejection } from '../../core/errors.js'
import type { GameState, PoolAssetRef } from '../../core/state.js'
import { collateralLiquidationProceeds } from '../credit/index.js'
import {
  eventsOf, gameState, loan, pool, rejectionOf, tranches, withLoans, withPlayers, withPools,
  realDeed, totalMoney,
} from './fixture.js'
import {
  cumulativeClaim, expectedPoolCashflow, findPool, isRetired, trancheFace,
} from './selectors.js'
import { decideSecuritization } from './decide.js'
import { reduceSecuritization } from './reduce.js'

/** Three peer loans lent by P1 to P2/P3, whose combined expected cashflow at round 13
 * is exactly $1,910: two at $500 outstanding / 10% / maturing round 15 (each worth
 * $500 + floorPercent(500, 0.1) x 2 = $600), one at $592 (worth $592 + 59 x 2 = $710). */
function loansTotalling1910() {
  return [
    loan('l-1', { outstanding: 500, ratePerRound: 0.1, maturesAtRound: 15 }),
    loan('l-2', { outstanding: 500, ratePerRound: 0.1, maturesAtRound: 15 }),
    loan('l-3', { outstanding: 592, ratePerRound: 0.1, maturesAtRound: 15 }),
  ]
}

const THREE_LOANS: readonly PoolAssetRef[] = [
  { kind: 'peer-loan', id: 'l-1' },
  { kind: 'peer-loan', id: 'l-2' },
  { kind: 'peer-loan', id: 'l-3' },
]

describe('pool and tranche reads', () => {
  it('finds a pool by contract id', () => {
    const state = withPools(gameState(), [pool('pool-1')])
    expect(findPool(state, 'pool-1')?.originator).toBe('P1')
    expect(findPool(state, 'pool-9')).toBeUndefined()
  })

  it('accumulates the claim standing ahead of and including each tranche', () => {
    const p = pool('pool-1', { tranches: tranches(600, 500, 810) })
    expect(trancheFace(p, 'senior')).toBe(600)
    expect(cumulativeClaim(p, 'senior')).toBe(600)
    expect(cumulativeClaim(p, 'mezzanine')).toBe(1100)
    expect(cumulativeClaim(p, 'equity')).toBe(1910)
  })

  it('retires senior and mezzanine at face but never retires equity', () => {
    expect(isRetired({ kind: 'senior', face: 600, paid: 600, holder: 'P2' })).toBe(true)
    expect(isRetired({ kind: 'senior', face: 600, paid: 599, holder: 'P2' })).toBe(false)
    expect(isRetired({ kind: 'equity', face: 810, paid: 99_999, holder: 'P2' })).toBe(false)
  })

  it('sums expected cashflow across the pooled peer loans, round 13', () => {
    const state = withLoans(gameState({ round: 13 }), loansTotalling1910())
    const p = pool('pool-1', { assets: THREE_LOANS })
    expect(expectedPoolCashflow(state, p)).toBe(1910)
  })

  it('excludes a matured, defaulted or unknown loan from expected cashflow', () => {
    const state = withLoans(gameState({ round: 13 }), [
      loan('l-1', { status: 'repaid' }),
      loan('l-2', { status: 'defaulted' }),
    ])
    const p = pool('pool-1', {
      assets: [{ kind: 'peer-loan', id: 'l-1' }, { kind: 'peer-loan', id: 'l-2' }, { kind: 'peer-loan', id: 'l-9' }],
    })
    expect(expectedPoolCashflow(state, p)).toBe(0)
  })
})

describe('CreatePool', () => {
  const loanState = () => withLoans(gameState({ round: 13 }), loansTotalling1910())

  it('creates three tranches, sizing equity as the spec 19.3 residual', () => {
    const result = decideSecuritization(loanState(), {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 600, mezzanineFace: 500,
    })
    expect(eventsOf(result)).toEqual([{
      type: 'PoolCreated', id: 'pool-1', originator: 'P1', assets: THREE_LOANS,
      tranches: [
        { kind: 'senior', face: 600, paid: 0, holder: 'P1' },
        { kind: 'mezzanine', face: 500, paid: 0, holder: 'P1' },
        { kind: 'equity', face: 810, paid: 0, holder: 'P1' }, // 1910 - 600 - 500
      ],
    }])
  })

  it('rejects a pool of fewer than three assets', () => {
    const result = decideSecuritization(loanState(), {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS.slice(0, 2), seniorFace: 100, mezzanineFace: 100,
    })
    expect(rejectionOf(result).code).toBe('POOL_NEEDS_THREE_ASSETS')
  })

  it('rejects pooling an asset the originator does not own', () => {
    const state = withLoans(gameState({ round: 13 }), [
      loan('l-1', { lender: 'P1' }),
      loan('l-2', { lender: 'P1' }),
      loan('l-3', { lender: 'P4' }),
    ])
    const result = decideSecuritization(state, {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 100, mezzanineFace: 100,
    })
    expect(rejectionOf(result).code).toBe('NOT_ASSET_OWNER')
  })

  it('rejects senior plus mezzanine above the pool\'s expected cashflow', () => {
    const result = decideSecuritization(loanState(), {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 1500, mezzanineFace: 411, // 1911 > 1910
    })
    expect(rejectionOf(result).code).toBe('TRANCHES_EXCEED_POOL')
  })

  it('accepts senior plus mezzanine at exactly the pool\'s expected cashflow', () => {
    const result = decideSecuritization(loanState(), {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 1500, mezzanineFace: 410,
    })
    expect(isRejection(result)).toBe(false)
    const created = eventsOf(result)[0]
    expect(created).toMatchObject({ tranches: [
      { kind: 'senior', face: 1500 }, { kind: 'mezzanine', face: 410 }, { kind: 'equity', face: 0 },
    ] })
  })

  it('rejects a negative or fractional tranche face', () => {
    expect(rejectionOf(decideSecuritization(loanState(), {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: -1, mezzanineFace: 100,
    })).code).toBe('NEGATIVE_AMOUNT')
    expect(rejectionOf(decideSecuritization(loanState(), {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 100.5, mezzanineFace: 100,
    })).code).toBe('NEGATIVE_AMOUNT')
  })

  it('rejects an asset already locked inside a live pool', () => {
    const state = withPools(loanState(), [pool('pool-0', { assets: THREE_LOANS })])
    const result = decideSecuritization(state, {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 100, mezzanineFace: 100,
    })
    expect(rejectionOf(result).code).toBe('ASSET_ALREADY_POOLED')
  })

  it('allows re-pooling an asset from a pool that has already terminated', () => {
    const state = withPools(loanState(), [pool('pool-0', { assets: THREE_LOANS, terminated: true })])
    const result = decideSecuritization(state, {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 100, mezzanineFace: 100,
    })
    expect(isRejection(result)).toBe(false)
  })

  it('rejects pooling before Era III', () => {
    const state = { ...loanState(), config: { ...loanState().config, unlockMode: 'progressive' as const }, era: 2 as const }
    const result = decideSecuritization(state, {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 100, mezzanineFace: 100,
    })
    expect(rejectionOf(result).code).toBe('INSTRUMENT_LOCKED_THIS_ERA')
  })

  it('allows pooling in Era III under progressive unlock', () => {
    const state = { ...loanState(), config: { ...loanState().config, unlockMode: 'progressive' as const }, era: 3 as const }
    const result = decideSecuritization(state, {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 100, mezzanineFace: 100,
    })
    expect(isRejection(result)).toBe(false)
  })

  it('rejects outside an Open phase', () => {
    const result = decideSecuritization({ ...loanState(), phase: 'movement' }, {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 100, mezzanineFace: 100,
    })
    expect(rejectionOf(result).code).toBe('WRONG_PHASE')
  })

  it('rejects a duplicate pool id', () => {
    const state = withPools(loanState(), [pool('pool-1', { assets: [] })])
    const result = decideSecuritization(state, {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 100, mezzanineFace: 100,
    })
    expect(rejectionOf(result).code).toBe('DUPLICATE_CONTRACT_ID')
  })
})

describe('SellTranche', () => {
  function withPool1(over: Partial<GameState> = {}) {
    return withPools(gameState({ ...over }), [
      pool('pool-1', { tranches: tranches(600, 500, 810, 'P1') }),
    ])
  }

  it('emits a sale event when the holder sells to a solvent buyer', () => {
    const state = withPlayers(withPool1(), { P2: { cleanCash: 500 } })
    const result = decideSecuritization(state, {
      type: 'SellTranche', player: 'P1', poolId: 'pool-1', tranche: 'senior', to: 'P2', price: 300,
    })
    expect(eventsOf(result)).toEqual([{
      type: 'TrancheSold', poolId: 'pool-1', tranche: 'senior', from: 'P1', to: 'P2', price: 300,
    }])
  })

  it('rejects a seller who does not hold that tranche', () => {
    const result = decideSecuritization(withPool1(), {
      type: 'SellTranche', player: 'P2', poolId: 'pool-1', tranche: 'senior', to: 'P3', price: 100,
    })
    expect(rejectionOf(result).code).toBe('NOT_OWNER')
  })

  it('rejects selling to yourself', () => {
    const result = decideSecuritization(withPool1(), {
      type: 'SellTranche', player: 'P1', poolId: 'pool-1', tranche: 'senior', to: 'P1', price: 100,
    })
    expect(rejectionOf(result).code).toBe('SELF_DEALING')
  })

  it('rejects a buyer who cannot cover the price', () => {
    const state = withPlayers(withPool1(), { P2: { cleanCash: 50 } })
    const result = decideSecuritization(state, {
      type: 'SellTranche', player: 'P1', poolId: 'pool-1', tranche: 'senior', to: 'P2', price: 300,
    })
    expect(rejectionOf(result).code).toBe('INSUFFICIENT_CLEAN_CASH')
  })

  it('rejects a sale on an unknown pool or a terminated one', () => {
    expect(rejectionOf(decideSecuritization(withPool1(), {
      type: 'SellTranche', player: 'P1', poolId: 'pool-9', tranche: 'senior', to: 'P2', price: 1,
    })).code).toBe('CONTRACT_NOT_FOUND')
    const terminated = withPools(gameState(), [
      pool('pool-1', { tranches: tranches(600, 500, 810, 'P1'), terminated: true }),
    ])
    expect(rejectionOf(decideSecuritization(terminated, {
      type: 'SellTranche', player: 'P1', poolId: 'pool-1', tranche: 'senior', to: 'P2', price: 1,
    })).code).toBe('CONTRACT_NOT_FOUND')
  })
})

describe('reducer: cash movement and state transitions', () => {
  it('appends a newly created pool', () => {
    const state = gameState()
    const next = reduceSecuritization(state, {
      type: 'PoolCreated', id: 'pool-1', originator: 'P1', assets: THREE_LOANS, tranches: tranches(600, 500, 810),
    })
    expect(next.pools).toHaveLength(1)
    expect(next.pools[0]?.id).toBe('pool-1')
    expect(next.pools[0]?.terminated).toBe(false)
  })

  it('moves cash and the holder on a tranche sale', () => {
    const state = withPlayers(
      withPools(gameState(), [pool('pool-1', { tranches: tranches(600, 500, 810, 'P1') })]),
      { P1: { cleanCash: 1000 }, P2: { cleanCash: 500 } },
    )
    const next = reduceSecuritization(state, {
      type: 'TrancheSold', poolId: 'pool-1', tranche: 'senior', from: 'P1', to: 'P2', price: 300,
    })
    expect(next.players.P1.cleanCash).toBe(1300)
    expect(next.players.P2.cleanCash).toBe(200)
    expect(next.pools[0]?.tranches.find((t) => t.kind === 'senior')?.holder).toBe('P2')
  })

  it('moves cash from the originator to the tranche holders and accrues paid', () => {
    const state = withPlayers(
      withPools(gameState(), [pool('pool-1', {
        originator: 'P1',
        tranches: [
          { kind: 'senior', face: 600, paid: 0, holder: 'P2' },
          { kind: 'mezzanine', face: 500, paid: 0, holder: 'P3' },
          { kind: 'equity', face: 810, paid: 0, holder: 'P1' },
        ],
      })]),
      { P1: { cleanCash: 1000 }, P2: { cleanCash: 1000 }, P3: { cleanCash: 1000 } },
    )
    const next = reduceSecuritization(state, {
      type: 'WaterfallPaid', poolId: 'pool-1', collected: 900,
      distributions: [{ tranche: 'senior', amount: 600 }, { tranche: 'mezzanine', amount: 300 }],
    })
    expect(next.players.P1.cleanCash).toBe(100) // 1000 - 900 collected
    expect(next.players.P2.cleanCash).toBe(1600) // 1000 + 600 senior
    expect(next.players.P3.cleanCash).toBe(1300) // 1000 + 300 mezzanine
    expect(next.pools[0]?.tranches.map((t) => t.paid)).toEqual([600, 300, 0])
  })

  it('never lets the originator\'s clean cash go negative even if collected exceeds it', () => {
    const state = withPlayers(
      withPools(gameState(), [pool('pool-1', {
        originator: 'P1',
        tranches: [{ kind: 'senior', face: 100, paid: 0, holder: 'P2' }, { kind: 'mezzanine', face: 0, paid: 0, holder: 'P2' }, { kind: 'equity', face: 0, paid: 0, holder: 'P2' }],
      })]),
      { P1: { cleanCash: 40 }, P2: { cleanCash: 0 } },
    )
    const next = reduceSecuritization(state, {
      type: 'WaterfallPaid', poolId: 'pool-1', collected: 100,
      distributions: [{ tranche: 'senior', amount: 100 }],
    })
    expect(next.players.P1.cleanCash).toBe(0)
    expect(next.players.P2.cleanCash).toBe(100)
  })

  it('moves defaulted collateral to the bank, debits the Treasury, and credits the originator', () => {
    const state = { ...withPools(gameState(), [pool('pool-1', { originator: 'P1' })]), treasury: 5000 }
    const next = reduceSecuritization(state, {
      type: 'PoolCollateralLiquidated', poolId: 'pool-1', loanId: 'l-1', deeds: ['boardwalk'], proceeds: 320,
    })
    expect(next.deeds['boardwalk']?.owner).toBe('bank')
    expect(next.treasury).toBe(4680) // 5000 - 320, the bank-purchase leg
    expect(next.players.P1.cleanCash).toBe(2820) // 2500 (starting cash) + 320
  })

  it('marks a pool terminated without moving any money', () => {
    const state = withPools(gameState(), [pool('pool-1')])
    const next = reduceSecuritization(state, {
      type: 'PoolTerminated', poolId: 'pool-1', shortfalls: [{ tranche: 'equity', shortfall: 810 }],
    })
    expect(next.pools[0]?.terminated).toBe(true)
  })

  it('ignores events belonging to other contexts', () => {
    const state = gameState()
    expect(reduceSecuritization(state, { type: 'SalaryPaid', player: 'P1', amount: 350 })).toBe(state)
  })
})

/**
 * spec section 20's conserved identity: sum(cleanCash) - sum(drawnCredit) -
 * sum(distressedDebt) + treasury. Every event `reduceSecuritization` owns is checked:
 * pool creation moves nothing, a tranche sale and a waterfall distribution are pure
 * player-to-player transfers, and collateral liquidation is a bank purchase with a
 * Treasury counterparty. Pool termination moves nothing.
 */
describe('money conservation (Global Constraint)', () => {
  it('holds across pool creation', () => {
    const before = withLoans(gameState({ round: 13 }), loansTotalling1910())
    const created = eventsOf(decideSecuritization(before, {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 600, mezzanineFace: 500,
    }))
    const after = created.reduce(reduceSecuritization, before)
    expect(totalMoney(after)).toBe(totalMoney(before))
  })

  it('holds across a waterfall distribution', () => {
    const before = withPlayers(
      withPools(gameState(), [pool('pool-1', {
        originator: 'P1',
        tranches: [
          { kind: 'senior', face: 600, paid: 0, holder: 'P2' },
          { kind: 'mezzanine', face: 500, paid: 0, holder: 'P3' },
          { kind: 'equity', face: 810, paid: 0, holder: 'P1' },
        ],
      })]),
      { P1: { cleanCash: 3000 } },
    )
    const after = reduceSecuritization(before, {
      type: 'WaterfallPaid', poolId: 'pool-1', collected: 2000,
      distributions: [
        { tranche: 'senior', amount: 600 }, { tranche: 'mezzanine', amount: 500 }, { tranche: 'equity', amount: 900 },
      ],
    })
    expect(totalMoney(after)).toBe(totalMoney(before))
    expect(after.players.P1.cleanCash).toBe(1900) // 3000 - 2000 + 900 as equity holder
  })

  it('holds across a collateral liquidation, because the bank purchase debits Treasury', () => {
    const before = { ...withPools(gameState(), [pool('pool-1')]), treasury: 5000 }
    const after = reduceSecuritization(before, {
      type: 'PoolCollateralLiquidated', poolId: 'pool-1', loanId: 'l-1', deeds: ['boardwalk'], proceeds: 320,
    })
    expect(totalMoney(after)).toBe(totalMoney(before))
  })

  it('holds across a pool termination', () => {
    const before = withPools(gameState(), [pool('pool-1')])
    const after = reduceSecuritization(before, {
      type: 'PoolTerminated', poolId: 'pool-1', shortfalls: [{ tranche: 'equity', shortfall: 810 }],
    })
    expect(totalMoney(after)).toBe(totalMoney(before))
  })

  it('holds across the full lifecycle in one pass: create, liquidate, distribute, terminate', () => {
    // Loans must be `active` to pass CreatePool's ownership check; they are moved to
    // their post-Settlement statuses (defaulted / repaid) AFTER the pool already
    // exists, exactly as they would resolve in a later round of the real game.
    const start = withLoans(
      { ...gameState({ round: 13 }), treasury: 5000 },
      [
        loan('l-1', { outstanding: 500, ratePerRound: 0.1, maturesAtRound: 15, collateral: ['boardwalk'] }),
        loan('l-2', { outstanding: 500, ratePerRound: 0.1, maturesAtRound: 15 }),
        loan('l-3', { outstanding: 592, ratePerRound: 0.1, maturesAtRound: 15 }),
      ],
    )
    const withDeed = { ...start, deeds: { ...start.deeds, boardwalk: realDeed('boardwalk', 'P2') } }
    const created = eventsOf(decideSecuritization(withDeed, {
      type: 'CreatePool', player: 'P1', poolId: 'pool-1',
      assets: THREE_LOANS, seniorFace: 600, mezzanineFace: 500,
    }))
    let state = created.reduce(reduceSecuritization, withDeed)
    expect(totalMoney(state)).toBe(totalMoney(withDeed))

    // A later round: l-1 defaults, l-2 and l-3 are repaid.
    state = {
      ...state,
      loans: [
        loan('l-1', { outstanding: 500, ratePerRound: 0.1, maturesAtRound: 15, status: 'defaulted', collateral: ['boardwalk'] }),
        loan('l-2', { outstanding: 500, ratePerRound: 0.1, maturesAtRound: 15, status: 'repaid' }),
        loan('l-3', { outstanding: 592, ratePerRound: 0.1, maturesAtRound: 15, status: 'repaid' }),
      ],
    }

    const proceeds = collateralLiquidationProceeds(state, loan('l-1', { collateral: ['boardwalk'] }))
    state = reduceSecuritization(state, {
      type: 'PoolCollateralLiquidated', poolId: 'pool-1', loanId: 'l-1', deeds: ['boardwalk'], proceeds,
    })
    const collected = proceeds + 550 // 320 + 550 = 870
    state = reduceSecuritization(state, {
      type: 'WaterfallPaid', poolId: 'pool-1', collected,
      distributions: [{ tranche: 'senior', amount: 600 }, { tranche: 'mezzanine', amount: 270 }],
    })
    state = reduceSecuritization(state, {
      type: 'PoolTerminated', poolId: 'pool-1', shortfalls: [{ tranche: 'mezzanine', shortfall: 500 }],
    })
    expect(totalMoney(state)).toBe(totalMoney(withDeed))
  })
})
