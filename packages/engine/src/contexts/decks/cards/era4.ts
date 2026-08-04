import type { Card } from '../effects.js'
import {
  EVERYONE, above, allOf, anyEntity, anyTarget, atLeast, atMost, auditNow, branch,
  clause, collect, dirtyOut, eachWhere, flat, forever, forgiveDebt, hi, least, lo,
  marginFlag, modify, most, nextOpenPhase, nextSettlement, otherwise, payTreasury, per,
  sumOf, topN,
} from './dsl.js'

const MOST_LEVERAGED = most('drawn-to-base-ratio', [hi('drawn-credit')], above('drawn-credit', 0))
const MOST_DRAWN = most('drawn-credit', [hi('drawn-to-base-ratio')], above('drawn-credit', 0))
const DIRTIEST = most('dirty-cash', [hi('heat')], above('dirty-cash', 0))
const HOTTEST = most('heat', [lo('net-worth')], above('heat', 0))
const MOST_DISTRESSED = most('distressed-debt', [lo('net-worth')], above('distressed-debt', 0))
const POOREST_NW = least('net-worth', [lo('clean-cash')])
const RICHEST = most('net-worth', [hi('deed-face-value')])
const MOST_OBLIGATED = most('total-obligations', [hi('drawn-credit')], above('total-obligations', 0))
const MOST_RENT_THIS_ERA = most(
  'rent-received-this-era', [hi('deed-face-value')], above('rent-received-this-era', 0),
)
const WEAKEST_POOL = {
  kind: 'pool', by: 'coverage-ratio', direction: 'min',
  tieBreak: [{ by: 'senior-face', direction: 'max' }], attribute: 'pool',
} as const

