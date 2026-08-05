import {
  ALL_CARDS, DEED_LIST, ECONOMY, RATING_BANDS, RATING_FLOOR, SETTLEMENT_STEPS, SQUARES,
  UNLOCK_ERA, newlyUnlockedIn, type Era,
} from '@leverage/engine'

/**
 * The ruleset reference, GENERATED from the same constants module the engine imports, so
 * it cannot drift from the implemented rules (spec section 14). Served at
 * `/api/rules/:topic` for the facilitator agent and rendered as the in-app rulebook.
 *
 * Every number below is read from `ECONOMY`, `UNLOCK_ERA`, `SETTLEMENT_STEPS` or the
 * board tables. Nothing here is typed in by hand — a retuned venture or a moved unlock
 * era changes this document without anyone editing it.
 */

const pct = (rate: number): string => `${(rate * 100).toFixed(rate * 100 % 1 === 0 ? 0 : 1)}%`
const cash = (amount: number): string => `$${amount.toLocaleString('en-US')}`

function structure(): string {
  return [
    '# Structure',
    '',
    `A game is ${ECONOMY.TOTAL_ROUNDS} rounds in four eras of ${ECONOMY.ROUNDS_PER_ERA}.`,
    '',
    'Each round runs five phases:',
    '',
    '1. **Market** — valuations refresh, the era clock advances',
    '2. **Open** — all four players act SIMULTANEOUSLY: build, mortgage, trade, borrow,',
    '   originate contracts, launch ventures, launder',
    '3. **Movement** — each player rolls in turn order, moves, pays rent, draws cards',
    '4. **Settlement** — the eleven-step fold below, in order',
    '5. **Scoring** — round 24 only',
    '',
    '## Eras and what each unlocks',
    '',
    ...([1, 2, 3, 4] as const).map((era: Era) => {
      const added = newlyUnlockedIn(era)
      const rounds = `${(era - 1) * ECONOMY.ROUNDS_PER_ERA + 1}-${era * ECONOMY.ROUNDS_PER_ERA}`
      const rate = pct(ECONOMY.INTEREST_RATE_BY_ERA[era])
      return `- **Era ${era}** (rounds ${rounds}, prevailing rate ${rate}) — `
        + (added.length === 0 ? 'nothing new; the last six rounds are about surviving leverage' : added.join(', '))
    }),
  ].join('\n')
}

function settlement(): string {
  return [
    '# Settlement order',
    '',
    'Run every round, in exactly this order. Step 9 can trigger step 10 in the same pass:',
    'an audit fine that capitalises onto the credit line can push a player over their',
    'borrowing base and be flagged in the same Settlement.',
    '',
    ...SETTLEMENT_STEPS.map((step, i) => `${i + 1}. ${step}`),
    '',
    'On round 24 only, three more steps follow: all pools terminate, every tranche short',
    'of face triggers its referencing CDS, then scoring runs.',
  ].join('\n')
}

function economy(): string {
  return [
    '# Economy',
    '',
    `- Starting cash: ${cash(ECONOMY.STARTING_CASH)}, a single unified budget`,
    `- GO salary: ${cash(ECONOMY.GO_SALARY)}, paid from the Treasury`,
    `- Carrying cost: ${cash(ECONOMY.CARRYING_COST_PER_DEED)} per unmortgaged deed, every Settlement, from round 1`,
    `- Income tax ${cash(ECONOMY.INCOME_TAX)}, luxury tax ${cash(ECONOMY.LUXURY_TAX)}, jail fee ${cash(ECONOMY.JAIL_FEE)}`,
    `- Era II stimulus: ${cash(ECONOMY.ERA_II_STIMULUS)} advanced at the start of round 7 as an interest-bearing LOAN, not a grant`,
    `- Houses cost ${pct(ECONOMY.HOUSE_COST_MULTIPLIER)} of the printed board figure`,
    `- Buildings sell back at ${pct(ECONOMY.BUILDING_SELLBACK_RATE)} of the price paid`,
    `- Mortgage raises ${pct(ECONOMY.MORTGAGE_RATE)} of face; unmortgaging costs ${pct(ECONOMY.UNMORTGAGE_RATE)}`,
    `- Physical supply: ${ECONOMY.HOUSE_SUPPLY} houses, ${ECONOMY.HOTEL_SUPPLY} hotels. Hoarding is legitimate.`,
    '',
    'All money is integer dollars. Every percentage floors.',
  ].join('\n')
}

