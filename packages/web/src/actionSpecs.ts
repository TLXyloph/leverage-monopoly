import type { Sync, WireCommand } from '@leverage/server'
import type { Instrument, PlayerId } from '@leverage/engine'

/**
 * The catalogue of things a player can do, one entry per command.
 *
 * `instrument` is the ONLY gating key, and it is checked against the engine's own
 * `unlockedInstruments` (carried on the assist payload). The action panel never keeps a
 * table of unlock eras — a duplicated gating table was a Critical finding during engine
 * development and cost a fix round to consolidate.
 */

export type Field =
  | { readonly kind: 'number'; readonly name: string; readonly label: string
      readonly min?: number; readonly initial?: number }
  | { readonly kind: 'select'; readonly name: string; readonly label: string
      readonly options: readonly { readonly value: string; readonly label: string }[] }

export interface ActionSpec {
  readonly id: string
  readonly instrument: Instrument
  readonly title: string
  readonly hint?: string
  readonly fields: readonly Field[]
  build(values: Readonly<Record<string, string>>): WireCommand | null
}

const num = (values: Readonly<Record<string, string>>, key: string): number =>
  Math.trunc(Number(values[key] ?? 0))

const str = (values: Readonly<Record<string, string>>, key: string): string => values[key] ?? ''

const asPlayer = (value: string): PlayerId => value as PlayerId

function others(me: PlayerId, order: readonly PlayerId[]): readonly { value: string; label: string }[] {
  return order.filter((p) => p !== me).map((p) => ({ value: p, label: p }))
}

function deedOptions(
  sync: Sync, predicate: (deed: Sync['state']['deeds'][string]) => boolean,
): readonly { value: string; label: string }[] {
  return Object.values(sync.state.deeds)
    .filter(predicate)
    .map((d) => ({ value: d.id, label: `${d.id}${d.mortgaged ? ' (mortgaged)' : ''}` }))
}

/* eslint-disable max-lines-per-function -- one flat catalogue; splitting it would only
 * scatter the single place a reviewer can check "is every command reachable from the UI?" */
