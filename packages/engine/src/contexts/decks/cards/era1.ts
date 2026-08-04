import type { Card } from '../effects.js'
import {
  DRAWER, EVERYONE, above, anyTarget, clampedTo, clause, collect, eachWhere, flat, forever,
  grant, hi, least, lo, modify, most, nextOpenPhase, nextRound, nextSettlement, otherwise,
  payPlayer, payTreasury, per, repayBank, rentX, sameTarget, sumOf,
} from './dsl.js'

// Shared dynamic-target constants, each carrying the exact tie-break chain era-decks.md
// states for it. The final fallback in every one is earlier turn order, applied
// automatically by `resolveTarget` once every stated tie-break has also tied.
const FEWEST_BUILDINGS = least('building-count', [lo('deed-face-value')])
const MOST_RAILROADS = most('railroad-count', [lo('deed-face-value')])
const HIGHEST_FACE = most('unmortgaged-face-value', [hi('building-count')])
const LOWEST_FACE = least('unmortgaged-face-value', [lo('building-count')])
const MOST_GROUPS = most(
  'complete-group-count', [lo('building-count'), lo('deed-face-value')],
  above('complete-group-count', 0),
)
const MOST_DRAWN = most('drawn-credit', [hi('drawn-to-base-ratio')], above('drawn-credit', 0))
const MOST_RENT = most('rent-received-this-era', [hi('deed-face-value')])
const LEAST_RENT = least('rent-received-this-era', [lo('deed-face-value')])
const MOST_MORTGAGED = most(
  'mortgaged-deed-count', [hi('mortgaged-face-value')], above('mortgaged-deed-count', 0),
)
const ANY_UTILITY_OWNER = most('utility-count', [], above('utility-count', 0))