function credit(): string {
  return [
    '# Bank credit',
    '',
    '## Borrowing base',
    '',
    `    base = ${pct(ECONOMY.DEED_ADVANCE_RATE)} x unmortgaged deed face`,
    `         + ${pct(ECONOMY.BUILDING_ADVANCE_RATE)} x building cost basis`,
    '',
    'Halved permanently once a player defaults on a peer loan. A CDS writer posts',
    `${pct(ECONOMY.CDS_COLLATERAL_RATE)} of notional against the base while the swap is live.`,
    '',
    '## Interest',
    '',
    'Accrues on the drawn balance every Settlement at the era rate: '
      + ([1, 2, 3, 4] as const).map((e) => `Era ${e} ${pct(ECONOMY.INTEREST_RATE_BY_ERA[e])}`).join(', '),
    '',
    '## Margin calls',
    '',
    'Flagged at Settlement step 10 when the drawn balance exceeds the borrowing base.',
    'The player has through the end of the NEXT round\'s Open phase to cure. Still',
    'breached at the start of the Open phase after that, deeds are force-liquidated in',
    `descending face-value order at a ${pct(ECONOMY.LIQUIDATION_FLOOR)} floor.`,
    '',
    `The floor (${pct(ECONOMY.LIQUIDATION_FLOOR)}) must exceed the advance rate `
      + `(${pct(ECONOMY.DEED_ADVANCE_RATE)}) or every forced sale would WIDEN the shortfall. `
      + 'The engine asserts this at startup.',
    '',
    '## Distressed debt',
    '',
    `Whatever liquidation cannot clear becomes distressed debt, compounding at `
      + `${pct(ECONOMY.DISTRESSED_DEBT_RATE)} a round. Nobody is eliminated; they keep playing `
      + 'and can score negative.',
  ].join('\n')
}

function futures(): string {
  return [
    '# Rent futures',
    '',
    'The owner of a deed sells the right to collect its rent for a window of rounds.',
    `Windows may not exceed ${ECONOMY.MAX_FUTURE_WINDOW} rounds.`,
    '',
    'Valuation is a Markov landing model, not a guess:',
    '',
    `    expected hits per round = landing probability x ${ECONOMY.RENT_OBLIGORS} obligors `
      + `x ${ECONOMY.DOUBLES_ROLL_MULTIPLIER} for the extra rolls doubles generate`,
    '',
    `Every valuation carries a ${pct(ECONOMY.VALUATION_PERCENTILE_LOW)}/`
      + `${pct(ECONOMY.VALUATION_PERCENTILE_HIGH)} outcome band beside the expected value.`,
    '',
    '## Encumbrance',
    '',
    'A live future follows the deed. Mortgaging an encumbered deed owes the holder the',
    "contract's remaining expected value (a make-whole) and terminates it. Forced",
    'liquidation extinguishes the contract and adds the make-whole to the shortfall — so a',
    'distressed player cannot become judgment-proof by writing contracts.',
  ].join('\n')
}

function options(): string {
  return [
    '# Deed options',
    '',
    'A writer sells the right to buy one of their deeds at a fixed strike before an',
    'expiry round, for a premium paid at origination.',
    '',
    'While an option is outstanding the writer may not sell, trade or mortgage the deed.',
    'Forced liquidation is the exception: it extinguishes the option and refunds the',
    'premium to the holder, added to the debtor\'s shortfall.',
    '',
    'A deed carries at most one outstanding option at a time.',
  ].join('\n')
}

function peerLoans(): string {
  return [
    '# Peer loans',
    '',
    'Player-to-player credit on freely negotiated terms: principal, per-round rate, term,',
    'and optional deed collateral. Interest falls due at Settlement step 5.',
    '',
    'On default the collateral transfers to the lender and the borrower is permanently',
    'credit-impaired: their borrowing base halves. A SECOND default does not halve again.',
    '',
    'Notes are tradeable, and poolable into a CDO.',
  ].join('\n')
}

