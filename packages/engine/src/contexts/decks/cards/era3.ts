import type { Card } from '../effects.js'
import {
  DRAWER, EVERYONE, above, anyEntity, anyTarget, atLeast, auditNow, clause, collect,
  eachWhere, flat, grant, heatBy, hi, holderOf, least, lo, modify, most,
  nextOpenPhase, otherwise, payNoteHolders, payTreasury, sameTarget, sumOf,
} from './dsl.js'

const MOST_LEVERAGED = most('drawn-to-base-ratio', [hi('drawn-credit')], above('drawn-credit', 0))
const DIRTIEST = most('dirty-cash', [hi('heat')], above('dirty-cash', 0))
const RICHEST = most('net-worth', [hi('clean-cash')])
const POOREST_NW = least('net-worth', [lo('clean-cash')])
const BIGGEST_BORROWER = most(
  'peer-principal-borrowed', [hi('peer-max-rate')], above('peer-principal-borrowed', 0),
)
const MOST_DIRTY_ACTIONS = most('dirty-actions-this-game', [hi('heat')])
const FEWEST_DIRTY_ACTIONS = least('dirty-actions-this-game', [lo('heat')])
const CDS_WRITERS = eachWhere(above('cds-notional-written', 0))
const WORST_TRANCHE_HOLDER = holderOf({
  kind: 'tranche', by: 'rating-score', direction: 'min',
  tieBreak: [{ by: 'remaining-face', direction: 'min' }], attribute: 'holder',
})
const BEST_TRANCHE_ORIGINATOR = holderOf({
  kind: 'tranche', by: 'rating-score', direction: 'max',
  tieBreak: [{ by: 'pool-remaining-face', direction: 'max' }], attribute: 'pool-originator',
})
const BIGGEST_POOL_ORIGINATOR = holderOf({
  kind: 'pool', by: 'expected-cashflow', direction: 'max',
  tieBreak: [{ by: 'senior-plus-mezz-face', direction: 'max' }], attribute: 'originator',
})
const BIGGEST_POOL_EQUITY = {
  kind: 'pool', by: 'expected-cashflow', direction: 'max',
  tieBreak: [{ by: 'senior-face', direction: 'max' }], attribute: 'equity-holder',
} as const

