import {
  ECONOMY, MIN_AUDITABLE_HEAT,
  auditFine, auditProbability, borrowingBase, carryingCostFor, creditHeadroom,
  creditInterestDue, creditInterestRate, deedsOwnedBy, drawnCredit, expectedHitsPerRound,
  floorPercent, landingProbabilityOfDeed, launderHaircutBps, launderProceeds,
  liquidationPrice, liquidationQueue, liquidationRound, marginShortfall, mortgageImpact,
  netWorthBreakdown, peerLoanInterestDue, rentDue, unlockedInstruments, unmortgagedDeedCount,
  type ActiveVenture, type DiceRoll, type GameState, type Instrument, type Money,
  type MortgageImpact, type NetWorthBreakdown, type PlayerId,
} from '@leverage/engine'

/**
 * The assist panel: **the math, never the move** (spec section 14).
 *
 * Every number here is computed by an engine selector. Nothing in this file ranks
 * options, scores a decision or suggests an action — it closes the information gap
 * between a player who has played heavy economic games and one who has played Monopoly,
 * without closing the skill gap between them.
 *
 * The single most valuable line it produces is `ventures[].launderedValue`. Ventures
 * cost CLEAN cash and pay DIRTY cash, so a venture must return over 133% of its cost
 * merely to break even after the laundering haircut. Simulation put the gap between
 * correct and naive underworld play at roughly $1,290 — the largest skill cliff in the
 * economy — and it exists almost entirely because players read the dirty figure. Every
 * venture payoff below is reported at its laundered value first.
 */

/** Any pair summing to 7. Non-utility rent is dice-independent; utilities are not. */
const MEAN_DICE: DiceRoll = [3, 4]

export type WarningSeverity = 'info' | 'caution' | 'risk'

export interface Warning {
  /** Stable id, so the E2E suite can assert a specific warning really fired. */
  readonly id: string
  readonly severity: WarningSeverity
  readonly message: string
}

export interface DeedAssist {
  readonly deed: string
  readonly landingProbability: number
  readonly expectedHitsPerRound: number
  readonly rentAtCurrentDevelopment: Money
  readonly expectedRentPerRound: Money
  readonly liquidationPrice: Money
  readonly mortgage: MortgageImpact
}

export interface VentureAssist {
  readonly kind: ActiveVenture['kind']
  readonly cost: Money
  readonly rounds: number
  readonly heat: number
  /** What the venture pays, in DIRTY dollars. Never show this without the next field. */
  readonly expectedDirty: Money
  /** What that dirty cash is actually worth once laundered at the resulting Heat. */
  readonly launderedValue: Money
  /** `launderedValue - cost`. Negative means the venture loses money. */
  readonly netOfCost: Money
  readonly haircutBps: number
  readonly active: boolean
}

export interface CreditAssist {
  readonly borrowingBase: Money
  readonly drawn: Money
  readonly headroom: Money
  readonly interestRate: number
  readonly interestDueNextSettlement: Money
  readonly carryingCostNextSettlement: Money
  readonly distressedInterestNextSettlement: Money
  readonly marginShortfall: Money
  readonly underMarginCall: boolean
  readonly liquidationRound: number | null
  readonly liquidationQueue: readonly string[]
}

export interface AuditAssist {
  readonly heat: number
  readonly live: boolean
  readonly probability: number
  readonly fineIfAudited: Money
  readonly dirtyAtRisk: Money
  readonly minAuditableHeat: number
}

export interface LaunderAssist {
  readonly haircutBps: number
  readonly dirtyCash: Money
  readonly proceedsIfLaunderedInFull: Money
  readonly atCap: boolean
}

export interface PlayerAssist {
  readonly player: PlayerId
  readonly netWorth: NetWorthBreakdown
  readonly credit: CreditAssist
  readonly audit: AuditAssist
  readonly launder: LaunderAssist
  readonly ventures: readonly VentureAssist[]
  readonly deeds: readonly DeedAssist[]
  readonly unlocked: readonly Instrument[]
  readonly warnings: readonly Warning[]
}