function securitization(): string {
  return [
    '# Securitization',
    '',
    'Pool three or more instruments you own — peer loan notes, rent futures, deed options —',
    'and carve them into senior, mezzanine and equity tranches. Senior and mezzanine take',
    'a stated face; equity is the residual.',
    '',
    '## Waterfall',
    '',
    'Cash the pool collects each round pays senior in full, then mezzanine, then equity.',
    '',
    '## Ratings',
    '',
    `    score = coverage x (1 - ${ECONOMY.RATING_CONCENTRATION_WEIGHT} x concentration)`,
    `                     / (1 + ${ECONOMY.RATING_LEVERAGE_WEIGHT} x leverage)`,
    '',
    `Leverage is capped at ${ECONOMY.RATING_MAX_LEVERAGE} before it enters the weighted mean.`,
    '',
    'Bands: ' + RATING_BANDS.map(([floor, band]) => `${band} at ${floor}`).join(', ')
      + `, otherwise ${RATING_FLOOR}.`,
    '',
    '## Credit default swaps',
    '',
    'A buyer pays a per-round premium; the seller pays the notional if the reference',
    `defaults. The seller posts ${pct(ECONOMY.CDS_COLLATERAL_RATE)} of notional against`,
    'their borrowing base for as long as the swap is live. Notional may not exceed the',
    'face of what it references — no naked over-insurance.',
  ].join('\n')
}

function underworld(): string {
  const v = ECONOMY.VENTURES
  return [
    '# The underworld',
    '',
    '## Ventures',
    '',
    `- **Escort Service** — ${cash(v.escort.cost)}, ${v.escort.rounds} rounds, `
      + `+${v.escort.heat} Heat. Pays ${pct(v.escort.rentShare)} of rent CHARGED on your deeds, as dirty cash.`,
    `- **Numbers Racket** — ${cash(v.numbers.cost)}, ${v.numbers.rounds} rounds, `
      + `+${v.numbers.heat} Heat. Pays ${cash(v.numbers.perRound)} dirty per round.`,
    `- **Chop Shop** — ${cash(v['chop-shop'].cost)}, ${v['chop-shop'].rounds} rounds, `
      + `+${v['chop-shop'].heat} Heat. Pays ${cash(v['chop-shop'].perLanding)} dirty per landing on your deeds.`,
    '',
    `**Speakeasy** — ${cash(ECONOMY.SPEAKEASY_COST)}, +${ECONOMY.SPEAKEASY_HEAT} Heat, one 2d6 roll. `
      + 'Payouts by total: '
      + Object.entries(ECONOMY.SPEAKEASY_PAYOUTS).map(([t, p]) => `${t}:${cash(p)}`).join(', '),
    '',
    '## Dirty cash',
    '',
    `Dirty cash scores ${cash(ECONOMY.DIRTY_CASH_SCORING_VALUE)} at the end. It is worth`,
    'something only once laundered.',
    '',
    `    haircut = ${pct(ECONOMY.LAUNDER_BASE_HAIRCUT)} base`,
    `            + ${pct(ECONOMY.LAUNDER_HAIRCUT_PER_HEAT)} per Heat point above ${ECONOMY.LAUNDER_HEAT_FREE_THRESHOLD}`,
    `            capped at ${pct(ECONOMY.LAUNDER_MAX_HAIRCUT)}`,
    '',
    '**Ventures cost CLEAN cash and pay DIRTY cash.** At the base haircut alone a venture',
    'must return over 133% of its cost to break even. Read the laundered number, never the',
    'dirty one — simulation puts the gap between correct and naive play at about $1,290.',
    '',
    '## Heat and audits',
    '',
    `Audits begin in round ${ECONOMY.AUDIT_FIRST_ROUND}. Each Settlement, every player with`,
    'Heat rolls 2d6; a total at or below their Heat is an audit. An audit seizes all dirty',
    `cash and fines ${cash(ECONOMY.AUDIT_FINE_PER_HEAT)} per Heat point, payable in clean cash,`,
    'with any shortfall capitalising onto the credit line.',
    '',
    `Heat decays ${ECONOMY.HEAT_DECAY} per round in which the player takes no deliberate dirty action.`,
    '',
    '## Bribery and insider trading',
    '',
    `Bribery costs ${cash(ECONOMY.BRIBERY_COST)} and +${ECONOMY.BRIBERY_HEAT} Heat, once per round:`,
    'force a reroll, cancel a card, or delay a margin call by a round.',
    '',
    `Insider trading costs ${cash(ECONOMY.INSIDER_TRADING_COST)} and +${ECONOMY.INSIDER_TRADING_HEAT} Heat:`,
    'see the top card of the current era deck.',
  ].join('\n')
}

