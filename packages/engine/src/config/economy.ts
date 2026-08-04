import type { Era, Instrument, Money } from '../core/types.js'
import { assertEconomyInvariants } from './assertions.js'

export const ECONOMY = {
  /** Single unified budget. The draft spends from it. Spec section 4. */
  STARTING_CASH: 2500 as Money,

  /** Paid on passing or landing on GO, from the Treasury. */
  GO_SALARY: 350 as Money,

  /** Per unmortgaged deed, per player, every Settlement, from round 1. */
  CARRYING_COST_PER_DEED: 8 as Money,

  /** Advanced at the start of round 7 as an interest-bearing loan, not a grant. */
  ERA_II_STIMULUS: 300 as Money,

  /**
   * Borrowing base = deed face x this + building cost x BUILDING_ADVANCE_RATE.
   * BUILDING_ADVANCE_RATE must never exceed BUILDING_SELLBACK_RATE, or stripping a
   * developed deed during liquidation widens the shortfall. Asserted at startup.
   */
  DEED_ADVANCE_RATE: 0.75,
  BUILDING_ADVANCE_RATE: 0.5,

  /** Houses cost 90% of standard, offsetting carrying-cost development suppression. */
  HOUSE_COST_MULTIPLIER: 0.9,
  /** Buildings sell back to the bank at half the price paid. */
  BUILDING_SELLBACK_RATE: 0.5,

  /** Prevailing per-round interest on drawn credit, by era. */
  INTEREST_RATE_BY_ERA: { 1: 0.05, 2: 0.06, 3: 0.08, 4: 0.12 } as Record<Era, number>,

  /** Accrues on any shortfall a player cannot meet after credit and liquidation. */
  DISTRESSED_DEBT_RATE: 0.15,

  /**
   * Floor price in a forced liquidation, as a fraction of deed face value.
   * MUST be strictly greater than DEED_ADVANCE_RATE or liquidation diverges:
   * a sale raises floor x face but removes advance x face from the borrowing
   * base, so a floor below the advance rate widens the shortfall on every sale.
   * Asserted at startup. See spec section 5.
   */
  LIQUIDATION_FLOOR: 0.8,

  /** Standard Monopoly mortgage economics. */
  MORTGAGE_RATE: 0.5,
  UNMORTGAGE_RATE: 0.55,

  /** Flat taxes, paid to the Treasury. */
  INCOME_TAX: 200 as Money,
  LUXURY_TAX: 100 as Money,
  JAIL_FEE: 50 as Money,

  /** Physical component scarcity. Hoarding is a legitimate strategy. */
  HOUSE_SUPPLY: 32,
  HOTEL_SUPPLY: 12,

  /** Laundering: base haircut, extra per Heat point above the free threshold, and cap. */
  LAUNDER_BASE_HAIRCUT: 0.25,
  LAUNDER_HAIRCUT_PER_HEAT: 0.05,
  LAUNDER_HEAT_FREE_THRESHOLD: 3,
  LAUNDER_MAX_HAIRCUT: 0.6,

  /** Audits begin in Era III. Fine is this multiplied by Heat. */
  AUDIT_FIRST_ROUND: 13 as RoundNumberLiteral,
  AUDIT_FINE_PER_HEAT: 100 as Money,

  /** A CDS writer must post this fraction of notional against their borrowing base. */
  CDS_COLLATERAL_RATE: 0.3,

  /** Ratings formula, spec section 8:
   *  score = coverage * (1 - RATING_CONCENTRATION_WEIGHT * concentration)
   *                   / (1 + RATING_LEVERAGE_WEIGHT * leverage) */
  RATING_CONCENTRATION_WEIGHT: 0.25,
  RATING_LEVERAGE_WEIGHT: 0.1,
  /** Borrower leverage is capped at this before it enters the weighted mean. */
  RATING_MAX_LEVERAGE: 5,

  /** Rent future windows may not exceed this many rounds. */
  MAX_FUTURE_WINDOW: 8,

  /**
   * Players who can owe rent on a deed: all four minus its owner, who owes
   * nothing. Spec 19.2. Used ONLY by `markets`' valuation kernel to convert a
   * raw per-roll landing probability into expected rent hits per round —
   * `board`'s `landingProbability` deliberately returns the unconverted
   * figure, so this factor is applied in exactly one place.
   */
  RENT_OBLIGORS: 3,

  /**
   * Correction for the extra rolls doubles generate, applied alongside
   * RENT_OBLIGORS to convert per-roll probability to expected hits per round.
   * Spec 19.2 fixes it at 1.19. Mirrors `config/board.ts`'s own
   * `DOUBLES_ROLL_MULTIPLIER` (used there for board's traffic-display
   * helpers) — kept as a separate literal here rather than imported, since
   * `config/board.ts` already imports `ECONOMY` and the reverse import would
   * cycle the two config modules.
   */
  DOUBLES_ROLL_MULTIPLIER: 1.19,

  /** Outcome band displayed beside expected value on every valuation. Spec section 6. */
  VALUATION_PERCENTILE_LOW: 0.1,
  VALUATION_PERCENTILE_HIGH: 0.9,

  /** Hard game length. Simulation shows 36 rounds produces 82% bankruptcy. */
  TOTAL_ROUNDS: 24,
  ROUNDS_PER_ERA: 6,

  /**
   * The venture table. Keyed by the same literals the events use, so retuning a
   * venture is a one-line edit. These are the values most likely to move after
   * the first playtest — Escort was already recut once from $300/40% to $150/60%
   * after simulation showed it was never worth launching.
   */
  VENTURES: {
    escort: { cost: 150 as Money, rounds: 4, heat: 2, rentShare: 0.6 },
    numbers: { cost: 150 as Money, rounds: 6, heat: 2, perRound: 60 as Money },
    'chop-shop': { cost: 250 as Money, rounds: 4, heat: 3, perLanding: 150 as Money },
  },
  SPEAKEASY_COST: 250 as Money,
  SPEAKEASY_HEAT: 2,
  /** Indexed by 2d6 total, 2-12. Expected payout $294 against a $250 cost. */
  SPEAKEASY_PAYOUTS: {
    2: 0, 3: 100, 4: 100, 5: 100, 6: 250, 7: 250,
    8: 250, 9: 500, 10: 500, 11: 500, 12: 1200,
  } as Record<number, Money>,

  BRIBERY_COST: 200 as Money,
  BRIBERY_HEAT: 1,
  INSIDER_TRADING_COST: 100 as Money,
  INSIDER_TRADING_HEAT: 1,
  LAUNDER_HEAT: 1,
  HEAT_DECAY: 1,

  /**
   * Instrument gating, ignored when config.unlockMode is 'all'. Single source
   * of truth: the session context reads this rather than keeping its own
   * copy, so a new instrument or a retuned unlock era only needs one edit.
   * Era IV deliberately unlocks nothing — the last six rounds are about
   * surviving existing leverage, not learning a new instrument.
   */
  /**
   * Loan note mark, spec section 12:
   *   principal x (1 - LOAN_NOTE_HAIRCUT_PER_TURN x min(leverage, LOAN_NOTE_MAX_LEVERAGE))
   * A note against an unlevered borrower marks at par; against a borrower at 4x or
   * worse it marks at 40% of principal.
   */
  LOAN_NOTE_HAIRCUT_PER_TURN: 0.15,
  /** Deliberately below RATING_MAX_LEVERAGE (5): spec section 8 caps leverage at 5
   * inside the ratings formula and spec section 12 caps it at 4 inside the note mark.
   * Two rules, two caps, two constants — not a typo. */
  LOAN_NOTE_MAX_LEVERAGE: 4,

  /** Spec section 10: dirty cash is worth exactly this at final scoring. */
  DIRTY_CASH_SCORING_VALUE: 0,

  UNLOCK_ERA: {
    trade: 1,
    building: 1,
    mortgage: 1,
    'credit-line': 1,
    'peer-loan': 2,
    'rent-future': 2,
    venture: 2,
    laundering: 2,
    bribery: 2,
    cdo: 3,
    cds: 3,
    'deed-option': 3,
    'insider-trading': 3,
  } as Readonly<Record<Instrument, Era>>,
} as const

type RoundNumberLiteral = number

/**
 * Task 20 replaces the single inline LIQUIDATION_FLOOR check Task 9 left here with
 * `assertEconomyInvariants` from `./assertions.js`, which asserts the same
 * divergent-liquidation guard alongside three siblings (the building advance/sellback
 * pair, the note-mark/ratings leverage cap pair, and the whole-era round split) so all
 * four convergence properties live together and none can be tuned in isolation. A
 * module-level call is permitted here: it is deterministic, performs no I/O, and reads
 * no clock, so it does not weaken the engine's purity guarantees.
 */
assertEconomyInvariants()

/** Ratings bands, evaluated highest first. Spec section 8. */
export const RATING_BANDS: readonly (readonly [number, string])[] = [
  [2.2, 'AAA'], [1.5, 'AA'], [1.2, 'A'],
  [1.0, 'BBB'], [0.8, 'BB'], [0.6, 'B'],
] as const
export const RATING_FLOOR = 'CCC'