function deedAssist(state: GameState, deed: string): DeedAssist {
  const rent = rentDue(state, deed, MEAN_DICE)
  const hits = expectedHitsPerRound(deed)
  const record = state.deeds[deed]
  return {
    deed,
    landingProbability: landingProbabilityOfDeed(deed),
    expectedHitsPerRound: hits,
    rentAtCurrentDevelopment: rent,
    expectedRentPerRound: Math.floor(rent * hits),
    liquidationPrice: record === undefined ? 0 : liquidationPrice(record),
    mortgage: mortgageImpact(state, deed),
  }
}

/** Expected rent CHARGED per round across every unmortgaged deed a player owns. */
function expectedRentChargedPerRound(state: GameState, player: PlayerId): number {
  return deedsOwnedBy(state, player)
    .filter((d) => !d.mortgaged)
    .reduce((total, d) => total + rentDue(state, d.id, MEAN_DICE) * expectedHitsPerRound(d.id), 0)
}

/** Expected LANDINGS per round across every unmortgaged deed a player owns. */
function expectedLandingsPerRound(state: GameState, player: PlayerId): number {
  return deedsOwnedBy(state, player)
    .filter((d) => !d.mortgaged)
    .reduce((total, d) => total + expectedHitsPerRound(d.id), 0)
}

/**
 * Expected DIRTY payout of a venture over its full term, before laundering.
 *
 * Escort and Chop Shop are rent-driven (spec 19.5), so their payoff is a function of the
 * player's own board traffic — a player with no deeds earns nothing from either, which
 * is precisely the trap the panel exists to expose.
 */
function expectedDirty(
  state: GameState, player: PlayerId, kind: ActiveVenture['kind'],
): Money {
  const spec = ECONOMY.VENTURES[kind]
  if (kind === 'numbers') return ECONOMY.VENTURES.numbers.perRound * spec.rounds
  if (kind === 'escort') {
    const share = expectedRentChargedPerRound(state, player) * ECONOMY.VENTURES.escort.rentShare
    return Math.floor(share * spec.rounds)
  }
  const landings = expectedLandingsPerRound(state, player)
  return Math.floor(landings * ECONOMY.VENTURES['chop-shop'].perLanding * spec.rounds)
}

function ventureAssist(
  state: GameState, player: PlayerId, kind: ActiveVenture['kind'],
): VentureAssist {
  const spec = ECONOMY.VENTURES[kind]
  const dirty = expectedDirty(state, player, kind)
  /**
   * Valued at the Heat the player will be carrying AFTER the launch, not before: the
   * launch itself adds Heat, and quoting the pre-launch haircut would overstate every
   * venture by exactly the amount the player is about to pay for it.
   */
  const heatAfter = state.players[player].heat + spec.heat
  const laundered = launderProceeds(dirty, heatAfter)
  return {
    kind,
    cost: spec.cost,
    rounds: spec.rounds,
    heat: spec.heat,
    expectedDirty: dirty,
    launderedValue: laundered,
    netOfCost: laundered - spec.cost,
    haircutBps: launderHaircutBps(heatAfter),
    active: state.players[player].ventures.some((v) => v.kind === kind),
  }
}

function creditAssist(state: GameState, player: PlayerId): CreditAssist {
  return {
    borrowingBase: borrowingBase(state, player),
    drawn: drawnCredit(state, player),
    headroom: creditHeadroom(state, player),
    interestRate: creditInterestRate(state, player),
    interestDueNextSettlement: creditInterestDue(state, player),
    carryingCostNextSettlement: carryingCostFor(state, player),
    distressedInterestNextSettlement:
      floorPercent(state.players[player].distressedDebt, ECONOMY.DISTRESSED_DEBT_RATE),
    marginShortfall: marginShortfall(state, player),
    underMarginCall: marginShortfall(state, player) > 0,
    liquidationRound: liquidationRound(state, player),
    liquidationQueue: liquidationQueue(state, player),
  }
}

