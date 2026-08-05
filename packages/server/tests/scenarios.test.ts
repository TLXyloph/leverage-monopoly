import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ECONOMY, borrowingBase, marginShortfall, type GameState, type PlayerId,
} from '@leverage/engine'
import { startHarness, type Harness } from './harness.js'
import {
  advanceTo, landOn, playRound, readState, readSync, runDraft, runSettlement, SAFE_ROLLS,
} from './driver.js'

/**
 * The spec section 15 scenarios, driven through the real HTTP surface against a real
 * SQLite file. Each one is here because it exercises a mechanism no unit test can reach:
 * a chain that crosses three contexts and a Settlement boundary.
 */

async function eventTypes(h: Harness): Promise<string[]> {
  const { body } = await h.get(`/api/game/${h.gameId}/log`, h.tokens.admin)
  return (body as { events: { type: string }[] }).events.map((e) => e.type)
}

async function logOf(h: Harness): Promise<{ type: string; [key: string]: unknown }[]> {
  const { body } = await h.get(`/api/game/${h.gameId}/log`, h.tokens.admin)
  return (body as { events: { type: string }[] }).events as { type: string }[]
}

function deedsOf(state: GameState, player: PlayerId): string[] {
  return Object.values(state.deeds).filter((d) => d.owner === player).map((d) => d.id)
}

describe('margin call leading to forced liquidation', () => {
  let h: Harness

  beforeEach(async () => { h = await startHarness({ unlockMode: 'all' }) })
  afterEach(async () => { await h.close() })

  it('flags at the base, liquidates at the 80% floor, and each sale narrows the shortfall', async () => {
    await runDraft(h)
    await advanceTo(h, 'open')

    // Draw the full borrowing base, then mortgage a deed out from under it. The base
    // falls by 75% of face while the drawn balance stays put: an instant breach.
    let state = await readState(h)
    const headroom = borrowingBase(state, 'P1')
    await h.must({ type: 'DrawCredit', player: 'P1', amount: headroom }, h.tokens.players.P1)
    const [biggest] = deedsOf(state, 'P1')
      .sort((a, b) => (state.deeds[b]?.faceValue ?? 0) - (state.deeds[a]?.faceValue ?? 0))
    await h.must({ type: 'MortgageDeed', player: 'P1', deed: biggest ?? '' }, h.tokens.players.P1)

    state = await readState(h)
    expect(marginShortfall(state, 'P1')).toBeGreaterThan(0)

    await playRound(h, SAFE_ROLLS)
    state = await readState(h)
    expect(state.players.P1.marginCallFlaggedAt).not.toBeNull()
    expect(await eventTypes(h)).toContain('MarginCallFlagged')

    // The cure window is the whole of the next round. Waste it.
    await playRound(h, SAFE_ROLLS)
    await advanceTo(h, 'open')

    state = await readState(h)
    expect((await readSync(h)).derived.awaitingLiquidation).toContain('P1')

    const shortfalls: number[] = [marginShortfall(state, 'P1')]
    for (let lot = 0; lot < 8; lot += 1) {
      state = await readState(h)
      if (marginShortfall(state, 'P1') <= 0) break
      const queue = (await readSync(h)).assist.P1.credit.liquidationQueue
      const next = queue[0]
      if (next === undefined) break
      const deed = state.deeds[next]
      if (deed === undefined) break
      await h.must({
        type: 'SettleLiquidationLot', player: 'P1', deed: next,
        // No bidder: the bank takes the lot at the floor, which is the case the
        // convergence proof turns on.
        bids: [],
      })
      shortfalls.push(marginShortfall(await readState(h), 'P1'))
    }

    /**
     * Liquidation convergence is a load-bearing invariant, not a nicety: the floor
     * (80% of face) must exceed the advance rate (75%) or every forced sale would widen
     * the shortfall it is meant to close, and a margin call could never be resolved.
     */
    for (let i = 1; i < shortfalls.length; i += 1) {
      expect(shortfalls[i]).toBeLessThan(shortfalls[i - 1] as number)
    }

    const types = await eventTypes(h)
    expect(types).toContain('DeedLiquidated')

    const log = await logOf(h)
    const sale = log.find((e) => e.type === 'DeedLiquidated') as
      { deed: string; price: number; buyer: string } | undefined
    expect(sale).toBeDefined()
    const face = (await readState(h)).deeds[sale?.deed ?? '']?.faceValue ?? 0
    expect(sale?.price).toBe(Math.floor(face * ECONOMY.LIQUIDATION_FLOOR))
    expect(sale?.buyer).toBe('bank')
  }, 60_000)
})

