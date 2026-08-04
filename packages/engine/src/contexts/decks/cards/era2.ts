import type { Card, ModifierTemplate } from '../effects.js'
import {
  DRAWER, EVERYONE, above, anyEntity, anyTarget, clause, collect, dirtyIn, flat, forgiveDebt,
  grant, heatBy, hi, holderOf, least, lo, modify, most, nextOpenPhase, nextRound,
  nextSettlement, otherwise, payTreasury, per, rentX, sumOf,
} from './dsl.js'

const MOST_DRAWN = most('drawn-credit', [hi('drawn-to-base-ratio')], above('drawn-credit', 0))
const MOST_LEVERAGED = most('drawn-to-base-ratio', [hi('drawn-credit')], above('drawn-credit', 0))
const DIRTIEST = most('dirty-cash', [hi('heat')], above('dirty-cash', 0))
const BEST_GROUP_OWNER = most(
  'best-group-buildings', [hi('best-group-face-value')], above('complete-group-count', 0),
)
const BIGGEST_LENDER = most(
  'peer-principal-lent', [hi('peer-note-count')], above('peer-principal-lent', 0),
)
const POOREST = least('clean-cash', [lo('net-worth')])
const MOST_DEVELOPED = most('building-count', [hi('deed-face-value')], above('building-count', 0))
const BEST_FUTURE_HOLDER = holderOf({
  kind: 'rent-future', by: 'remaining-value', direction: 'max', attribute: 'holder',
})

const WAREHOUSE_UPLIFT: ModifierTemplate =
  { effect: { kind: 'borrowing-base-addend', dollars: 400 }, expiry: { kind: 'end-of-era' } }