function auditAssist(state: GameState, player: PlayerId): AuditAssist {
  const { heat, dirtyCash } = state.players[player]
  return {
    heat,
    live: state.round >= ECONOMY.AUDIT_FIRST_ROUND,
    probability: auditProbability(heat),
    fineIfAudited: auditFine(heat),
    dirtyAtRisk: dirtyCash,
    minAuditableHeat: MIN_AUDITABLE_HEAT,
  }
}

function launderAssist(state: GameState, player: PlayerId): LaunderAssist {
  const { heat, dirtyCash } = state.players[player]
  const haircutBps = launderHaircutBps(heat)
  return {
    haircutBps,
    dirtyCash,
    proceedsIfLaunderedInFull: launderProceeds(dirtyCash, heat),
    atCap: haircutBps >= Math.round(ECONOMY.LAUNDER_MAX_HAIRCUT * 10_000),
  }
}

function money(amount: Money): string {
  return `$${amount.toLocaleString('en-US')}`
}

/**
 * Hard warnings, spec section 14. Every one of these must be reachable in a real game —
 * a warning that can never fire is the UI equivalent of a function nobody calls, which
 * is the exact defect shape that escaped twenty-one engine reviews six times.
 * `tests/assist.test.ts` drives each id from a constructed state.
 */