export const ERA_III: readonly Card[] = [
  {
    id: 'E3-01', era: 3, title: 'Ratings Downgrade',
    flavour: 'The agency revises its assumptions. It does not revise its fees.',
    rules: 'For every outstanding CDO pool, the mezzanine tranche’s remaining face is '
      + 'reduced by 30%. Cash already distributed is unaffected; the reduction increases '
      + 'the residual available to equity in subsequent waterfalls. Pools with no '
      + 'mezzanine face remaining are skipped. If no CDO pools exist, every player collects '
      + '$200 from the Treasury.',
    targets: 'All mezzanine holders; benefits all equity holders',
    clauses: [
      clause([{ op: 'tranche-face', tranche: 'mezzanine', factor: 0.7 }], anyEntity('pool')),
      otherwise([collect(EVERYONE, flat(200))]),
    ],
  },
  {
    id: 'E3-02', era: 3, title: 'Liquidity Backstop',
    flavour: 'The window is opened for the worst paper in the market, which is the point.',
    rules: 'The holder of the outstanding tranche with the lowest displayed rating score '
      + 'collects $400 from the Treasury. Tie-break: lower rating score; then lower '
      + 'remaining face amount; then earlier turn order. If no tranches are outstanding, '
      + 'every player collects $200.',
    targets: 'The holder of the worst-rated tranche',
    clauses: [
      clause([collect(WORST_TRANCHE_HOLDER, flat(400))], anyEntity('tranche')),
      otherwise([collect(EVERYONE, flat(200))]),
    ],
  },
  {
    id: 'E3-03', era: 3, title: 'Early Audit Sweep',
    flavour: 'Selected files are pulled ahead of schedule.',
    rules: 'Every player whose current Heat is 5 or more is audited immediately, resolving '
      + 'exactly as a successful audit check: all dirty cash seized, a fine of $100 x Heat '
      + 'in clean cash, Heat resets to 0. Does not consume the normal audit check at the '
      + 'coming Settlement. If no player is at Heat 5 or more, no effect.',
    targets: 'All players; bites Heat 5+',
    clauses: [clause([auditNow(eachWhere(atLeast('heat', 5)))])],
  },
  {
    id: 'E3-04', era: 3, title: 'Compliance Consultant Retained',
    flavour: 'He is expensive, and he is worth it, and you should have hired him sooner.',
    rules: 'The drawer’s Heat reduces by 1 at no cost. In addition, during the next Open '
      + 'phase the drawer may pay $300 clean cash to reduce Heat by a further 2, to a '
      + 'minimum of 0. Declining costs nothing.',
    targets: 'Drawer',
    clauses: [clause([
      heatBy(DRAWER, -1),
      grant(DRAWER, {
        kind: 'compliance-consultant', capacity: 1, expiry: nextOpenPhase,
        params: { cost: 300, heatDelta: -2 },
      }),
    ])],
  },
  {
    id: 'E3-05', era: 3, title: 'Material Non-Public Information',
    flavour: 'You are told three things before they happen. You are told not to say who told you.',
    rules: 'The drawer privately views the top three cards of the current era deck and '
      + 'returns them in any order they choose. The engine records the chosen order via a '
      + 'DeckReordered event so replay stays exact. Drawer gains +1 Heat. The three cards '
      + 'are revealed to no other player and to no table view.',
    targets: 'Drawer',
    clauses: [clause([
      { op: 'deck-peek', target: DRAWER, count: 3 },
      heatBy(DRAWER, 1),
    ])],
  },
  {
    id: 'E3-06', era: 3, title: 'Credit Line Review',
    flavour: 'The lending base is recalculated on a stricter formula. Effective immediately.',
    rules: 'For the remainder of Era III, every player’s borrowing base is computed at 80% '
      + 'of the standard deed advance rate and 50% of the standard building advance rate '
      + '(effectively 40% of deed face and 25% of building cost). Reverts at the completion '
      + 'of the round 18 Settlement. Any margin call arising is flagged at the next '
      + 'Settlement with the standard cure window.',
    targets: 'All players',
    clauses: [clause([
      modify(EVERYONE, {
        effect: { kind: 'borrowing-base-formula', deedRateFactor: 0.8, buildingRateFactor: 0.5 },
        expiry: { kind: 'end-of-era' },
      }),
    ])],
  },
  {
    id: 'E3-07', era: 3, title: 'Covenant Waiver Negotiated',
    flavour: 'The lender agrees to look away once. Once.',
    rules: 'The most leveraged player receives one waiver token. The next time that player '
      + 'is flagged for a margin call, their cure deadline is extended by one full round '
      + 'instead of ending at the next Open phase, and the token is consumed. Expires '
      + 'unused at the completion of the round 18 Settlement, not transferable. Tie-break: '
      + 'larger drawn balance; then earlier turn order. If no player has a drawn balance, '
      + 'the drawer receives the token.',
    targets: 'The most leveraged player',
    clauses: [
      clause(
        [grant(MOST_LEVERAGED, {
          kind: 'margin-call-waiver', capacity: 1, expiry: { kind: 'end-of-era' },
          params: { extraRounds: 1 },
        })],
        anyTarget(MOST_LEVERAGED),
      ),
      otherwise([grant(DRAWER, {
        kind: 'margin-call-waiver', capacity: 1, expiry: { kind: 'end-of-era' },
        params: { extraRounds: 1 },
      })]),
    ],
  },
  {
    id: 'E3-08', era: 3, title: 'Refinancing Window',
    flavour: 'Balances retire at a discount for one week only.',
    rules: 'During the next Open phase, every player may retire drawn credit balance at a '
      + '10% discount: each $100 of clean cash applied retires $110 of drawn balance, up '
      + 'to a maximum of $600 of balance retired per player. The Treasury absorbs the '
      + 'difference. Unused capacity expires at the end of the next Open phase.',
    targets: 'All players',
    clauses: [clause([
      grant(EVERYONE, {
        kind: 'discounted-repayment', capacity: 600, expiry: nextOpenPhase, params: { discount: 0.1 },
      }),
    ])],
  },
  {
    id: 'E3-09', era: 3, title: 'Junior Capital Call',
    flavour: 'The equity is asked to support its own structure.',
    rules: 'The holder of the equity tranche of the pool with the largest expected '
      + 'cashflow pays $300 into that pool immediately, distributed through the standard '
      + 'waterfall at the next Settlement (senior and mezzanine paid first). Tie-break: '
      + 'larger senior face amount; then earlier turn order. If no CDO pools exist, every '
      + 'player collects $200 from the Treasury.',
    targets: 'The equity holder of the largest pool',
    clauses: [
      clause(
        [{ op: 'pool-inject', entity: BIGGEST_POOL_EQUITY, payer: 'equity-holder', amount: flat(300) }],
        anyEntity('pool'),
      ),
      otherwise([collect(EVERYONE, flat(200))]),
    ],
  },
  {
    id: 'E3-10', era: 3, title: 'Counterparty Doubt',
    flavour: 'Protection sellers are asked to show they can pay.',
    rules: 'Every player who has written at least one outstanding CDS must post an '
      + 'additional 15% of each written notional against their borrowing base, for the '
      + 'remainder of the game, bringing total posting to 45% of notional. Any margin call '
      + 'arising is flagged at the next Settlement with the standard cure window. If no '
      + 'CDS are outstanding, every player collects $200 from the Treasury.',
    targets: 'All CDS writers',
    clauses: [
      clause(
        [modify(CDS_WRITERS, {
          effect: { kind: 'cds-posting-addend', rate: 0.15 }, expiry: { kind: 'permanent' },
        })],
        anyEntity('written-cds'),
      ),
      otherwise([collect(EVERYONE, flat(200))]),
    ],
  },
  {
    id: 'E3-11', era: 3, title: 'Option Repricing',
    flavour: 'A drafting error in the standard form is discovered and, unusually, honoured.',
    rules: 'Every outstanding deed option’s strike price is reduced by $100, to a minimum '
      + 'of $0. Expiry rounds and premiums already paid are unchanged. If no deed options '
      + 'are outstanding, the drawer collects $300 from the Treasury.',
    targets: 'All option holders; harms all option writers',
    clauses: [
      clause([{ op: 'option-strike', delta: -100, floor: 0 }], anyEntity('deed-option')),
      otherwise([collect(DRAWER, flat(300))]),
    ],
  },
  {
    id: 'E3-12', era: 3, title: 'Traffic Study Published',
    flavour: 'The busiest corners of the city are, it emerges, the busiest corners of the city.',
    rules: 'For the whole of the next round, rent collected on Orange and Red properties is '
      + 'doubled. Rent futures over those properties capture the doubling. Reverts at the '
      + 'end of the next round.',
    targets: 'All players; benefits Orange and Red owners',
    clauses: [clause([modify(EVERYONE, {
      effect: { kind: 'rent-multiplier', factor: 2, groups: ['orange', 'red'] },
      expiry: { kind: 'end-of-round', offset: 1 },
    })])],
  },
  {
    id: 'E3-13', era: 3, title: 'Regulatory Fine',
    flavour: 'The source of the deposit could not be satisfactorily explained.',
    rules: 'The player holding the most dirty cash pays a fine of $300 in clean cash and '
      + 'gains +1 Heat. Dirty cash is not seized by this card. Tie-break: higher current '
      + 'Heat; then earlier turn order. If no player holds dirty cash, the drawer collects '
      + '$200 from the Treasury.',
    targets: 'The dirtiest player',
    clauses: [
      clause([payTreasury(DIRTIEST, flat(300)), heatBy(DIRTIEST, 1)], anyTarget(DIRTIEST)),
      otherwise([collect(DRAWER, flat(200))]),
    ],
  },
  {
    id: 'E3-14', era: 3, title: 'Voluntary Disclosure Programme',
    flavour: 'Come forward now and the penalty is merely arithmetic.',
    rules: 'During the next Open phase, every player may convert up to $400 of dirty cash '
      + 'to clean cash at a flat 40% haircut, at 0 Heat cost, and reduces Heat by 1 if they '
      + 'do so. Does not count against the once-per-Open-phase laundering limit. Expires '
      + 'at the end of the next Open phase.',
    targets: 'All players',
    clauses: [clause([
      grant(EVERYONE, {
        kind: 'dirty-amnesty', capacity: 400, expiry: nextOpenPhase,
        params: { haircut: 0.4, heatDelta: -1 },
      }),
    ])],
  },
  {
    id: 'E3-15', era: 3, title: 'The Agency Is Called to Testify',
    flavour: 'The rating was arithmetically correct. That was the difficulty.',
    rules: 'The originator of the outstanding tranche with the highest displayed rating '
      + 'score pays $400 to the Treasury. Tie-break: higher remaining face amount across '
      + 'that pool’s tranches; then earlier turn order. If no tranches are outstanding, '
      + 'every player collects $200 from the Treasury.',
    targets: 'The originator of the best-rated tranche',
    clauses: [
      clause([payTreasury(BEST_TRANCHE_ORIGINATOR, flat(400))], anyEntity('tranche')),
      otherwise([collect(EVERYONE, flat(200))]),
    ],
  },
  {
    id: 'E3-16', era: 3, title: 'Servicer Demands Cure',
    flavour: 'One additional payment, in advance, as a demonstration of good faith.',
    rules: 'The peer loan borrower with the largest total outstanding principal '
      + 'immediately pays one round’s interest on that principal to the note holder, in '
      + 'addition to the payment due at the coming Settlement. This is explicitly NOT a '
      + 'peer loan interest obligation for default purposes: a shortfall does not '
      + 'constitute default, transfer collateral or halve the borrowing base — it '
      + 'capitalises like any other card obligation. Tie-break: larger outstanding '
      + 'principal; then higher per-round rate; then earlier turn order. If no peer loans '
      + 'are outstanding, no effect.',
    targets: 'The largest peer borrower',
    clauses: [
      clause(
        [payNoteHolders(BIGGEST_BORROWER, sumOf([{ metric: 'peer-interest-due-per-round', rate: 1 }]))],
        anyTarget(BIGGEST_BORROWER),
      ),
      otherwise([]),
    ],
  },
  {
    id: 'E3-17', era: 3, title: 'Windfall Profits Levy',
    flavour: 'A one-off measure, as these always are.',
    rules: 'The player with the highest current net worth pays the Treasury 5% of that net '
      + 'worth, capped at $600. Net worth is computed at the moment of the draw. '
      + 'Tie-break: higher clean cash; then earlier turn order.',
    targets: 'The leading player',
    clauses: [clause([
      payTreasury(RICHEST, sumOf([{ metric: 'net-worth', rate: 0.05 }], 600)),
    ])],
  },
  {
    id: 'E3-18', era: 3, title: 'Distressed Fund Takes a Position',
    flavour: 'Someone is buying the worst assets in the city, cheaply.',
    rules: 'The player with the lowest current net worth collects $400 from the Treasury. '
      + 'If that player carries distressed debt, the $400 is applied to reduce the '
      + 'distressed debt balance first; any excess is paid as clean cash. Tie-break: lower '
      + 'clean cash; then earlier turn order.',
    targets: 'The trailing player',
    clauses: [clause([collect(POOREST_NW, flat(400), 'distressed-debt')])],
  },
  {
    id: 'E3-19', era: 3, title: 'Wiretap Transcripts Released',
    flavour: 'The transcripts name the frequent callers. They also name the abstainers, favourably.',
    rules: 'The player who has taken the most dirty actions this game gains +2 Heat. The '
      + 'player who has taken the fewest reduces Heat by 2, to a minimum of 0. Dirty '
      + 'actions = ventures launched + laundering transactions + briberies + insider '
      + 'trades, cumulative across the whole game. Tie-break for most: higher current '
      + 'Heat; then earlier turn order. For fewest: lower current Heat; then earlier turn '
      + 'order. If the same player is both, no effect.',
    targets: 'Two dynamically selected players',
    clauses: [
      clause([], sameTarget(MOST_DIRTY_ACTIONS, FEWEST_DIRTY_ACTIONS)),
      otherwise([heatBy(MOST_DIRTY_ACTIONS, 2), heatBy(FEWEST_DIRTY_ACTIONS, -2)]),
    ],
  },
  {
    id: 'E3-20', era: 3, title: 'Origination Fee Recognised',
    flavour: 'The structure is complete, and the fee is booked before the first payment is due.',
    rules: 'The originator of the CDO pool with the largest expected cashflow collects '
      + '$300 from the Treasury. Tie-break: larger total senior plus mezzanine face; then '
      + 'earlier turn order. If no CDO pools exist, every player collects $200.',
    targets: "The largest pool's originator",
    clauses: [
      clause([collect(BIGGEST_POOL_ORIGINATOR, flat(300))], anyEntity('pool')),
      otherwise([collect(EVERYONE, flat(200))]),
    ],
  },
]