export const ERA_II: readonly Card[] = [
  {
    id: 'E2-01', era: 2, title: 'Syndicated Facility Arranged',
    flavour: 'Three banks want the paper. Take the bigger number.',
    rules: 'The drawer’s borrowing base is multiplied by 1.25 for the remainder of Era II, '
      + 'reverting at the completion of the round 12 Settlement. Applied after the standard '
      + 'base calculation and after any additive term from E1-11.',
    targets: 'Drawer',
    clauses: [clause([
      modify(DRAWER, {
        effect: { kind: 'borrowing-base-multiplier', factor: 1.25 }, expiry: { kind: 'end-of-era' },
      }),
    ])],
  },
  {
    id: 'E2-02', era: 2, title: 'Boom-Time Rents',
    flavour: 'Asking rents are up across every class of property.',
    rules: 'For the whole of the next round, all rent collected on any landing is increased '
      + 'by 25%. Rent futures capture the increase. Reverts at the end of the next round.',
    targets: 'All players',
    clauses: [clause([modify(EVERYONE, rentX(1.25))])],
  },
  {
    id: 'E2-03', era: 2, title: 'Speculative Frenzy',
    flavour: 'Buyers are queuing for anything with a roof on it.',
    rules: 'The owner of the most-developed complete unmortgaged colour group collects $300 '
      + 'from the Treasury, where a hotel counts as 5 houses. Tie-break: higher combined deed '
      + 'face value of that group; then earlier turn order. If nobody holds a complete '
      + 'unmortgaged colour group, every player collects $100.',
    targets: 'The most-developed group owner',
    clauses: [
      clause([collect(BEST_GROUP_OWNER, flat(300))], anyTarget(BEST_GROUP_OWNER)),
      otherwise([collect(EVERYONE, flat(100))]),
    ],
  },
  {
    id: 'E2-04', era: 2, title: 'New Money Enters the Market',
    flavour: 'Capital arrives from somewhere and asks few questions.',
    rules: 'Every player collects $150 from the Treasury.',
    targets: 'All players',
    clauses: [clause([collect(EVERYONE, flat(150))])],
  },
  {
    id: 'E2-05', era: 2, title: 'Vice Squad Reshuffle',
    flavour: 'The precinct is reorganised. Files are misplaced.',
    rules: 'Every player reduces Heat by 2, to a minimum of 0.',
    targets: 'All players',
    clauses: [clause([heatBy(EVERYONE, -2)])],
  },
  {
    id: 'E2-06', era: 2, title: 'A Friend in the Precinct',
    flavour: 'An envelope is left for you. It is not from the bank.',
    rules: 'Drawer receives $200 dirty cash and gains +1 Heat. Dirty cash is worth $0 at '
      + 'scoring and is fully seizable in an audit from round 13 onward.',
    targets: 'Drawer',
    clauses: [clause([dirtyIn(DRAWER, flat(200)), heatBy(DRAWER, 1)])],
  },
  {
    id: 'E2-07', era: 2, title: 'Numbers Runner Recruited',
    flavour: 'The book is expanding. It expands toward money.',
    rules: 'The player currently holding the most dirty cash receives an additional $150 '
      + 'dirty cash and gains +1 Heat. Tie-break: higher current Heat; then earlier turn '
      + 'order. If no player holds dirty cash, the drawer instead receives $150 dirty cash '
      + 'and +1 Heat.',
    targets: 'The dirtiest player',
    clauses: [
      clause([dirtyIn(DIRTIEST, flat(150)), heatBy(DIRTIEST, 1)], anyTarget(DIRTIEST)),
      otherwise([dirtyIn(DRAWER, flat(150)), heatBy(DRAWER, 1)]),
    ],
  },
  {
    id: 'E2-08', era: 2, title: 'Correspondent Bank Writes Down',
    flavour: 'A rival institution takes the loss to keep the relationship.',
    rules: 'The player with the largest drawn credit balance has $250 of that balance '
      + 'forgiven by the Treasury. Tie-break: higher drawn-to-base ratio; then earlier turn '
      + 'order. If no player has a drawn balance, every player collects $100 from the Treasury.',
    targets: 'The most indebted player',
    clauses: [
      clause([forgiveDebt(MOST_DRAWN, 'drawn-credit', flat(250))], anyTarget(MOST_DRAWN)),
      otherwise([collect(EVERYONE, flat(100))]),
    ],
  },
  {
    id: 'E2-09', era: 2, title: 'Treasury Bids for Paper',
    flavour: 'The Treasury is buying contracts to steady the market. Above the model.',
    rules: 'The holder of the outstanding rent future with the highest engine-computed '
      + 'remaining expected value may, during the next Open phase, sell it to the Treasury '
      + 'for 120% of that value. On sale the contract terminates and rent reverts to the '
      + 'deed owner. Optional, expires at the end of the next Open phase. If no rent futures '
      + 'are outstanding, the drawer collects $200 from the Treasury.',
    targets: 'The holder of the most valuable rent future',
    clauses: [
      clause(
        [grant(BEST_FUTURE_HOLDER, {
          kind: 'sell-future-to-treasury', capacity: 1, expiry: nextOpenPhase,
          params: { premium: 1.2 },
        })],
        anyEntity('rent-future'),
      ),
      otherwise([collect(DRAWER, flat(200))]),
    ],
  },
  {
    id: 'E2-10', era: 2, title: 'Construction Boom',
    flavour: 'Every yard in the city is pouring foundations.',
    rules: 'For the whole of the next round, house and hotel purchase prices are reduced by '
      + '25% for all players. Even-build and supply limits are unchanged. Reverts at the end '
      + 'of the next round.',
    targets: 'All players',
    clauses: [clause([
      modify(EVERYONE, { effect: { kind: 'building-cost-multiplier', factor: 0.75 }, expiry: nextRound }),
    ])],
  },
  {
    id: 'E2-11', era: 2, title: 'Discreet Introduction',
    flavour: 'You are given a name and a time. Nothing is written down.',
    rules: 'The drawer may launch any one venture during the current or next Open phase at '
      + '50% of its stated cost. Heat is charged in full at the normal rate. Expires at the '
      + 'end of the next Open phase, one venture only.',
    targets: 'Drawer',
    clauses: [clause([
      grant(DRAWER, {
        kind: 'half-price-venture', capacity: 1, expiry: nextOpenPhase, params: { factor: 0.5 },
      }),
    ])],
  },
  {
    id: 'E2-12', era: 2, title: 'Loan Syndication Fee',
    flavour: 'Arranging other people’s debt is the safest business in town.',
    rules: 'The player who has lent the most total outstanding peer loan principal collects '
      + '$200 from the Treasury. Tie-break: greater number of outstanding notes held; then '
      + 'earlier turn order. If no peer loans are outstanding, every player collects $100.',
    targets: 'The largest peer lender',
    clauses: [
      clause([collect(BIGGEST_LENDER, flat(200))], anyTarget(BIGGEST_LENDER)),
      otherwise([collect(EVERYONE, flat(100))]),
    ],
  },
  {
    id: 'E2-13', era: 2, title: 'Warehouse Line Opened',
    flavour: 'They will fund the position first and document it later.',
    rules: 'The most leveraged player receives a temporary borrowing base uplift of $400, '
      + 'expiring at the completion of the round 12 Settlement. "Most leveraged" = highest '
      + 'drawn balance divided by borrowing base, among players with a drawn balance above '
      + '$0. Tie-break: larger drawn balance; then earlier turn order. If no player has a '
      + 'drawn balance, the drawer receives the uplift instead.',
    targets: 'The most leveraged player',
    clauses: [
      clause([modify(MOST_LEVERAGED, WAREHOUSE_UPLIFT)], anyTarget(MOST_LEVERAGED)),
      otherwise([modify(DRAWER, WAREHOUSE_UPLIFT)]),
    ],
  },
  {
    id: 'E2-14', era: 2, title: 'Waterfront Redevelopment',
    flavour: 'The plan is announced with a model and a ribbon.',
    rules: 'For the whole of the next round, rent collected on Dark Blue and Green '
      + 'properties is doubled. A rent future over such a property captures the doubling. '
      + 'Reverts at the end of the next round.',
    targets: 'All players; benefits Dark Blue and Green owners',
    clauses: [clause([modify(EVERYONE, rentX(2, { groups: ['dark-blue', 'green'] }))])],
  },
  {
    id: 'E2-15', era: 2, title: 'Payroll Tax Holiday',
    flavour: 'A relief measure, and an election coming.',
    rules: 'For the whole of the next round, GO pays $200 more than the standard salary on '
      + 'passing or landing. Reverts at the end of the next round.',
    targets: 'All players',
    clauses: [clause([
      modify(EVERYONE, { effect: { kind: 'go-salary-addend', dollars: 200 }, expiry: nextRound }),
    ])],
  },
  {
    id: 'E2-16', era: 2, title: 'Excise Inspection',
    flavour: 'The inspector counts the premises, not the takings.',
    rules: 'Every player pays the Treasury $100 for each venture they currently have active. '
      + 'The Speakeasy, being one-shot, is never counted. Players with no active ventures '
      + 'pay nothing.',
    targets: 'All players; bites venture operators',
    // Capped at $300 (3 venture kinds x $100): a defensive bound, not a game-rule
    // change — a player can never run more than one of each of the three ventures
    // simultaneously, so the cap never actually binds in practice.
    clauses: [clause([payTreasury(EVERYONE, per('active-venture-count', 100, 300))])],
  },
  {
    id: 'E2-17', era: 2, title: 'Distress Financing Available',
    flavour: 'Someone is always willing to lend to the desperate.',
    rules: 'The player holding the least clean cash collects $250 from the Treasury. '
      + 'Tie-break: lower net worth; then earlier turn order.',
    targets: 'The cash-poorest player',
    clauses: [clause([collect(POOREST, flat(250))])],
  },
  {
    id: 'E2-18', era: 2, title: 'Building Permit Backlog',
    flavour: 'The department is overwhelmed, and charges for the inconvenience.',
    rules: 'The player with the highest building count pays the Treasury $25 per house and '
      + '$150 per hotel owned, capped at $400. Building count = houses + (5 x hotels). '
      + 'Tie-break: higher total deed face value; then earlier turn order. If no player owns '
      + 'a building, no effect.',
    targets: 'The most-developed player',
    clauses: [
      clause(
        [payTreasury(MOST_DEVELOPED, sumOf(
          [{ metric: 'house-count', rate: 25 }, { metric: 'hotel-count', rate: 150 }], 400,
        ))],
        anyTarget(MOST_DEVELOPED),
      ),
      otherwise([]),
    ],
  },
  {
    id: 'E2-19', era: 2, title: 'An Accommodating Cashier',
    flavour: 'He does not look at the notes. He looks at the clock.',
    rules: 'The drawer may perform one laundering transaction during the current or next '
      + 'Open phase at a flat 10% haircut and 0 Heat cost. Still counts against the '
      + 'once-per-Open-phase laundering limit. Expires at the end of the next Open phase.',
    targets: 'Drawer',
    clauses: [clause([
      grant(DRAWER, {
        kind: 'cheap-launder', capacity: 1, expiry: nextOpenPhase,
        params: { haircut: 0.1, heatDelta: 0 },
      }),
    ])],
  },
  {
    id: 'E2-20', era: 2, title: 'Rate Dip',
    flavour: 'The prevailing rate softens for a month. Nobody expects it to last.',
    rules: 'At the next Settlement only, credit line interest is charged to all players at '
      + '4% instead of the prevailing rate. Peer loan rates are unaffected.',
    targets: 'All players',
    clauses: [clause([
      modify(EVERYONE, { effect: { kind: 'interest-rate-override', rate: 0.04 }, expiry: nextSettlement }),
    ])],
  },
]