function warnings(
  state: GameState, player: PlayerId, credit: CreditAssist,
  audit: AuditAssist, launder: LaunderAssist, ventures: readonly VentureAssist[],
): readonly Warning[] {
  const out: Warning[] = []
  const p = state.players[player]

  if (credit.underMarginCall) {
    out.push({
      id: 'margin-call-open', severity: 'risk',
      message: `Margin call: you are ${money(credit.marginShortfall)} over your borrowing base.`
        + (credit.liquidationRound === null
          ? '' : ` Forced liquidation begins in round ${credit.liquidationRound}.`),
    })
  }

  for (const deed of deedsOwnedBy(state, player)) {
    if (deed.mortgaged) continue
    const impact = mortgageImpact(state, deed.id)
    if (impact.marginCalled && !credit.underMarginCall) {
      out.push({
        id: `mortgage-triggers-margin-call:${deed.id}`, severity: 'risk',
        message: `Mortgaging ${deed.id} triggers a margin call: your base falls to `
          + `${money(impact.baseAfter)} against ${money(impact.drawn)} drawn.`,
      })
    }
    if (impact.makeWhole > 0) {
      out.push({
        id: `mortgage-owes-make-whole:${deed.id}`, severity: 'caution',
        message: `Mortgaging ${deed.id} owes the rent-future holder `
          + `${money(impact.makeWhole)} to make them whole.`,
      })
    }
  }

  if (audit.live && audit.heat >= MIN_AUDITABLE_HEAT) {
    out.push({
      id: 'audit-probability', severity: audit.probability >= 0.5 ? 'risk' : 'caution',
      message: `Your audit probability this round is ${Math.round(audit.probability * 100)}%, `
        + `with ${money(audit.dirtyAtRisk)} dirty cash at risk and a `
        + `${money(audit.fineIfAudited)} fine.`,
    })
  }

  if (launder.atCap && p.dirtyCash > 0) {
    out.push({
      id: 'launder-haircut-at-cap', severity: 'caution',
      message: `Your laundering haircut is capped at ${launder.haircutBps / 100}%. `
        + `${money(p.dirtyCash)} dirty converts to ${money(launder.proceedsIfLaunderedInFull)}.`,
    })
  }

  for (const venture of ventures) {
    if (venture.active || venture.netOfCost >= 0) continue
    out.push({
      id: `venture-loses-money:${venture.kind}`, severity: 'caution',
      message: `${venture.kind} costs ${money(venture.cost)} clean and returns about `
        + `${money(venture.launderedValue)} after laundering — a `
        + `${money(-venture.netOfCost)} loss at your traffic and Heat.`,
    })
  }

  const dueNext = credit.interestDueNextSettlement + credit.carryingCostNextSettlement
    + credit.distressedInterestNextSettlement
  if (dueNext > p.cleanCash) {
    out.push({
      id: 'settlement-exceeds-cash', severity: 'risk',
      message: `Settlement charges ${money(dueNext)} this round against `
        + `${money(p.cleanCash)} clean cash. The shortfall capitalises onto your credit line.`,
    })
  }

  if (p.distressedDebt > 0) {
    out.push({
      id: 'distressed-debt-accruing', severity: 'risk',
      message: `${money(p.distressedDebt)} of distressed debt is compounding at `
        + `${ECONOMY.DISTRESSED_DEBT_RATE * 100}% a round.`,
    })
  }

  for (const loan of state.loans) {
    if (loan.status !== 'active') continue
    if (loan.borrower === player && loan.maturesAtRound <= state.round + 1) {
      out.push({
        id: `peer-loan-maturing:${loan.id}`, severity: 'risk',
        message: `Peer loan ${loan.id} matures in round ${loan.maturesAtRound}: `
          + `${money(loan.outstanding)} falls due, and default forfeits the collateral.`,
      })
    }
    if (loan.borrower === player && peerLoanInterestDue(loan) > p.cleanCash) {
      out.push({
        id: `peer-loan-interest-exceeds-cash:${loan.id}`, severity: 'caution',
        message: `Interest of ${money(peerLoanInterestDue(loan))} on ${loan.id} `
          + `exceeds your clean cash.`,
      })
    }
  }

  for (const future of state.futures) {
    if (future.holder === player && future.endRound === state.round) {
      out.push({
        id: `rent-future-expiring:${future.id}`, severity: 'info',
        message: `Rent future ${future.id} expires at the end of this round.`,
      })
    }
  }

  for (const option of state.options) {
    if (option.holder === player && option.expiry === state.round) {
      out.push({
        id: `deed-option-expiring:${option.id}`, severity: 'caution',
        message: `Deed option ${option.id} lapses at the end of this round `
          + `unless you exercise it at a ${money(option.strike)} strike.`,
      })
    }
  }

  for (const swap of state.swaps) {
    if (swap.status !== 'active' || swap.seller !== player) continue
    if (swap.premiumPerRound > p.cleanCash) {
      out.push({
        id: `cds-premium-exceeds-cash:${swap.id}`, severity: 'caution',
        message: `The ${money(swap.premiumPerRound)} premium you collect on ${swap.id} `
          + `is less than the ${money(swap.notional)} a trigger would cost you, and your `
          + `clean cash would not cover it today.`,
      })
    }
  }

  if (unmortgagedDeedCount(state, player) === 0 && state.round > 1) {
    out.push({
      id: 'no-earning-deeds', severity: 'caution',
      message: 'You hold no unmortgaged deeds, so you charge no rent and earn no venture income.',
    })
  }

  return out
}

export function playerAssist(state: GameState, player: PlayerId): PlayerAssist {
  const credit = creditAssist(state, player)
  const audit = auditAssist(state, player)
  const launder = launderAssist(state, player)
  const ventures = (['escort', 'numbers', 'chop-shop'] as const)
    .map((kind) => ventureAssist(state, player, kind))
  return {
    player,
    netWorth: netWorthBreakdown(state, player),
    credit,
    audit,
    launder,
    ventures,
    deeds: deedsOwnedBy(state, player).map((d) => deedAssist(state, d.id)),
    /**
     * Straight from the engine. The action panel gates off THIS list and never off its
     * own table — a duplicated gating table was a Critical finding during engine
     * development and cost a fix round to consolidate.
     */
    unlocked: unlockedInstruments(state),
    warnings: warnings(state, player, credit, audit, launder, ventures),
  }
}

export function allAssist(state: GameState): Readonly<Record<PlayerId, PlayerAssist>> {
  return Object.fromEntries(
    state.config.turnOrder.map((player) => [player, playerAssist(state, player)]),
  ) as Record<PlayerId, PlayerAssist>
}