describe('rent futures', () => {
  let h: Harness

  beforeEach(async () => { h = await startHarness({ unlockMode: 'all' }) })
  afterEach(async () => { await h.close() })

  it('originates, resells, survives a deed trade, routes rent, and expires', async () => {
    await runDraft(h)
    await advanceTo(h, 'open')

    const start = await readState(h)
    const deed = deedsOf(start, 'P1').find((id) => start.deeds[id]?.group !== 'utility')
    if (deed === undefined) throw new Error('P1 drafted nothing usable')

    await h.must({
      type: 'OriginateRentFuture', player: 'P1', deed, holder: 'P2',
      startRound: start.round + 1, endRound: start.round + 3, price: 120,
    }, h.tokens.players.P1)

    const contract = (await readState(h)).futures[0]?.id ?? ''
    await h.must({
      type: 'SellRentFuture', player: 'P2', contract, to: 'P3', price: 130,
    }, h.tokens.players.P2)
    expect((await readState(h)).futures[0]?.holder).toBe('P3')

    /**
     * Spec section 6: the encumbrance follows the DEED. Trading the underlying away must
     * not shake the contract off it — that would be a free way to strip a counterparty.
     */
    await h.must({
      type: 'TradeAssets', from: 'P1', to: 'P4',
      deedsFrom: [deed], deedsTo: [], cashFrom: 0, cashTo: 1,
      confirmedBy: ['P1', 'P4'],
    }, h.tokens.players.P1)
    const traded = await readState(h)
    expect(traded.deeds[deed]?.owner).toBe('P4')
    expect(traded.futures[0]?.holder).toBe('P3')

    // Into the contract window, and walk a payer onto the deed.
    await playRound(h, SAFE_ROLLS)
    await advanceTo(h, 'movement')
    await landOn(h, 'P2', deed)

    const types = await eventTypes(h)
    expect(types).toContain('RentCharged')
    expect(types).toContain('RentRoutedToFuture')
    const log = await logOf(h)
    const routed = log.find((e) => e.type === 'RentRoutedToFuture') as
      { holder: string; amount: number } | undefined
    expect(routed?.holder).toBe('P3')
    expect(routed?.amount).toBeGreaterThan(0)

    await runSettlement(h)
    await h.must({ type: 'advance-phase' })
    await playRound(h, SAFE_ROLLS)
    await playRound(h, SAFE_ROLLS)
    expect(await eventTypes(h)).toContain('RentFutureExpired')
  }, 60_000)
})

describe('CDOs and credit default swaps', () => {
  let h: Harness

  beforeEach(async () => { h = await startHarness({ unlockMode: 'all' }) })
  afterEach(async () => { await h.close() })

  it('pools three loans, rates and pays the waterfall, then triggers a CDS on default', async () => {
    await runDraft(h)
    await advanceTo(h, 'open')

    // P1 lends to all three others, on a one-round term so a default lands quickly.
    for (const borrower of ['P2', 'P3', 'P4'] as const) {
      await h.must({
        type: 'OriginatePeerLoan', lender: 'P1', borrower,
        principal: 150, ratePerRound: 0.1, termRounds: 2, collateral: [],
      }, h.tokens.players.P1)
    }
    const loans = (await readState(h)).loans.map((l) => l.id)
    expect(loans).toHaveLength(3)

    await h.must({
      type: 'CreatePool', player: 'P1',
      assets: loans.map((id) => ({ kind: 'peer-loan' as const, id })),
      seniorFace: 200, mezzanineFace: 100,
    }, h.tokens.players.P1)

    const pool = (await readState(h)).pools[0]
    expect(pool?.tranches).toHaveLength(3)
    const ratings = (await readSync(h)).derived.poolRatings[pool?.id ?? '']
    expect(ratings).toHaveLength(3)
    expect(ratings?.[0]?.rating).toMatch(/^(AAA|AA|A|BBB|BB|B|CCC)$/)

    await h.must({
      type: 'SellTranche', player: 'P1', poolId: pool?.id ?? '',
      tranche: 'senior', to: 'P2', price: 150,
    }, h.tokens.players.P1)

    // A swap referencing one of the pooled loans. P3 buys protection from P4.
    await h.must({
      type: 'WriteSwap', buyer: 'P3', seller: 'P4',
      reference: { kind: 'peer-loan', id: loans[0] ?? '' },
      notional: 100, premiumPerRound: 10,
    }, h.tokens.players.P3)

    await playRound(h, SAFE_ROLLS)
    const afterOne = await eventTypes(h)
    expect(afterOne).toContain('PeerLoanInterestPaid')
    expect(afterOne).toContain('WaterfallPaid')
    expect(afterOne).toContain('SwapPremiumPaid')

    /**
     * Nobody repays, so every loan defaults the moment its two-round term expires
     * (spec section 7's second trigger: an outstanding balance at maturity).
     */
    await playRound(h, SAFE_ROLLS)
    await playRound(h, SAFE_ROLLS)

    const types = await eventTypes(h)
    expect(types).toContain('PeerLoanDefaulted')
    /**
     * The scenario claims to prove a CDS fires. Asserting the event by name is what stops
     * it passing because nothing happened — the exact failure the E2E brief warns about.
     */
    expect(types).toContain('SwapTriggered')
  }, 60_000)
})

