import type { GameState, PlayerState } from '../../core/state.js'
import type { Money, PlayerId } from '../../core/types.js'
import type { Amount, Card, CardClause, Effect } from './effects.js'
import { evalMetric, testPredicate } from './metrics.js'
import { resolveTarget, testWorld } from './select.js'
import { applyStructuralEffect } from './interpret-structural.js'
import { peerLoanInterestDue } from '../credit/index.js'

export interface DrawContext {
  readonly drawer: PlayerId
  readonly card: Card
}

/**
 * Sum the weighted terms, floor, cap, clamp, then clamp at zero.
 * `Math.floor` is the only rounding anywhere in the card interpreter.
 */
export function evalAmount(state: GameState, p: PlayerId, amount: Amount): Money {
  if (amount.kind === 'branch') {
    return testPredicate(state, p, amount.when)
      ? evalAmount(state, p, amount.then)
      : evalAmount(state, p, amount.otherwise)
  }
  const raw = amount.terms.reduce((t, term) => t + evalMetric(state, p, term.metric) * term.rate, 0)
  let value = Math.floor(raw)
  if (amount.cap !== undefined) value = Math.min(value, amount.cap)
  for (const metric of amount.clampTo ?? []) {
    value = Math.min(value, Math.floor(evalMetric(state, p, metric)))
  }
  return Math.max(0, value)
}

export function patchPlayer(state: GameState, id: PlayerId, patch: Partial<PlayerState>): GameState {
  return { ...state, players: { ...state.players, [id]: { ...state.players[id], ...patch } } }
}

/**
 * Step 1 of the standard obligation waterfall (spec section 19.8, restated by the hard
 * rule in the Task 18 brief): the Treasury is paid the full amount and the payer's clean
 * cash pays only as far as it goes. The shortfall capitalises into drawn credit,
 * UNCAPPED — never into distressed debt, which per the brief's hard rule is not a card
 * outcome and arises only from an exhausted forced liquidation.
 */
export function payToTreasury(state: GameState, payer: PlayerId, amount: Money): GameState {
  if (amount <= 0) return state
  const p = state.players[payer]
  const paid = Math.min(p.cleanCash, amount)
  const shortfall = amount - paid
  const next = patchPlayer(state, payer, {
    cleanCash: p.cleanCash - paid,
    drawnCredit: p.drawnCredit + shortfall,
  })
  return { ...next, treasury: next.treasury + amount }
}

/**
 * The Treasury credits the recipient in full. `applyFirstTo` routes the credit against
 * an existing liability first (E1-14's fallback, E3-18's distressed-debt-first credit),
 * with any remainder landing on clean cash — mirrors `CreditRepaid`'s shape exactly.
 */
export function payFromTreasury(
  state: GameState, recipient: PlayerId, amount: Money,
  applyFirstTo?: 'drawn-credit' | 'distressed-debt',
): GameState {
  if (amount <= 0) return state
  const p = state.players[recipient]
  let remainder = amount
  let drawnCredit = p.drawnCredit
  let distressedDebt = p.distressedDebt
  if (applyFirstTo === 'drawn-credit') {
    const reduce = Math.min(remainder, drawnCredit)
    drawnCredit -= reduce
    remainder -= reduce
  } else if (applyFirstTo === 'distressed-debt') {
    const reduce = Math.min(remainder, distressedDebt)
    distressedDebt -= reduce
    remainder -= reduce
  }
  const next = patchPlayer(state, recipient, {
    cleanCash: p.cleanCash + remainder, drawnCredit, distressedDebt,
  })
  return { ...next, treasury: next.treasury - amount }
}

/**
 * A pure player-to-player obligation: the recipient is credited in full and the
 * payer's clean cash floors at zero, any shortfall capitalising into the PAYER's own
 * drawn credit — never distressed debt, and no Treasury leg. Cards that move money
 * between players need none: this is exactly why.
 */
export function payToPlayer(
  state: GameState, payer: PlayerId, recipient: PlayerId, amount: Money,
): GameState {
  if (amount <= 0 || payer === recipient) return state
  const payerState = state.players[payer]
  const paid = Math.min(payerState.cleanCash, amount)
  const shortfall = amount - paid
  const afterPayer = patchPlayer(state, payer, {
    cleanCash: payerState.cleanCash - paid,
    drawnCredit: payerState.drawnCredit + shortfall,
  })
  const recipientState = afterPayer.players[recipient]
  return patchPlayer(afterPayer, recipient, { cleanCash: recipientState.cleanCash + amount })
}

/**
 * Repaying the player's OWN drawn credit from their OWN clean cash. No Treasury leg —
 * "the credit line creates the money it lends" (credit/reduce.ts), so both sides simply
 * fall by the same amount. The DSL always pairs this with `clampedTo(..., 'clean-cash',
 * 'drawn-credit')`, so `amount` never exceeds either balance, but the clamp is repeated
 * defensively here.
 */
function repayOwnCredit(state: GameState, player: PlayerId, amount: Money): GameState {
  const p = state.players[player]
  const pay = Math.min(amount, p.cleanCash, p.drawnCredit)
  if (pay <= 0) return state
  return patchPlayer(state, player, { cleanCash: p.cleanCash - pay, drawnCredit: p.drawnCredit - pay })
}

/** E3-16: pro rata per active loan, paid to each lender. Explicitly NOT a peer-loan
 * default trigger (era-decks 6.7) — the shortfall path here is the ordinary
 * `payToPlayer` capitalisation, never the default handler that transfers collateral
 * and halves the borrowing base. */
function payNoteHoldersFor(state: GameState, player: PlayerId): GameState {
  return state.loans
    .filter((l) => l.borrower === player && l.status === 'active')
    .reduce((s, loan) => {
      const due = peerLoanInterestDue(loan)
      return due <= 0 ? s : payToPlayer(s, player, loan.lender, due)
    }, state)
}

