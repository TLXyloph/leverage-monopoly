import {
  GO_TO_JAIL_SQUARE, INCOME_TAX_SQUARE, borrowingBase,
  type ColorGroup, type GameState, type PlayerId,
} from '@leverage/engine'
import type { Harness } from './harness.js'
import {
  advanceTo, diceToReach, landOn, playRound, readState, readSync, runDraft, runSettlement,
  SAFE_ROLLS,
} from './driver.js'

/**
 * A reachability sweep: one game driven through every instrument the rules offer.
 *
 * Deliberately not realistic play. Its only claim is that each mechanism CAN fire when
 * the commands that should reach it are issued — which is exactly the question a
 * diff-versus-brief review never asks, and exactly how six defects (and then a seventh)
 * escaped the engine's task reviews with the shape *correct code, passing tests, nothing
 * calling it*.
 */

export function deedsOf(state: GameState, player: PlayerId): string[] {
  return Object.values(state.deeds).filter((d) => d.owner === player).map((d) => d.id)
}

/** Moves every deed in one colour group to `to`, so building becomes legal. */
async function assembleGroup(h: Harness, group: ColorGroup, to: PlayerId): Promise<string[]> {
  const state = await readState(h)
  const members = Object.values(state.deeds).filter((d) => d.group === group)
  for (const deed of members) {
    if (deed.owner === to || deed.owner === null || deed.owner === 'bank') continue
    if (deed.mortgaged) {
      await h.must({ type: 'UnmortgageDeed', player: deed.owner, deed: deed.id })
    }
    await h.must({
      type: 'TradeAssets', from: deed.owner, to,
      deedsFrom: [deed.id], deedsTo: [], cashFrom: 0, cashTo: 1,
      confirmedBy: [deed.owner, to],
    })
  }
  return members.map((d) => d.id)
}

async function sweepCredit(h: Harness): Promise<void> {
  await h.must({ type: 'DrawCredit', player: 'P1', amount: 200 }, h.tokens.players.P1)
  await h.must({ type: 'RepayCredit', player: 'P1', amount: 50 }, h.tokens.players.P1)

  const brown = await assembleGroup(h, 'brown', 'P1')
  for (const deed of brown) {
    await h.must({ type: 'BuildHouse', player: 'P1', deed }, h.tokens.players.P1)
  }
  await h.must({ type: 'SellHouse', player: 'P1', deed: brown[0] ?? '' }, h.tokens.players.P1)

  const state = await readState(h)
  const spare = deedsOf(state, 'P2').find((id) => state.deeds[id]?.houses === 0) ?? ''
  await h.must({ type: 'MortgageDeed', player: 'P2', deed: spare }, h.tokens.players.P2)
  await h.must({ type: 'UnmortgageDeed', player: 'P2', deed: spare }, h.tokens.players.P2)
}

async function sweepContracts(h: Harness): Promise<string> {
  // Peer loans: originated, sold, part-repaid.
  await h.must({
    type: 'OriginatePeerLoan', lender: 'P3', borrower: 'P4',
    principal: 200, ratePerRound: 0.1, termRounds: 6, collateral: [],
  }, h.tokens.players.P3)
  const loan = (await readState(h)).loans[0]?.id ?? ''
  await h.must({
    type: 'SellPeerLoanNote', player: 'P3', id: loan, to: 'P2', price: 180,
  }, h.tokens.players.P3)
  await h.must({ type: 'RepayPeerLoan', player: 'P4', id: loan, amount: 50 }, h.tokens.players.P4)

  // A rent future that stays live, so rent can route to its holder next round...
  const state = await readState(h)
  const routed = deedsOf(state, 'P1')
    .find((id) => state.deeds[id]?.group !== 'utility' && state.deeds[id]?.houses === 0) ?? ''
  await h.must({
    type: 'OriginateRentFuture', player: 'P1', deed: routed, holder: 'P2',
    startRound: state.round + 1, endRound: state.round + 4, price: 60,
  }, h.tokens.players.P1)
  const contract = (await readState(h)).futures[0]?.id ?? ''
  await h.must({
    type: 'SellRentFuture', player: 'P2', contract, to: 'P3', price: 65,
  }, h.tokens.players.P2)

  // ...and a second one, mortgaged out from under its holder, which owes a make-whole.
  const withSecond = await readState(h)
  const madeWhole = deedsOf(withSecond, 'P3')
    .find((id) => withSecond.deeds[id]?.group !== 'utility' && !withSecond.deeds[id]?.mortgaged) ?? ''
  await h.must({
    type: 'OriginateRentFuture', player: 'P3', deed: madeWhole, holder: 'P4',
    startRound: withSecond.round + 1, endRound: withSecond.round + 2, price: 40,
  }, h.tokens.players.P3)
  await h.must({ type: 'MortgageDeed', player: 'P3', deed: madeWhole }, h.tokens.players.P3)

  // Deed options: written, sold, exercised, and one left to lapse.
  const optionState = await readState(h)
  const optioned = deedsOf(optionState, 'P4')[0] ?? ''
  await h.must({
    type: 'WriteDeedOption', player: 'P4', deed: optioned, holder: 'P1',
    premium: 40, strike: 100, expiry: optionState.round + 3,
  }, h.tokens.players.P4)
  const option = (await readState(h)).options[0]?.id ?? ''
  await h.must({
    type: 'SellDeedOption', player: 'P1', contract: option, to: 'P2', price: 45,
  }, h.tokens.players.P1)
  await h.must({ type: 'ExerciseDeedOption', player: 'P2', contract: option }, h.tokens.players.P2)

  const lapsing = await readState(h)
  const toLapse = deedsOf(lapsing, 'P4')[0] ?? ''
  await h.must({
    type: 'WriteDeedOption', player: 'P4', deed: toLapse, holder: 'P1',
    premium: 10, strike: 900, expiry: lapsing.round,
  }, h.tokens.players.P4)

  return routed
}