export function actionSpecs(sync: Sync, me: PlayerId): readonly ActionSpec[] {
  const state = sync.state
  const order = state.config.turnOrder
  const mine = Object.values(state.deeds).filter((d) => d.owner === me)
  const round = state.round

  return [
    {
      id: 'draw-credit', instrument: 'credit-line', title: 'Draw on the credit line',
      hint: 'Capped at your borrowing base.',
      fields: [{ kind: 'number', name: 'amount', label: 'Amount', min: 1 }],
      build: (v) => ({ type: 'DrawCredit', player: me, amount: num(v, 'amount') }),
    },
    {
      id: 'repay-credit', instrument: 'credit-line', title: 'Repay the credit line',
      fields: [{ kind: 'number', name: 'amount', label: 'Amount', min: 1 }],
      build: (v) => ({ type: 'RepayCredit', player: me, amount: num(v, 'amount') }),
    },
    {
      id: 'repay-distressed', instrument: 'credit-line', title: 'Repay distressed debt',
      hint: 'Compounds at 15% a round until it is gone.',
      fields: [{ kind: 'number', name: 'amount', label: 'Amount', min: 1 }],
      build: (v) => ({ type: 'RepayDistressedDebt', player: me, amount: num(v, 'amount') }),
    },
    {
      id: 'build-house', instrument: 'building', title: 'Build',
      hint: 'Needs the whole colour group, built evenly.',
      fields: [{
        kind: 'select', name: 'deed', label: 'Deed',
        options: mine.filter((d) => !d.mortgaged).map((d) => ({ value: d.id, label: d.id })),
      }],
      build: (v) => ({ type: 'BuildHouse', player: me, deed: str(v, 'deed') }),
    },
    {
      id: 'sell-house', instrument: 'building', title: 'Sell a building',
      hint: 'Back to the bank at half what you paid.',
      fields: [{
        kind: 'select', name: 'deed', label: 'Deed',
        options: mine.filter((d) => d.houses > 0).map((d) => ({ value: d.id, label: d.id })),
      }],
      build: (v) => ({ type: 'SellHouse', player: me, deed: str(v, 'deed') }),
    },
    {
      id: 'mortgage', instrument: 'mortgage', title: 'Mortgage',
      hint: 'Raises 50% of face. A mortgaged deed charges no rent and carries no cost.',
      fields: [{
        kind: 'select', name: 'deed', label: 'Deed',
        options: mine.filter((d) => !d.mortgaged).map((d) => ({ value: d.id, label: d.id })),
      }],
      build: (v) => ({ type: 'MortgageDeed', player: me, deed: str(v, 'deed') }),
    },
    {
      id: 'unmortgage', instrument: 'mortgage', title: 'Lift a mortgage',
      hint: 'Costs 55% of face.',
      fields: [{
        kind: 'select', name: 'deed', label: 'Deed',
        options: mine.filter((d) => d.mortgaged).map((d) => ({ value: d.id, label: d.id })),
      }],
      build: (v) => ({ type: 'UnmortgageDeed', player: me, deed: str(v, 'deed') }),
    },
    {
      id: 'trade', instrument: 'trade', title: 'Trade',
      hint: 'Agree it out loud first — the command carries both confirmations.',
      fields: [
        { kind: 'select', name: 'to', label: 'With', options: others(me, order) },
        {
          kind: 'select', name: 'give', label: 'You give',
          options: [{ value: '', label: 'nothing' }, ...mine.map((d) => ({ value: d.id, label: d.id }))],
        },
        { kind: 'number', name: 'cashFrom', label: 'You pay', min: 0, initial: 0 },
        { kind: 'number', name: 'cashTo', label: 'They pay', min: 0, initial: 0 },
      ],
      build: (v) => {
        const to = asPlayer(str(v, 'to'))
        if (to === me || to.length === 0) return null
        const give = str(v, 'give')
        return {
          type: 'TradeAssets', from: me, to,
          deedsFrom: give === '' ? [] : [give], deedsTo: [],
          cashFrom: num(v, 'cashFrom'), cashTo: num(v, 'cashTo'),
          confirmedBy: [me, to],
        }
      },
    },
    {
      id: 'lend', instrument: 'peer-loan', title: 'Lend to a player',
      hint: 'Whole percentage points per round. Default forfeits the collateral.',
      fields: [
        { kind: 'select', name: 'borrower', label: 'Borrower', options: others(me, order) },
        { kind: 'number', name: 'principal', label: 'Principal', min: 1 },
        { kind: 'number', name: 'rate', label: 'Rate % / round', min: 0, initial: 10 },
        { kind: 'number', name: 'term', label: 'Term in rounds', min: 1, initial: 4 },
      ],
      build: (v) => ({
        type: 'OriginatePeerLoan', lender: me, borrower: asPlayer(str(v, 'borrower')),
        principal: num(v, 'principal'), ratePerRound: num(v, 'rate') / 100,
        termRounds: num(v, 'term'), collateral: [],
      }),
    },
    {
      id: 'repay-loan', instrument: 'peer-loan', title: 'Repay a peer loan',
      fields: [
        {
          kind: 'select', name: 'id', label: 'Loan',
          options: state.loans
            .filter((l) => l.borrower === me && l.status === 'active')
            .map((l) => ({ value: l.id, label: `${l.id} · $${l.outstanding}` })),
        },
        { kind: 'number', name: 'amount', label: 'Amount', min: 1 },
      ],
      build: (v) => ({
        type: 'RepayPeerLoan', player: me, id: str(v, 'id'), amount: num(v, 'amount'),
      }),
    },
    {
      id: 'sell-note', instrument: 'peer-loan', title: 'Sell a loan note',
      fields: [
        {
          kind: 'select', name: 'id', label: 'Note',
          options: state.loans
            .filter((l) => l.lender === me && l.status === 'active')
            .map((l) => ({ value: l.id, label: l.id })),
        },
        { kind: 'select', name: 'to', label: 'To', options: others(me, order) },
        { kind: 'number', name: 'price', label: 'Price', min: 0 },
      ],
      build: (v) => ({
        type: 'SellPeerLoanNote', player: me, id: str(v, 'id'),
        to: asPlayer(str(v, 'to')), price: num(v, 'price'),
      }),
    },
    {
      id: 'originate-future', instrument: 'rent-future', title: 'Sell a rent future',
      hint: 'The window must start after this round and run at most 8 rounds.',
      fields: [
        {
          kind: 'select', name: 'deed', label: 'On deed',
          options: mine.filter((d) => !d.mortgaged).map((d) => ({ value: d.id, label: d.id })),
        },
        { kind: 'select', name: 'holder', label: 'To', options: others(me, order) },
        { kind: 'number', name: 'start', label: 'From round', min: round + 1, initial: round + 1 },
        { kind: 'number', name: 'end', label: 'To round', min: round + 1, initial: round + 4 },
        { kind: 'number', name: 'price', label: 'Price', min: 0 },
      ],
      build: (v) => ({
        type: 'OriginateRentFuture', player: me, deed: str(v, 'deed'),
        holder: asPlayer(str(v, 'holder')), startRound: num(v, 'start'),
        endRound: num(v, 'end'), price: num(v, 'price'),
      }),
    },
    {
      id: 'sell-future', instrument: 'rent-future', title: 'Resell a rent future',
      fields: [
        {
          kind: 'select', name: 'contract', label: 'Contract',
          options: state.futures.filter((f) => f.holder === me).map((f) => ({ value: f.id, label: f.id })),
        },
        { kind: 'select', name: 'to', label: 'To', options: others(me, order) },
        { kind: 'number', name: 'price', label: 'Price', min: 0 },
      ],
      build: (v) => ({
        type: 'SellRentFuture', player: me, contract: str(v, 'contract'),
        to: asPlayer(str(v, 'to')), price: num(v, 'price'),
      }),
    },
    {
      id: 'launch-venture', instrument: 'venture', title: 'Launch a venture',
      hint: 'Paid in clean cash. Pays in dirty cash — read the laundered figure above.',
      fields: [
        {
          kind: 'select', name: 'venture', label: 'Venture',
          options: [
            { value: 'escort', label: 'Escort Service' },
            { value: 'numbers', label: 'Numbers Racket' },
            { value: 'chop-shop', label: 'Chop Shop' },
          ],
        },
        {
          kind: 'select', name: 'fundedFrom', label: 'Pay from',
          options: [{ value: 'clean', label: 'clean' }, { value: 'dirty', label: 'dirty' }],
        },
      ],
      build: (v) => ({
        type: 'LaunchVenture', player: me,
        venture: str(v, 'venture') as 'escort' | 'numbers' | 'chop-shop',
        fundedFrom: str(v, 'fundedFrom') === 'dirty' ? 'dirty' : 'clean',
      }),
    },
    {
      id: 'speakeasy', instrument: 'venture', title: 'Run a speakeasy',
      hint: 'One 2d6 roll, entered from the physical dice.',
      fields: [
        { kind: 'number', name: 'd1', label: 'Die 1', min: 1, initial: 1 },
        { kind: 'number', name: 'd2', label: 'Die 2', min: 1, initial: 1 },
        {
          kind: 'select', name: 'fundedFrom', label: 'Pay from',
          options: [{ value: 'clean', label: 'clean' }, { value: 'dirty', label: 'dirty' }],
        },
      ],
      build: (v) => ({
        type: 'PlaySpeakeasy', player: me, dice: [num(v, 'd1'), num(v, 'd2')],
        fundedFrom: str(v, 'fundedFrom') === 'dirty' ? 'dirty' : 'clean',
      }),
    },
    {
      id: 'launder', instrument: 'laundering', title: 'Launder dirty cash',
      hint: 'Once per Open phase. The haircut worsens with Heat.',
      fields: [{ kind: 'number', name: 'amount', label: 'Dirty amount', min: 1 }],
      build: (v) => ({ type: 'LaunderCash', player: me, amount: num(v, 'amount') }),
    },
    {
      id: 'bribe', instrument: 'bribery', title: 'Bribe',
      hint: 'Paid in dirty cash. Once per round.',
      fields: [
        {
          kind: 'select', name: 'effect', label: 'Effect',
          options: [
            { value: 'cancel-card', label: 'cancel a card' },
            { value: 'delay-margin-call', label: 'delay a margin call' },
            ...others(me, order).map((p) => ({
              value: `force-reroll:${p.value}`, label: `force ${p.label} to reroll`,
            })),
          ],
        },
      ],
      build: (v) => {
        const choice = str(v, 'effect')
        if (choice.startsWith('force-reroll:')) {
          return {
            type: 'Bribe', player: me,
            effect: { kind: 'force-reroll', target: asPlayer(choice.split(':')[1] ?? '') },
          }
        }
        if (choice === 'delay-margin-call') {
          return { type: 'Bribe', player: me, effect: { kind: 'delay-margin-call' } }
        }
        return { type: 'Bribe', player: me, effect: { kind: 'cancel-card' } }
      },
    },
    {
      id: 'write-option', instrument: 'deed-option', title: 'Write a deed option',
      hint: 'Locks the deed against sale, trade and mortgage while it is outstanding.',
      fields: [
        {
          kind: 'select', name: 'deed', label: 'On deed',
          options: mine.map((d) => ({ value: d.id, label: d.id })),
        },
        { kind: 'select', name: 'holder', label: 'To', options: others(me, order) },
        { kind: 'number', name: 'premium', label: 'Premium', min: 0 },
        { kind: 'number', name: 'strike', label: 'Strike', min: 0 },
        { kind: 'number', name: 'expiry', label: 'Expires round', min: round + 1, initial: round + 3 },
      ],
      build: (v) => ({
        type: 'WriteDeedOption', player: me, deed: str(v, 'deed'),
        holder: asPlayer(str(v, 'holder')), premium: num(v, 'premium'),
        strike: num(v, 'strike'), expiry: num(v, 'expiry'),
      }),
    },
    {
      id: 'sell-option', instrument: 'deed-option', title: 'Resell a deed option',
      fields: [
        {
          kind: 'select', name: 'contract', label: 'Contract',
          options: state.options.filter((o) => o.holder === me).map((o) => ({ value: o.id, label: o.id })),
        },
        { kind: 'select', name: 'to', label: 'To', options: others(me, order) },
        { kind: 'number', name: 'price', label: 'Price', min: 0 },
      ],
      build: (v) => ({
        type: 'SellDeedOption', player: me, contract: str(v, 'contract'),
        to: asPlayer(str(v, 'to')), price: num(v, 'price'),
      }),
    },
    {
      id: 'exercise-option', instrument: 'deed-option', title: 'Exercise a deed option',
      fields: [{
        kind: 'select', name: 'contract', label: 'Contract',
        options: state.options.filter((o) => o.holder === me).map((o) => ({
          value: o.id, label: `${o.id} · strike $${o.strike}`,
        })),
      }],
      build: (v) => ({ type: 'ExerciseDeedOption', player: me, contract: str(v, 'contract') }),
    },
    {
      id: 'create-pool', instrument: 'cdo', title: 'Build a CDO',
      hint: 'Pools every eligible instrument you hold. Three or more required.',
      fields: [
        { kind: 'number', name: 'senior', label: 'Senior face', min: 0 },
        { kind: 'number', name: 'mezzanine', label: 'Mezzanine face', min: 0 },
      ],
      build: (v) => ({
        type: 'CreatePool', player: me,
        assets: [
          ...state.loans.filter((l) => l.lender === me && l.status === 'active')
            .map((l) => ({ kind: 'peer-loan' as const, id: l.id })),
          ...state.futures.filter((f) => f.holder === me)
            .map((f) => ({ kind: 'rent-future' as const, id: f.id })),
          ...state.options.filter((o) => o.holder === me)
            .map((o) => ({ kind: 'deed-option' as const, id: o.id })),
        ],
        seniorFace: num(v, 'senior'), mezzanineFace: num(v, 'mezzanine'),
      }),
    },
    {
      id: 'sell-tranche', instrument: 'cdo', title: 'Sell a tranche',
      fields: [
        {
          kind: 'select', name: 'poolId', label: 'Pool',
          options: state.pools.filter((p) => !p.terminated).map((p) => ({ value: p.id, label: p.id })),
        },
        {
          kind: 'select', name: 'tranche', label: 'Tranche',
          options: [
            { value: 'senior', label: 'senior' },
            { value: 'mezzanine', label: 'mezzanine' },
            { value: 'equity', label: 'equity' },
          ],
        },
        { kind: 'select', name: 'to', label: 'To', options: others(me, order) },
        { kind: 'number', name: 'price', label: 'Price', min: 0 },
      ],
      build: (v) => ({
        type: 'SellTranche', player: me, poolId: str(v, 'poolId'),
        tranche: str(v, 'tranche') as 'senior' | 'mezzanine' | 'equity',
        to: asPlayer(str(v, 'to')), price: num(v, 'price'),
      }),
    },
    {
      id: 'write-swap', instrument: 'cds', title: 'Write or buy protection',
      hint: 'The writer posts 30% of notional against their borrowing base.',
      fields: [
        {
          kind: 'select', name: 'side', label: 'You are the',
          options: [{ value: 'seller', label: 'writer' }, { value: 'buyer', label: 'buyer' }],
        },
        { kind: 'select', name: 'other', label: 'Counterparty', options: others(me, order) },
        {
          kind: 'select', name: 'reference', label: 'Reference',
          options: [
            ...state.loans.filter((l) => l.status === 'active')
              .map((l) => ({ value: `peer-loan:${l.id}`, label: `loan ${l.id}` })),
            ...state.pools.filter((p) => !p.terminated).flatMap((p) =>
              (['senior', 'mezzanine', 'equity'] as const).map((t) => ({
                value: `tranche:${p.id}:${t}`, label: `${p.id} ${t}`,
              }))),
          ],
        },
        { kind: 'number', name: 'notional', label: 'Notional', min: 1 },
        { kind: 'number', name: 'premium', label: 'Premium / round', min: 0 },
      ],
      build: (v) => {
        const other = asPlayer(str(v, 'other'))
        const [kind, a, b] = str(v, 'reference').split(':')
        const reference = kind === 'tranche'
          ? {
              kind: 'tranche' as const, poolId: a ?? '',
              tranche: (b ?? 'senior') as 'senior' | 'mezzanine' | 'equity',
            }
          : { kind: 'peer-loan' as const, id: a ?? '' }
        const asSeller = str(v, 'side') === 'seller'
        return {
          type: 'WriteSwap',
          buyer: asSeller ? other : me,
          seller: asSeller ? me : other,
          reference,
          notional: num(v, 'notional'),
          premiumPerRound: num(v, 'premium'),
        }
      },
    },
    {
      id: 'insider-trade', instrument: 'insider-trading', title: 'Buy inside information',
      hint: 'Reveals the top card of the current era deck, to you alone.',
      fields: [{
        kind: 'select', name: 'fundedFrom', label: 'Pay from',
        options: [{ value: 'clean', label: 'clean' }, { value: 'dirty', label: 'dirty' }],
      }],
      build: (v) => ({
        type: 'InsiderTrade', player: me,
        fundedFrom: str(v, 'fundedFrom') === 'dirty' ? 'dirty' : 'clean',
      }),
    },
  ]
}

export { deedOptions }