function applyTransfer(
  state: GameState, e: Extract<Effect, { op: 'transfer' }>, ctx: DrawContext,
): GameState {
  return resolveTarget(state, e.target, ctx.drawer).reduce((s, player) => {
    if (e.from.kind === 'treasury') {
      const amount = evalAmount(s, player, e.amount)
      return amount <= 0 ? s : payFromTreasury(s, player, amount, e.applyFirstTo)
    }
    if (e.to.kind === 'note-holders') return payNoteHoldersFor(s, player)
    const amount = evalAmount(s, player, e.amount)
    if (amount <= 0) return s
    if (e.to.kind === 'treasury') return payToTreasury(s, player, amount)
    if (e.to.kind === 'bank') return repayOwnCredit(s, player, amount)
    if (e.to.kind === 'other') {
      const [recipient] = resolveTarget(s, e.to.target, ctx.drawer)
      return recipient === undefined ? s : payToPlayer(s, player, recipient, amount)
    }
    return s
  }, state)
}

function applyDirty(
  state: GameState, e: Extract<Effect, { op: 'dirty' }>, ctx: DrawContext,
): GameState {
  return resolveTarget(state, e.target, ctx.drawer).reduce((s, player) => {
    const amount = evalAmount(s, player, e.amount)
    if (amount <= 0) return s
    const p = s.players[player]
    return e.direction === 'credit'
      ? patchPlayer(s, player, { dirtyCash: p.dirtyCash + amount })
      : patchPlayer(s, player, { dirtyCash: Math.max(0, p.dirtyCash - amount) })
  }, state)
}

function applyHeat(
  state: GameState, e: Extract<Effect, { op: 'heat' }>, ctx: DrawContext,
): GameState {
  return resolveTarget(state, e.target, ctx.drawer).reduce((s, player) => {
    const p = s.players[player]
    return patchPlayer(s, player, { heat: Math.max(0, p.heat + e.delta) })
  }, state)
}

/** Forgiveness always costs the Treasury: the liability falls and the Treasury falls by
 * the same amount, which is what keeps the conservation identity in spec section 20
 * balanced across a forgiveness event. */
function applyForgive(
  state: GameState, e: Extract<Effect, { op: 'forgive' }>, ctx: DrawContext,
): GameState {
  return resolveTarget(state, e.target, ctx.drawer).reduce((s, player) => {
    const amount = evalAmount(s, player, e.amount)
    if (amount <= 0) return s
    const p = s.players[player]
    const current = e.liability === 'drawn-credit' ? p.drawnCredit : p.distressedDebt
    const forgiven = Math.min(amount, current)
    if (forgiven <= 0) return s
    const patch = e.liability === 'drawn-credit'
      ? { drawnCredit: p.drawnCredit - forgiven }
      : { distressedDebt: p.distressedDebt - forgiven }
    const next = patchPlayer(s, player, patch)
    return { ...next, treasury: next.treasury - forgiven }
  }, state)
}

export function applyEffect(state: GameState, effect: Effect, ctx: DrawContext): GameState {
  switch (effect.op) {
    case 'transfer': return applyTransfer(state, effect, ctx)
    case 'dirty': return applyDirty(state, effect, ctx)
    case 'heat': return applyHeat(state, effect, ctx)
    case 'forgive': return applyForgive(state, effect, ctx)
    default: return applyStructuralEffect(state, effect, ctx)
  }
}

/**
 * A card is bribery-cancellable iff its resolved effects touch exactly one player
 * (spec section 10, restated in era-decks.md section 0): every effect must carry a
 * `target`, and every one of those targets must resolve to the same single player.
 * Structural, board-wide effects (tranche face, option repricing, pool operations)
 * carry no `target` at all and make a clause uncancellable outright.
 */
function touchedPlayers(
  state: GameState, clause: CardClause, drawer: PlayerId,
): ReadonlySet<PlayerId> | null {
  const touched = new Set<PlayerId>()
  for (const effect of clause.effects) {
    if (!('target' in effect)) return null
    for (const p of resolveTarget(state, effect.target, drawer)) touched.add(p)
  }
  return touched
}

function selectClause(state: GameState, card: Card, drawer: PlayerId): CardClause | undefined {
  return card.clauses.find((c) => c.when === undefined || testWorld(state, c.when, drawer))
}

export function isBriberyCancellable(state: GameState, card: Card, drawer: PlayerId): boolean {
  const clause = selectClause(state, card, drawer)
  if (clause === undefined || clause.effects.length === 0) return false
  const touched = touchedPlayers(state, clause, drawer)
  return touched !== null && touched.size === 1
}

/**
 * Applies the FIRST clause whose guard passes, and only that clause. A bribery
 * cancellation (Task 13's `cardCancelled` flag) is consumed here: if the resolved
 * clause touches exactly one player and that player bribed to cancel, the card does
 * nothing and the flag is spent. It cannot cancel a clause touching more than one
 * player, including "all players" — that guarantee falls out of `touchedPlayers`
 * returning a set of size > 1 (or null for a structural effect) in that case.
 */
export function applyCard(state: GameState, card: Card, drawer: PlayerId): GameState {
  const clause = selectClause(state, card, drawer)
  if (clause === undefined || clause.effects.length === 0) return state
  const touched = touchedPlayers(state, clause, drawer)
  if (touched !== null && touched.size === 1) {
    const [only] = touched
    if (only !== undefined && state.players[only].cardCancelled) {
      return patchPlayer(state, only, { cardCancelled: false })
    }
  }
  return clause.effects.reduce((s, effect) => applyEffect(s, effect, { drawer, card }), state)
}
