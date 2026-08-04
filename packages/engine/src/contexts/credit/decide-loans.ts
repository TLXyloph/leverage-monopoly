import { ECONOMY } from '../../config/economy.js'
import { isRejection, reject } from '../../core/errors.js'
import type { Rejection } from '../../core/errors.js'
import type { GameEvent } from '../../core/events.js'
import { isWholeDollars } from '../../core/money.js'
import type { GameState, PeerLoan } from '../../core/state.js'
import type { ContractId, DeedId, Money, PlayerId, RoundNumber } from '../../core/types.js'
import { findPeerLoan, pledgedDeeds, poolHoldingLoan } from './selectors.js'

export type PeerLoanCommand =
  | { readonly type: 'OriginatePeerLoan'
      readonly lender: PlayerId
      readonly borrower: PlayerId
      readonly principal: Money
      readonly ratePerRound: number
      readonly termRounds: number
      readonly collateral: readonly DeedId[] }
  | { readonly type: 'RepayPeerLoan'
      readonly player: PlayerId
      readonly id: ContractId
      readonly amount: Money }
  | { readonly type: 'SellPeerLoanNote'
      readonly player: PlayerId
      readonly id: ContractId
      readonly to: PlayerId
      readonly price: Money }

/**
 * Contract ids are DERIVED, never generated: the engine holds no source of randomness,
 * so an identity has to be a pure function of the terms. Two loans between the same pair
 * in the same round collide, which is reported as DUPLICATE_CONTRACT_ID rather than
 * silently overwriting.
 */
export function peerLoanId(
  lender: PlayerId,
  borrower: PlayerId,
  round: RoundNumber,
): ContractId {
  return `pl:${lender}:${borrower}:${round}`
}

/**
 * Spec section 2. Peer loans unlock in Era II. The check is inlined from `state.era` and
 * `state.config.unlockMode`, both core state, rather than importing `session`'s
 * `isUnlocked`: spec section 14 lets `session` depend on `credit`, so importing it here
 * would invert the dependency graph. `ECONOMY.UNLOCK_ERA['peer-loan']` is the same single
 * source of truth `session` itself reads.
 */
function locked(state: GameState): boolean {
  return state.config.unlockMode !== 'all' && state.era < ECONOMY.UNLOCK_ERA['peer-loan']
}

export function decidePeerLoan(
  state: GameState,
  command: PeerLoanCommand,
): readonly GameEvent[] | Rejection {
  if (locked(state)) {
    return reject('INSTRUMENT_LOCKED_THIS_ERA', 'Peer loans unlock in Era II.')
  }
  switch (command.type) {
    case 'OriginatePeerLoan':
      return decideOriginate(state, command)
    case 'RepayPeerLoan':
      return decideRepay(state, command)
    case 'SellPeerLoanNote':
      return decideSellNote(state, command)
  }
}

function decideOriginate(
  state: GameState,
  cmd: Extract<PeerLoanCommand, { type: 'OriginatePeerLoan' }>,
): readonly GameEvent[] | Rejection {
  if (cmd.lender === cmd.borrower) {
    return reject('SELF_DEALING', 'A peer loan needs two different players.')
  }
  if (!isWholeDollars(cmd.principal) || cmd.principal <= 0) {
    return reject('INVALID_AMOUNT', 'Lend at least $1, in whole dollars.')
  }
  const lenderCash = state.players[cmd.lender].cleanCash
  if (cmd.principal > lenderCash) {
    return reject('INSUFFICIENT_CLEAN_CASH', `${cmd.lender} holds $${lenderCash} in clean cash.`)
  }
  const basisPoints = Math.round(cmd.ratePerRound * 10_000)
  if (basisPoints < 0 || basisPoints > 10_000 || basisPoints % 100 !== 0) {
    return reject(
      'INVALID_LOAN_TERMS',
      'The rate must be a whole percentage from 0% to 100% per round.',
    )
  }
  if (!Number.isInteger(cmd.termRounds) || cmd.termRounds < 1) {
    return reject('INVALID_LOAN_TERMS', 'The term must be a whole number of rounds, at least one.')
  }
  const maturesAtRound = state.round + cmd.termRounds
  if (maturesAtRound > ECONOMY.TOTAL_ROUNDS) {
    return reject(
      'INVALID_WINDOW',
      `The game ends at round ${ECONOMY.TOTAL_ROUNDS}, so the term must mature by then.`,
    )
  }
  const alreadyPledged = pledgedDeeds(state)
  const seen = new Set<DeedId>()
  for (const deedId of cmd.collateral) {
    const d = state.deeds[deedId]
    if (d === undefined || d.owner !== cmd.borrower) {
      return reject('NOT_OWNER', `${cmd.borrower} does not own ${deedId}.`)
    }
    if (d.mortgaged) {
      return reject('DEED_MORTGAGED', `${deedId} is mortgaged and secures nothing.`)
    }
    if (seen.has(deedId) || alreadyPledged.includes(deedId)) {
      return reject('DEED_ENCUMBERED', `${deedId} is already pledged against a loan.`)
    }
    seen.add(deedId)
  }
  const id = peerLoanId(cmd.lender, cmd.borrower, state.round)
  if (state.loans.some((l) => l.id === id)) {
    return reject(
      'DUPLICATE_CONTRACT_ID',
      'These two players already originated a loan this round. Wait a round or change the pairing.',
    )
  }
  return [{
    type: 'PeerLoanOriginated',
    id,
    lender: cmd.lender,
    borrower: cmd.borrower,
    principal: cmd.principal,
    ratePerRound: cmd.ratePerRound,
    maturesAtRound,
    collateral: cmd.collateral,
  }]
}