describe('the underworld', () => {
  let h: Harness

  beforeEach(async () => { h = await startHarness({ unlockMode: 'all' }) })
  afterEach(async () => { await h.close() })

  it('runs a venture to dirty cash, launders it, and loses the rest to an audit', async () => {
    await runDraft(h)
    await advanceTo(h, 'open')

    await h.must({
      type: 'LaunchVenture', player: 'P1', venture: 'numbers', fundedFrom: 'clean',
    }, h.tokens.players.P1)
    expect((await readState(h)).players.P1.heat).toBe(ECONOMY.VENTURES.numbers.heat)

    await playRound(h, SAFE_ROLLS)
    const paid = await readState(h)
    expect(paid.players.P1.dirtyCash).toBe(ECONOMY.VENTURES.numbers.perRound)
    expect(await eventTypes(h)).toContain('VentureTicked')

    await advanceTo(h, 'open')
    const dirty = (await readState(h)).players.P1.dirtyCash
    await h.must({
      type: 'LaunderCash', player: 'P1', amount: dirty,
    }, h.tokens.players.P1)
    const laundered = await readState(h)
    expect(laundered.players.P1.dirtyCash).toBe(0)
    expect(await eventTypes(h)).toContain('CashLaundered')

    // Play to the first audit round, then roll a total at or below Heat.
    while ((await readState(h)).round < ECONOMY.AUDIT_FIRST_ROUND) {
      await playRound(h, SAFE_ROLLS)
    }
    await advanceTo(h, 'open')
    await h.must({
      type: 'PlaySpeakeasy', player: 'P1', dice: [6, 6], fundedFrom: 'clean',
    }, h.tokens.players.P1)
    const heated = await readState(h)
    expect(heated.players.P1.dirtyCash).toBeGreaterThan(0)

    await advanceTo(h, 'movement')
    await runSettlement(h, { P1: [1, 1], P2: [6, 6], P3: [6, 6], P4: [6, 6] })

    const audited = await readState(h)
    expect(audited.players.P1.dirtyCash).toBe(0)
    expect(audited.players.P1.heat).toBe(0)
    const types = await eventTypes(h)
    expect(types).toContain('AuditChecked')
    expect(types).toContain('AuditResolved')
  }, 120_000)
})

describe('the distressed path', () => {
  let h: Harness

  beforeEach(async () => { h = await startHarness({ unlockMode: 'all' }) })
  afterEach(async () => { await h.close() })

  it('writes down what liquidation cannot clear and keeps the player in the game', async () => {
    await runDraft(h)
    await advanceTo(h, 'open')

    let state = await readState(h)
    await h.must({
      type: 'DrawCredit', player: 'P1', amount: borrowingBase(state, 'P1'),
    }, h.tokens.players.P1)
    // Give the drawn cash away, so no portfolio and no cash remain to cure with.
    state = await readState(h)
    await h.must({
      type: 'TradeAssets', from: 'P1', to: 'P2',
      deedsFrom: deedsOf(state, 'P1'), deedsTo: [], cashFrom: state.players.P1.cleanCash, cashTo: 0,
      confirmedBy: ['P1', 'P2'],
    }, h.tokens.players.P1)

    state = await readState(h)
    expect(borrowingBase(state, 'P1')).toBe(0)
    expect(marginShortfall(state, 'P1')).toBeGreaterThan(0)

    await playRound(h, SAFE_ROLLS)
    expect(await eventTypes(h)).toContain('MarginCallFlagged')
    await playRound(h, SAFE_ROLLS)

    // The cure window has now elapsed: liquidation is due at the next Open phase.
    expect((await readSync(h)).derived.awaitingLiquidation).toContain('P1')
    expect(await eventTypes(h)).not.toContain('CreditWrittenDown')

    /**
     * With no deeds left there is no lot to auction, so entering the Open phase writes
     * the whole residual balance down at once. Spec 19.7 reserves that terminal state
     * for exactly this case — and nobody is eliminated: P1 keeps playing and finishes
     * negative, which is the entire reason the rule exists.
     */
    await advanceTo(h, 'open')
    expect(await eventTypes(h)).toContain('CreditWrittenDown')
    expect((await readSync(h)).derived.awaitingLiquidation).not.toContain('P1')

    await playRound(h, SAFE_ROLLS)
    expect(await eventTypes(h)).toContain('DistressedDebtAccrued')

    const after = await readState(h)
    expect(after.players.P1.distressedDebt).toBeGreaterThan(0)
    expect((await readSync(h)).derived.netWorths.P1).toBeLessThan(0)
    expect(after.phase).not.toBe('complete')
  }, 60_000)
})