export const ERA_I: readonly Card[] = [
  {
    id: 'E1-01', era: 1, title: 'Zoning Variance Approved',
    flavour: 'The board has approved your variance. Build while the ink is wet.',
    rules: 'Drawer receives a one-time half-price house voucher, usable during the current '
      + 'or next Open phase. Normal full-group, unmortgaged and even-build rules still apply. '
      + 'Expires unused at the end of the next Open phase. Not transferable.',
    targets: 'Drawer',
    clauses: [clause([
      grant(DRAWER, {
        kind: 'half-price-house', capacity: 1, expiry: nextOpenPhase, params: { factor: 0.5 },
      }),
    ])],
  },
  {
    id: 'E1-02', era: 1, title: 'Reconstruction Grant',
    flavour: 'Federal reconstruction funds are directed to under-improved parcels.',
    rules: 'The player with the fewest buildings collects $150 from the Treasury. Building '
      + 'count = houses + (5 x hotels). Tie-break: lower total deed face value; then earlier '
      + 'turn order.',
    targets: 'The least-developed player',
    clauses: [clause([collect(FEWEST_BUILDINGS, flat(150))])],
  },
  {
    id: 'E1-03', era: 1, title: 'Victory Bond Coupon',
    flavour: 'A wartime issue matures. Modest, and on time.',
    rules: 'Every player collects $75 from the Treasury.',
    targets: 'All players',
    clauses: [clause([collect(EVERYONE, flat(75))])],
  },
  {
    id: 'E1-04', era: 1, title: 'Title Search Fee',
    flavour: 'Counsel has traced the encumbrances. Counsel bills for it.',
    rules: 'Drawer pays the Treasury $50 for each mortgaged deed they hold, to a maximum of '
      + '$200. No mortgaged deeds means no payment and no compensation.',
    targets: 'Drawer',
    clauses: [clause([payTreasury(DRAWER, per('mortgaged-deed-count', 50, 200))])],
  },
  {
    id: 'E1-05', era: 1, title: 'Freight Haulage Contract',
    flavour: 'Rolling stock is scarce. The rails quote accordingly.',
    rules: 'The player owning the most railroads collects $50 per railroad owned from the '
      + 'Treasury. Tie-break: lower total deed face value; then earlier turn order. Only one '
      + 'player collects.',
    targets: 'The largest railroad holder',
    clauses: [clause([collect(MOST_RAILROADS, per('railroad-count', 50))])],
  },
  {
    id: 'E1-06', era: 1, title: 'Prime Rate Concession',
    flavour: 'The discount window opens a crack.',
    rules: 'The drawer pays no credit line interest at the next Settlement; the Treasury '
      + 'forgoes it. If the drawer’s drawn balance is $0 at the next Settlement, the '
      + 'drawer instead collects $100 from the Treasury at that Settlement.',
    targets: 'Drawer',
    clauses: [clause([
      modify(DRAWER, {
        effect: { kind: 'waive-credit-interest', ifZeroBalanceCollect: 100 },
        expiry: nextSettlement,
      }),
    ])],
  },
  {
    id: 'E1-07', era: 1, title: 'Lumber Shortage',
    flavour: 'Framing timber is rationed. Everyone pays for the privilege of having built.',
    rules: 'Every player pays the Treasury $25 for each house and $125 for each hotel, capped '
      + 'at $100 per player. Players with no buildings pay nothing.',
    targets: 'All players',
    clauses: [clause([payTreasury(EVERYONE, sumOf(
      [{ metric: 'house-count', rate: 25 }, { metric: 'hotel-count', rate: 125 }], 100,
    ))])],
  },
  {
    id: 'E1-08', era: 1, title: 'Streetcar Line Extended',
    flavour: 'The new line runs through the cheap end of town.',
    rules: 'For the whole of the next round, rent collected on Brown and Light Blue properties '
      + 'is increased by 50%. Applies to rent actually paid by the landing player. Reverts at '
      + 'the end of the next round.',
    targets: 'All players; benefits Brown and Light Blue owners',
    clauses: [clause([modify(EVERYONE, rentX(1.5, { groups: ['brown', 'light-blue'] }))])],
  },
  {
    id: 'E1-09', era: 1, title: "Assessor's Reappraisal",
    flavour: 'The rolls are revised. Some frontage is now worth more than its owner claimed.',
    rules: 'Highest total unmortgaged deed face value pays $150 to the Treasury; lowest '
      + 'collects $100. If the same player would be both, they pay $50 net. Tie-break for '
      + 'highest: more buildings; then earlier turn order. For lowest: fewer buildings; then '
      + 'earlier turn order.',
    targets: 'Two dynamically selected players',
    clauses: [
      clause([payTreasury(HIGHEST_FACE, flat(50))], sameTarget(HIGHEST_FACE, LOWEST_FACE)),
      otherwise([payTreasury(HIGHEST_FACE, flat(150)), collect(LOWEST_FACE, flat(100))]),
    ],
  },
  {
    id: 'E1-10', era: 1, title: 'Utility Franchise Renewed',
    flavour: 'The municipality renews both franchises without argument.',
    rules: 'Every player owning at least one utility collects $100 per utility owned from the '
      + 'Treasury. Mortgaged utilities count. If neither utility is player-owned, the drawer '
      + 'collects $100.',
    targets: 'All utility owners',
    clauses: [
      clause(
        [collect(eachWhere(above('utility-count', 0)), per('utility-count', 100))],
        anyTarget(ANY_UTILITY_OWNER),
      ),
      otherwise([collect(DRAWER, flat(100))]),
    ],
  },
  {
    id: 'E1-11', era: 1, title: 'Credit Committee Sits',
    flavour: 'Your file is approved without discussion. Note the date.',
    rules: 'The drawer’s borrowing base is permanently increased by a flat $150 for the '
      + 'remainder of the game. Additive, applied after the standard base calculation, '
      + 'unaffected by mortgaging.',
    targets: 'Drawer',
    clauses: [clause([
      modify(DRAWER, { effect: { kind: 'borrowing-base-addend', dollars: 150 }, expiry: forever }),
    ])],
  },
  {
    id: 'E1-12', era: 1, title: 'Back Taxes Refunded',
    flavour: "An arithmetic error in the county's favour, corrected.",
    rules: 'Every player collects $25 from the Treasury per unmortgaged deed held, capped at '
      + '$150 per player.',
    targets: 'All players',
    clauses: [clause([collect(EVERYONE, per('unmortgaged-deed-count', 25, 150))])],
  },
  {
    id: 'E1-13', era: 1, title: 'Contractor Extends Credit',
    flavour: 'The builder wants the whole block and will discount to get it.',
    rules: 'The player holding the most complete unmortgaged colour groups receives a $200 '
      + 'building credit, applied automatically against their next house and hotel purchases '
      + 'until exhausted. Expires at the end of round 6. Tie-break: fewer total buildings; '
      + 'then lower total deed face value; then earlier turn order. If nobody holds a '
      + 'complete unmortgaged group, every player collects $75.',
    targets: 'The player with the most complete groups, or all players on fallback',
    clauses: [
      clause(
        [grant(MOST_GROUPS, {
          kind: 'building-credit', capacity: 200, expiry: { kind: 'end-of-era' }, params: {},
        })],
        anyTarget(MOST_GROUPS),
      ),
      otherwise([collect(EVERYONE, flat(75))]),
    ],
  },
  {
    id: 'E1-14', era: 1, title: 'Bank Examiner Calls',
    flavour: 'The examiner would like to see the balance reduced. This week.',
    rules: 'The player with the largest drawn credit balance immediately repays $150 of it '
      + 'from clean cash. If they hold less than $150 clean cash, they repay all clean cash '
      + 'they hold and no more; this never creates distressed debt. Tie-break: higher '
      + 'drawn-to-base ratio; then earlier turn order. If nobody has a drawn balance, the '
      + 'drawer collects $100 from the Treasury.',
    targets: 'The most indebted player',
    clauses: [
      clause(
        [repayBank(MOST_DRAWN, clampedTo(flat(150), 'clean-cash', 'drawn-credit'))],
        anyTarget(MOST_DRAWN),
      ),
      otherwise([collect(DRAWER, flat(100))]),
    ],
  },
  {
    id: 'E1-15', era: 1, title: 'Insurance Settlement',
    flavour: 'The claim is paid without a fight. Enjoy the novelty.',
    rules: 'Drawer collects $200 from the Treasury.',
    targets: 'Drawer',
    clauses: [clause([collect(DRAWER, flat(200))])],
  },
  {
    id: 'E1-16', era: 1, title: 'Chimney Fire',
    flavour: 'Sparks in the flue. The inspector is unsympathetic.',
    rules: 'Drawer pays the Treasury $25 per house and $100 per hotel owned, capped at $200. '
      + 'No buildings means no payment.',
    targets: 'Drawer',
    clauses: [clause([payTreasury(DRAWER, sumOf(
      [{ metric: 'house-count', rate: 25 }, { metric: 'hotel-count', rate: 100 }], 200,
    ))])],
  },
  {
    id: 'E1-17', era: 1, title: 'Rent Control Board Convenes',
    flavour: "The board finds current increases 'not justified by circumstance'.",
    rules: 'For the whole of the next round, rent collected on any property carrying 3 or '
      + 'more houses (a hotel counts as 5) is reduced by 25%. Applies to rent actually paid. '
      + 'Reverts at the end of the next round.',
    targets: 'All players; bites the most-developed',
    clauses: [clause([modify(EVERYONE, rentX(0.75, { minBuildings: 3 }))])],
  },
  {
    id: 'E1-18', era: 1, title: "Tenants' Petition",
    flavour: 'Signatures gathered on the busiest street, delivered to the quietest.',
    rules: 'The player who has collected the most rent so far this era pays $100 to the '
      + 'player who has collected the least. Measured from the start of round 1. Tie-break '
      + 'for most: higher total deed face value; then earlier turn order. For least: lower '
      + 'total deed face value; then earlier turn order. If the same player is both, no effect.',
    targets: 'Two dynamically selected players',
    clauses: [
      clause([], sameTarget(MOST_RENT, LEAST_RENT)),
      otherwise([payPlayer(MOST_RENT, LEAST_RENT, flat(100))]),
    ],
  },
  {
    id: 'E1-19', era: 1, title: 'Mortgage Amnesty',
    flavour: 'The lender will take face value to clear the file.',
    rules: 'The player holding the most mortgaged deeds may, during the next Open phase, '
      + 'unmortgage one deed of their choice at 50% of face value instead of 55%. Expires at '
      + 'the end of the next Open phase, not transferable. Tie-break: higher total mortgaged '
      + 'face value; then earlier turn order. If nobody holds a mortgaged deed, the drawer '
      + 'collects $100 from the Treasury.',
    targets: 'The player with the most mortgaged deeds',
    clauses: [
      clause(
        [grant(MOST_MORTGAGED, {
          kind: 'discount-unmortgage', capacity: 1, expiry: nextOpenPhase, params: { rate: 0.5 },
        })],
        anyTarget(MOST_MORTGAGED),
      ),
      otherwise([collect(DRAWER, flat(100))]),
    ],
  },
  {
    id: 'E1-20', era: 1, title: 'Wage Indexation',
    flavour: 'Pay packets are adjusted upward. Briefly.',
    rules: 'For the whole of the next round, GO pays $100 more than the standard salary on '
      + 'passing or landing. Reverts at the end of the next round.',
    targets: 'All players',
    clauses: [clause([
      modify(EVERYONE, { effect: { kind: 'go-salary-addend', dollars: 100 }, expiry: nextRound }),
    ])],
  },
]