/** An `active` loan the caller referenced, or the rejection explaining why not. */
function activeLoanOr(state: GameState, id: ContractId): PeerLoan | Rejection {
  const loan = findPeerLoan(state, id)
  if (loan === undefined) return reject('CONTRACT_NOT_FOUND', 'There is no loan with that id.')
  if (loan.status !== 'active') {
    return reject('CONTRACT_NOT_FOUND', `That loan is already ${loan.status}.`)
  }
  return loan
}

function decideRepay(
  state: GameState,
  cmd: Extract<PeerLoanCommand, { type: 'RepayPeerLoan' }>,
): readonly GameEvent[] | Rejection {
  const loan = activeLoanOr(state, cmd.id)
  if (isRejection(loan)) return loan
  if (loan.borrower !== cmd.player) {
    return reject('NOT_OWNER', 'Only the borrower can repay a loan.')
  }
  if (!isWholeDollars(cmd.amount) || cmd.amount <= 0) {
    return reject('INVALID_AMOUNT', 'Repay at least $1, in whole dollars.')
  }
  if (cmd.amount > loan.outstanding) {
    return reject('INVALID_AMOUNT', `You owe $${loan.outstanding} on this loan.`)
  }
  const cash = state.players[cmd.player].cleanCash
  if (cmd.amount > cash) {
    return reject('INSUFFICIENT_CLEAN_CASH', `You hold $${cash} in clean cash.`)
  }
  return [{ type: 'PeerLoanRepaid', id: loan.id, amount: cmd.amount }]
}

/**
 * Spec section 7: the note is a transferable asset, sellable outright. Spec 19.4's
 * boundary — `credit` may move cash into or out of a pooled note but never transfer the
 * note itself, because `securitization` has already sold that cashflow to the tranche
 * holders — is enforced here via `poolHoldingLoan`; `RepayPeerLoan` above is exempt from
 * it because repayment is cash, not a transfer.
 */
function decideSellNote(
  state: GameState,
  cmd: Extract<PeerLoanCommand, { type: 'SellPeerLoanNote' }>,
): readonly GameEvent[] | Rejection {
  const loan = activeLoanOr(state, cmd.id)
  if (isRejection(loan)) return loan
  if (loan.lender !== cmd.player) {
    return reject('NOT_ASSET_OWNER', 'Only the holder of the note can sell it.')
  }
  if (cmd.to === cmd.player) {
    return reject('SELF_DEALING', 'A sale needs two different players.')
  }
  if (cmd.to === loan.borrower) {
    return reject(
      'SELF_DEALING',
      'The borrower cannot buy their own note. Repay the loan instead.',
    )
  }
  if (poolHoldingLoan(state, loan.id) !== null) {
    return reject(
      'ASSET_ALREADY_POOLED',
      'That note is inside a live pool. Its cashflow belongs to the tranche holders.',
    )
  }
  if (!isWholeDollars(cmd.price) || cmd.price < 0) {
    return reject('NEGATIVE_AMOUNT', 'A price must be a whole, non-negative number of dollars.')
  }
  const buyerCash = state.players[cmd.to].cleanCash
  if (cmd.price > buyerCash) {
    return reject('INSUFFICIENT_CLEAN_CASH', `${cmd.to} holds $${buyerCash} in clean cash.`)
  }
  return [{ type: 'PeerLoanSold', id: loan.id, from: cmd.player, to: cmd.to, price: cmd.price }]
}