export const ERA_IV: readonly Card[] = [
  {
    id: 'E4-01', era: 4, title: 'Covenant Breach',
    flavour: 'A technical default. The technicality is that you promised not to.',
    rules: 'The most leveraged player is flagged for a margin call immediately, whether or '
      + 'not their drawn balance currently exceeds their borrowing base — cure at 80% of '
      + 'borrowing base by the end of the next Open phase or force-liquidation runs. '
      + '"Most leveraged" = highest drawn balance divided by borrowing base, among players '
      + 'with a drawn balance above $0. Tie-break: larger drawn balance; then earlier turn '
      + 'order. If no player has a drawn balance, no effect.',
    targets: 'The most leveraged player',
    clauses: [
      clause([marginFlag(MOST_LEVERAGED, 0.8, 'immediately')], anyTarget(MOST_LEVERAGED)),
      otherwise([]),
    ],
  },
  {
    id: 'E4-02', era: 4, title: 'Audit Sweep',
    flavour: 'The accounts are examined. Forty per cent is not returned.',
    rules: 'The player holding the most dirty cash forfeits 40% of it. Heat is unchanged '
      + 'and this does not consume the round’s normal audit check. Tie-break: higher '
      + 'current Heat; then earlier turn order. If no player holds dirty cash, the player '
      + 'with the highest Heat pays $300 in clean cash to the Treasury instead, tie-broken '
      + 'by lower net worth then earlier turn order; if all players are at Heat 0, no effect.',
    targets: 'The dirtiest player',
    clauses: [
      clause([dirtyOut(DIRTIEST, per('dirty-cash', 0.4))], anyTarget(DIRTIEST)),
      clause([payTreasury(HOTTEST, flat(300))], anyTarget(HOTTEST)),
      otherwise([]),
    ],
  },
  {
    id: 'E4-03', era: 4, title: 'Downgrade Cascade',
    flavour: 'Every structure in the market is remarked at once, which is how it always happens.',
    rules: 'For every outstanding CDO pool, the senior tranche’s remaining face is reduced '
      + 'by 15% and the mezzanine tranche’s remaining face by 40%. Cash already '
      + 'distributed is unaffected; both reductions increase the residual available to '
      + 'equity. If no CDO pools exist, every player pays $300 to the Treasury.',
    targets: 'All senior and mezzanine holders; benefits all equity holders',
    clauses: [
      clause([
        { op: 'tranche-face', tranche: 'senior', factor: 0.85 },
        { op: 'tranche-face', tranche: 'mezzanine', factor: 0.6 },
      ], anyEntity('pool')),
      otherwise([payTreasury(EVERYONE, flat(300))]),
    ],
  },
  {
    id: 'E4-04', era: 4, title: 'Forced Deleveraging',
    flavour: 'The facility is repriced to a ratio nobody was running at.',
    rules: 'At the next Settlement, every player whose drawn credit balance exceeds 60% of '
      + 'their borrowing base is flagged for a margin call and must reduce drawn balance '
      + 'to at most 60% of borrowing base by the end of the following Open phase, failing '
      + 'which the standard force-liquidation procedure runs. Players at or below 60% are '
      + 'unaffected.',
    targets: 'All players; bites the levered',
    clauses: [clause([
      marginFlag(eachWhere(above('drawn-to-base-ratio', 0.6)), 0.6, 'next-settlement'),
    ])],
  },
  {
    id: 'E4-05', era: 4, title: 'Rate Shock',
    flavour: 'The rate moves six points in an afternoon.',
    rules: 'At the next Settlement only, credit line interest is charged to all players at '
      + '18% instead of 12%. Where a player cannot pay from clean cash, the interest '
      + 'capitalises into drawn balance as normal. Peer loan rates are unaffected.',
    targets: 'All players',
    clauses: [clause([
      modify(EVERYONE, { effect: { kind: 'interest-rate-override', rate: 0.18 }, expiry: nextSettlement }),
    ])],
  },
  {
    id: 'E4-06', era: 4, title: 'Collateral Haircut',
    flavour: 'Improvements are no longer considered good security.',
    rules: 'For the remainder of the game, buildings contribute 10% of building cost to the '
      + 'borrowing base instead of 25% (i.e. 20% of the building advance rate). Deed '
      + 'contribution is unchanged at 50% of unmortgaged face. Any margin call arising is '
      + 'flagged at the next Settlement with the standard cure window.',
    targets: 'All players',
    clauses: [clause([
      modify(EVERYONE, {
        effect: { kind: 'borrowing-base-formula', deedRateFactor: 1, buildingRateFactor: 0.4 },
        expiry: forever,
      }),
    ])],
  },
  {
    id: 'E4-07', era: 4, title: 'Debt Restructuring Agreed',
    flavour: 'The creditors accept that some of it was never coming back.',
    rules: 'The player with the largest distressed debt balance has $400 of it forgiven by '
      + 'the Treasury. Tie-break: lower net worth; then earlier turn order. If no player '
      + 'carries distressed debt, the player with the lowest net worth collects $400 from '
      + 'the Treasury instead, tie-broken by lower clean cash, then earlier turn order.',
    targets: 'The most distressed player',
    clauses: [
      clause([forgiveDebt(MOST_DISTRESSED, 'distressed-debt', flat(400))], anyTarget(MOST_DISTRESSED)),
      otherwise([collect(POOREST_NW, flat(400))]),
    ],
  },
  {
    id: 'E4-08', era: 4, title: 'Fraud Charges Filed',
    flavour: 'The charges are filed jointly, which is efficient for everyone but the accused.',
    rules: 'Every player whose current Heat is 4 or more is audited immediately, resolving '
      + 'exactly as a successful audit check: dirty cash seized, fine of $100 x Heat, Heat '
      + 'resets to 0. Each such player additionally pays a $300 penalty to the Treasury. '
      + 'Does not consume the round’s normal audit check. If no player is at Heat 4 or '
      + 'more, no effect.',
    targets: 'All players; bites Heat 4+',
    clauses: [clause([auditNow(eachWhere(atLeast('heat', 4)), flat(300))])],
  },
  {
    id: 'E4-09', era: 4, title: 'Protection Sellers Called',
    flavour: 'Everyone who wrote protection is asked to prove they can honour it.',
    rules: 'Every player who has written at least one outstanding CDS must post an '
      + 'additional 20% of each written notional against their borrowing base immediately, '
      + 'for the remainder of the game. Stacks with any posting from E3-10. Any margin '
      + 'call arising is flagged at the next Settlement with the standard cure window. If '
      + 'no CDS are outstanding, every player pays $300 to the Treasury.',
    targets: 'All CDS writers',
    clauses: [
      clause(
        [modify(eachWhere(above('cds-notional-written', 0)), {
          effect: { kind: 'cds-posting-addend', rate: 0.2 }, expiry: forever,
        })],
        anyEntity('written-cds'),
      ),
      otherwise([payTreasury(EVERYONE, flat(300))]),
    ],
  },
  {
    id: 'E4-10', era: 4, title: 'Rent Collapse',
    flavour: 'Tenants are leaving. The ones who stay are renegotiating.',
    rules: 'For the whole of the next round, all rent collected on any landing is reduced '
      + 'by 50%. A rent future over any property receives only the reduced amount — this '
      + 'is not a make-whole event and no compensation is owed to the holder. Reverts at '
      + 'the end of the next round.',
    targets: 'All players; bites landlords and rent future holders',
    clauses: [clause([modify(EVERYONE, {
      effect: { kind: 'rent-multiplier', factor: 0.5 }, expiry: { kind: 'end-of-round', offset: 1 },
    })])],
  },
  {
    id: 'E4-11', era: 4, title: 'Tenant Defaults',
    flavour: 'The best collections in the city turn out to have been the most concentrated.',
    rules: 'The player who has collected the most rent this era pays $500 to the Treasury. '
      + 'Rent received through a rent future counts toward the receiving player, not the '
      + 'deed owner. Tie-break: higher total deed face value; then earlier turn order. If '
      + 'no rent has been collected this era, no effect.',
    targets: 'The highest rent collector this era',
    clauses: [
      clause([payTreasury(MOST_RENT_THIS_ERA, flat(500))], anyTarget(MOST_RENT_THIS_ERA)),
      otherwise([]),
    ],
  },
  {
    id: 'E4-12', era: 4, title: 'Fire Sale',
    flavour: 'The lender’s patience and the borrower’s options expire on the same afternoon.',
    rules: 'The player with the largest drawn credit balance must immediately mortgage '
      + 'their highest-face-value unmortgaged deed, receiving 50% of face value in clean '
      + 'cash, applied first to reduce their drawn balance. If that deed is encumbered by '
      + 'a rent future the standard make-whole applies and the contract terminates. If '
      + 'that deed carries an outstanding deed option, the next-highest eligible deed is '
      + 'mortgaged instead. If the player holds no eligible unmortgaged deed, no effect. '
      + 'Tie-break: higher drawn-to-base ratio; then earlier turn order.',
    targets: 'The most indebted player',
    clauses: [
      clause(
        [{ op: 'forced-mortgage', target: MOST_DRAWN, applyProceedsTo: 'drawn-credit' }],
        anyTarget(MOST_DRAWN),
      ),
      otherwise([]),
    ],
  },
  {
    id: 'E4-13', era: 4, title: 'Options Accelerated',
    flavour: 'All outstanding rights are brought forward to Friday.',
    rules: 'Every outstanding deed option’s expiry is brought forward to the end of the '
      + 'next Open phase. Holders exercise by paying the strike as normal or the option '
      + 'lapses worthless. Premiums are not refunded. If no deed options are outstanding, '
      + 'every player pays $300 to the Treasury.',
    targets: 'All option holders and writers',
    clauses: [
      clause([{ op: 'option-expiry', expiry: nextOpenPhase }], anyEntity('deed-option')),
      otherwise([payTreasury(EVERYONE, flat(300))]),
    ],
  },
  {
    id: 'E4-14', era: 4, title: 'Pool Wound Down',
    flavour: 'The trustee terminates the weakest structure rather than fund it further.',
    rules: 'The outstanding CDO pool with the lowest coverage ratio terminates at the end '
      + 'of the next Settlement. Its waterfall runs one final time on cash collected to '
      + 'date; underlying assets return to their owners unencumbered. Any tranche short of '
      + 'its remaining face at termination triggers every CDS referencing it. Tie-break: '
      + 'lower coverage ratio; then larger senior face amount; then earlier turn order. If '
      + 'no CDO pools exist, every player pays $300 to the Treasury.',
    targets: "The weakest pool's tranche holders and its CDS counterparties",
    clauses: [
      clause([{ op: 'pool-terminate', entity: WEAKEST_POOL, at: nextSettlement }], anyEntity('pool')),
      otherwise([payTreasury(EVERYONE, flat(300))]),
    ],
  },
  {
    id: 'E4-15', era: 4, title: 'Anti-Corruption Drive',
    flavour: 'The going rate has gone up. So has the risk of paying it.',
    rules: 'For the remainder of the game, bribery costs $400 in dirty cash instead of '
      + '$200 and confers +2 Heat instead of +1. All other bribery rules are unchanged.',
    targets: 'All players',
    clauses: [clause([
      modify(EVERYONE, { effect: { kind: 'bribery-terms', cost: 400, heat: 2 }, expiry: forever }),
    ])],
  },
  {
    id: 'E4-16', era: 4, title: 'Punitive Spread',
    flavour: 'Two names in the market are quoted separately, and worse.',
    rules: 'At the next Settlement, the two players with the largest drawn credit balances '
      + 'are charged credit line interest at 24% instead of the prevailing rate. All other '
      + 'players are charged at the prevailing rate. Tie-break for inclusion: higher '
      + 'drawn-to-base ratio; then earlier turn order. If fewer than two players have a '
      + 'drawn balance, only those with a balance are charged the punitive rate.',
    targets: 'The two most indebted players',
    clauses: [clause([
      modify(
        topN(2, 'drawn-credit', [hi('drawn-to-base-ratio')], above('drawn-credit', 0)),
        { effect: { kind: 'interest-rate-override', rate: 0.24 }, expiry: nextSettlement },
      ),
    ])],
  },
  {
    id: 'E4-17', era: 4, title: 'Clawback',
    flavour: 'The transactions were reviewed retrospectively. All of them.',
    rules: 'Every player pays the Treasury $200 in clean cash for each laundering '
      + 'transaction they have performed at any point in the game, capped at $800 per '
      + 'player. Players who never laundered pay nothing.',
    targets: 'All players; bites launderers',
    clauses: [clause([payTreasury(EVERYONE, per('launder-count-this-game', 200, 800))])],
  },
  {
    id: 'E4-18', era: 4, title: 'Emergency Liquidity Facility',
    flavour: 'The facility is open to institutions that do not appear to need it.',
    rules: 'Every player with a drawn credit balance of $0 and no distressed debt collects '
      + '$600 from the Treasury. Every other player collects $300 from the Treasury. '
      + 'Evaluated at the moment of the draw.',
    targets: 'All players; rewards the deleveraged',
    clauses: [clause([
      collect(EVERYONE, branch(
        allOf(atMost('drawn-credit', 0), atMost('distressed-debt', 0)),
        flat(600), flat(300),
      )),
    ])],
  },
  {
    id: 'E4-19', era: 4, title: 'Wealth Levy',
    flavour: 'An emergency measure, assessed on the largest balance sheet in the room.',
    rules: 'The player with the highest current net worth pays the Treasury 8% of that net '
      + 'worth, capped at $900. Net worth is computed at the moment of the draw. '
      + 'Tie-break: higher total deed face value; then earlier turn order.',
    targets: 'The leading player',
    clauses: [clause([
      payTreasury(RICHEST, sumOf([{ metric: 'net-worth', rate: 0.08 }], 900)),
    ])],
  },
  {
    id: 'E4-20', era: 4, title: 'Systemically Important',
    flavour: 'The designation is an honour. The capital requirement is not.',
    rules: 'The player with the greatest total obligations pays $500 to the Treasury and '
      + 'has their borrowing base reduced by 20% for the remainder of the game. Total '
      + 'obligations = drawn credit + peer loan principal owed as borrower + CDS notional '
      + 'written and outstanding + distressed debt. Tie-break: larger drawn balance; then '
      + 'earlier turn order. If every player’s total obligations are $0, every player '
      + 'collects $300 from the Treasury.',
    targets: 'The most obligated player',
    clauses: [
      clause([
        payTreasury(MOST_OBLIGATED, flat(500)),
        modify(MOST_OBLIGATED, {
          effect: { kind: 'borrowing-base-multiplier', factor: 0.8 }, expiry: forever,
        }),
      ], anyTarget(MOST_OBLIGATED)),
      otherwise([collect(EVERYONE, flat(300))]),
    ],
  },
]