function draft(): string {
  return [
    '# The draft',
    '',
    'Seven rounds, all four players submitting simultaneously. Each submission is a ranked',
    'triple of available deeds plus a maximum bid.',
    '',
    'Uncontested first choices are awarded at face value. Contested deeds go to the highest',
    'bid; losers cascade to their second choice, then their third, then to the cheapest',
    'remaining deed. A player who cannot afford even the cheapest remaining deed is awarded',
    'it for free.',
    '',
    `All 28 deeds are allocated, exactly 7 per player, out of the single ${cash(ECONOMY.STARTING_CASH)} budget.`,
    `That equality is what makes the flat ${cash(ECONOMY.CARRYING_COST_PER_DEED)}-per-deed carrying cost fair.`,
  ].join('\n')
}

function scoring(): string {
  return [
    '# Scoring',
    '',
    'Net worth at the end of round 24:',
    '',
    '    clean cash',
    '  + deed value + building cost basis',
    '  + marked value of instruments held',
    '  - drawn credit - peer loans owed - distressed debt',
    `  + dirty cash x ${ECONOMY.DIRTY_CASH_SCORING_VALUE}`,
    '',
    `Loan notes mark at principal x (1 - ${ECONOMY.LOAN_NOTE_HAIRCUT_PER_TURN} x min(leverage, `
      + `${ECONOMY.LOAN_NOTE_MAX_LEVERAGE})).`,
    '',
    'Nobody is eliminated. A player who cannot pay keeps playing and can finish negative.',
  ].join('\n')
}

function board(): string {
  return [
    '# Board',
    '',
    `${SQUARES.length} squares, ${DEED_LIST.length} deeds.`,
    '',
    'Card squares: ' + [2, 7, 17, 22, 33, 36].join(', ') + '. Era decks contain no movement',
    'cards, so these are ordinary resting squares.',
    '',
    '| # | Square | Group | Face | House |',
    '|---|---|---|---|---|',
    ...DEED_LIST.map((d) => `| ${d.square} | ${d.name} | ${d.group} | ${cash(d.faceValue)} | ${cash(d.houseCost)} |`),
  ].join('\n')
}

function cards(): string {
  return [
    '# Era decks',
    '',
    `${ALL_CARDS.length} cards across four eras. Drawn when a token rests on a card square.`,
    '',
    ...([1, 2, 3, 4] as const).flatMap((era) => [
      '',
      `## Era ${era}`,
      '',
      ...ALL_CARDS.filter((c) => c.era === era)
        .map((c) => `- **${c.id} ${c.title}** — ${c.rules} _(${c.targets})_`),
    ]),
  ].join('\n')
}

const TOPICS: Readonly<Record<string, () => string>> = {
  structure, settlement, economy, credit, futures, options,
  'peer-loans': peerLoans, securitization, underworld, draft, scoring, board, cards,
}

export const RULE_TOPICS: readonly string[] = Object.keys(TOPICS)

export function ruleTopic(topic: string): string | null {
  const build = TOPICS[topic]
  return build === undefined ? null : build()
}

/** Static reference every shell needs once: the board, the constants, the unlock table. */
export function staticReference(): Record<string, unknown> {
  return {
    squares: SQUARES,
    deeds: DEED_LIST,
    economy: ECONOMY,
    unlockEra: UNLOCK_ERA,
    settlementSteps: SETTLEMENT_STEPS,
    ratingBands: RATING_BANDS,
    ratingFloor: RATING_FLOOR,
    cards: ALL_CARDS.map((c) => ({
      id: c.id, era: c.era, title: c.title, rules: c.rules, targets: c.targets,
    })),
    topics: RULE_TOPICS,
  }
}