async function sweepUnderworld(h: Harness): Promise<void> {
  await h.must({
    type: 'LaunchVenture', player: 'P1', venture: 'numbers', fundedFrom: 'clean',
  }, h.tokens.players.P1)
  await h.must({
    type: 'PlaySpeakeasy', player: 'P1', dice: [6, 6], fundedFrom: 'clean',
  }, h.tokens.players.P1)
  await h.must({ type: 'LaunderCash', player: 'P1', amount: 100 }, h.tokens.players.P1)
  // Bribery is paid in DIRTY cash, so only a player who has earned some can reach it.
  // `cancel-card` is the effect with no precondition.
  await h.must({
    type: 'Bribe', player: 'P1', effect: { kind: 'cancel-card' },
  }, h.tokens.players.P1)
  await h.must({ type: 'InsiderTrade', player: 'P3', fundedFrom: 'clean' }, h.tokens.players.P3)

  const state = await readState(h)
  const deck = state.decks[state.era]
  const head = deck.order.slice(deck.drawn, deck.drawn + 3)
  if (head.length === 3) {
    await h.must({
      type: 'ReorderDeck', era: state.era, player: 'P3',
      order: [head[2] as number, head[0] as number, head[1] as number],
    }, h.tokens.players.P3)
  }
}

async function sweepMovement(h: Harness, routedDeed: string): Promise<void> {
  await advanceTo(h, 'movement')
  const start = await readState(h)
  const toJail = diceToReach(start.players.P4.position, GO_TO_JAIL_SQUARE)
  if (toJail !== null) {
    await h.must({ type: 'roll-dice', player: 'P4', dice: toJail }, h.tokens.players.P4)
    await h.must({ type: 'roll-dice', player: 'P4', dice: [2, 5] }, h.tokens.players.P4)
  }
  const taxed = await readState(h)
  const toTax = diceToReach(taxed.players.P3.position, INCOME_TAX_SQUARE)
  if (toTax !== null) {
    await h.must({ type: 'roll-dice', player: 'P3', dice: toTax }, h.tokens.players.P3)
  }
  await runSettlement(h)
  await h.must({ type: 'advance-phase' })

  // Next round the rent future is live, so landing on its deed routes the rent to the
  // holder rather than the owner — the spec 19.2 attribution the pool waterfall reads.
  await advanceTo(h, 'movement')
  await landOn(h, 'P2', routedDeed)
  await runSettlement(h)
  await h.must({ type: 'advance-phase' })
}

/**
 * A forced liquidation with something worth taking: a developed colour group and an
 * outstanding option on the first lot. Buildings strip, the encumbrance is extinguished
 * and the holder refunded, then the bare deed is auctioned at the floor.
 */
async function sweepLiquidation(h: Harness): Promise<void> {
  await advanceTo(h, 'open')
  const target = (await readSync(h)).assist.P4.credit.liquidationQueue[0]
  if (target === undefined) return
  const group = (await readState(h)).deeds[target]?.group
  if (group === undefined) return

  const members = await assembleGroup(h, group, 'P4')
  for (const deed of members) {
    await h.must({ type: 'BuildHouse', player: 'P4', deed }, h.tokens.players.P4)
  }
  await h.must({
    type: 'WriteDeedOption', player: 'P4', deed: target, holder: 'P1',
    premium: 25, strike: 1000, expiry: (await readState(h)).round + 6,
  }, h.tokens.players.P4)

  const before = await readState(h)
  const base = borrowingBase(before, 'P4')
  if (base > 0) {
    await h.must({ type: 'DrawCredit', player: 'P4', amount: base }, h.tokens.players.P4)
  }
  // Breach by mortgaging a deed OUTSIDE the developed group — spec 19.6 forbids
  // mortgaging a developed group without selling the buildings first.
  const undeveloped = await readState(h)
  const breach = deedsOf(undeveloped, 'P4')
    .find((id) => undeveloped.deeds[id]?.group !== group && !undeveloped.deeds[id]?.mortgaged)
  if (breach !== undefined) {
    await h.must({ type: 'MortgageDeed', player: 'P4', deed: breach }, h.tokens.players.P4)
  }

  await playRound(h, SAFE_ROLLS)
  await playRound(h, SAFE_ROLLS)
  await advanceTo(h, 'open')

  for (let lot = 0; lot < 10; lot += 1) {
    const sync = await readSync(h)
    if (!sync.derived.awaitingLiquidation.includes('P4')) break
    const next = sync.assist.P4.credit.liquidationQueue[0]
    if (next === undefined) break
    await h.must({ type: 'SettleLiquidationLot', player: 'P4', deed: next, bids: [] })
  }
}

/**
 * Spec 19.8's obligation waterfall: an automatic charge a player cannot cover in clean
 * cash capitalises onto their credit line rather than failing. Reached by emptying a
 * player's pockets while they still hold the deeds the carrying cost is levied on.
 */
async function sweepCapitalisation(h: Harness): Promise<void> {
  await advanceTo(h, 'open')
  const state = await readState(h)
  const cash = state.players.P3.cleanCash
  if (cash > 0) {
    await h.must({
      type: 'TradeAssets', from: 'P3', to: 'P1',
      deedsFrom: [], deedsTo: [], cashFrom: cash, cashTo: 0, confirmedBy: ['P3', 'P1'],
    })
  }
  await playRound(h, SAFE_ROLLS)
}

/** After a write-down, salary rebuilds enough cash to pay some of the debt back. */
async function sweepDistressRepayment(h: Harness): Promise<void> {
  for (let round = 0; round < 2; round += 1) await playRound(h, SAFE_ROLLS)
  await advanceTo(h, 'open')
  const state = await readState(h)
  const owed = state.players.P4.distressedDebt
  const cash = state.players.P4.cleanCash
  if (owed > 0 && cash > 0) {
    await h.must({
      type: 'RepayDistressedDebt', player: 'P4', amount: Math.min(owed, cash),
    }, h.tokens.players.P4)
  }
}

export async function kitchenSink(h: Harness): Promise<void> {
  await runDraft(h)
  await advanceTo(h, 'open')
  await sweepCredit(h)
  const routed = await sweepContracts(h)
  await sweepUnderworld(h)
  await sweepMovement(h, routed)
  await sweepCapitalisation(h)
  await sweepLiquidation(h)
  await sweepDistressRepayment(h)
}

/**
 * A game played to round 24, where pools terminate by force and every tranche short of
 * face triggers its CDS while every tranche paid in full lets its CDS expire. Both
 * outcomes are scripted here because a swap that only ever triggers proves half a rule.
 */
export async function toTheEnd(h: Harness): Promise<void> {
  await runDraft(h)
  await advanceTo(h, 'open')

  for (const borrower of ['P2', 'P3', 'P4'] as const) {
    const state = await readState(h)
    const collateral = Object.values(state.deeds)
      .filter((d) => d.owner === borrower && !d.mortgaged && d.houses === 0)
      .map((d) => d.id)
      .slice(0, 1)
    await h.must({
      type: 'OriginatePeerLoan', lender: 'P1', borrower,
      principal: 120, ratePerRound: 0.05, termRounds: 4, collateral,
    }, h.tokens.players.P1)
  }
  const loans = (await readState(h)).loans.map((l) => l.id)
  await h.must({
    type: 'CreatePool', player: 'P1',
    assets: loans.map((id) => ({ kind: 'peer-loan' as const, id })),
    seniorFace: 40, mezzanineFace: 40,
  }, h.tokens.players.P1)

  const pool = (await readState(h)).pools[0]?.id ?? ''
  await h.must({
    type: 'SellTranche', player: 'P1', poolId: pool, tranche: 'senior', to: 'P2', price: 35,
  }, h.tokens.players.P1)
  await h.must({
    type: 'WriteSwap', buyer: 'P2', seller: 'P3',
    reference: { kind: 'tranche', poolId: pool, tranche: 'senior' },
    notional: 40, premiumPerRound: 2,
  }, h.tokens.players.P2)
  await h.must({
    type: 'WriteSwap', buyer: 'P4', seller: 'P2',
    reference: { kind: 'tranche', poolId: pool, tranche: 'equity' },
    notional: 40, premiumPerRound: 2,
  }, h.tokens.players.P4)

  for (let round = 1; round <= 24; round += 1) {
    /**
     * Audits begin in round 13, so Heat is bought exactly one round before it can be
     * punished, and the audit roll is scripted to LOSE. Without this the 24-round game
     * would report green while never once exercising the audit path — the failure mode
     * the E2E brief warns about, where a scenario silently stops reaching its feature.
     */
    if (round === 13) {
      await advanceTo(h, 'open')
      await h.must({
        type: 'PlaySpeakeasy', player: 'P1', dice: [3, 4], fundedFrom: 'clean',
      }, h.tokens.players.P1)
      await playRound(h, SAFE_ROLLS, { auditDice: { P1: [1, 1] } })
      continue
    }
    await playRound(h, SAFE_ROLLS)
  }
}
