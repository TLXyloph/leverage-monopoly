import { ECONOMY } from '../../config/economy.js'
import { floorPercent } from '../../core/money.js'
import type { GameState } from '../../core/state.js'
import type { DeedId, PlayerId } from '../../core/types.js'
import type { Effect, Entitlement, Expiry, ResolvedExpiry, TimedModifier } from './effects.js'
import type { DrawContext } from './interpret.js'
import { evalAmount, patchPlayer, payToTreasury } from './interpret.js'
import { resolveEntity, resolveTarget } from './select.js'
import { groupIsDeveloped } from '../board/index.js'
import { deedsOwnedBy } from '../credit/index.js'
import { markRentFuture } from '../markets/index.js'

export function resolveExpiry(state: GameState, expiry: Expiry): ResolvedExpiry {
  const round = state.round
  switch (expiry.kind) {
    case 'end-of-round': return { boundary: 'round', round: round + expiry.offset }
    case 'end-of-open-phase': return { boundary: 'open-phase', round: round + expiry.offset }
    case 'next-settlement-only': return { boundary: 'settlement', round }
    case 'end-of-era': {
      const per = ECONOMY.ROUNDS_PER_ERA
      return { boundary: 'settlement', round: Math.ceil(round / per) * per }
    }
    case 'permanent': return { boundary: 'never', round: ECONOMY.TOTAL_ROUNDS }
  }
}

function applyModifier(
  state: GameState, e: Extract<Effect, { op: 'modifier' }>, ctx: DrawContext,
): GameState {
  const players = resolveTarget(state, e.target, ctx.drawer)
  if (players.length === 0) return state
  const seq = state.cardEffects.seq + 1
  const modifier: TimedModifier = {
    id: `${ctx.card.id}#${seq}`,
    source: ctx.card.id,
    players,
    effect: e.modifier.effect,
    expiry: resolveExpiry(state, e.modifier.expiry),
    seq,
  }
  return {
    ...state,
    cardEffects: {
      ...state.cardEffects,
      seq,
      modifiers: [...state.cardEffects.modifiers, modifier],
    },
  }
}

function applyEntitlement(
  state: GameState, e: Extract<Effect, { op: 'entitlement' }>, ctx: DrawContext,
): GameState {
  const players = resolveTarget(state, e.target, ctx.drawer)
  if (players.length === 0) return state
  const grants: Entitlement[] = players.map((owner, i) => ({
    id: `${ctx.card.id}#${state.cardEffects.seq + 1 + i}`,
    source: ctx.card.id,
    kind: e.entitlement.kind,
    owner,
    remaining: e.entitlement.capacity,
    expiry: resolveExpiry(state, e.entitlement.expiry),
    params: e.entitlement.params,
  }))
  return {
    ...state,
    cardEffects: {
      ...state.cardEffects,
      seq: state.cardEffects.seq + grants.length,
      entitlements: [...state.cardEffects.entitlements, ...grants],
    },
  }
}

/** Mirrors `underworld/audit.ts`'s `AuditResolved` handling exactly: all dirty cash
 * seized (destroyed, no counterparty), a $100 x Heat fine in clean cash with any
 * shortfall capitalising into drawn credit uncapped, Heat reset to 0, the FULL fine
 * credited to the Treasury. Reachable only from Era III onward (cards.test.ts asserts
 * this), which is what keeps audits gated to round 13 as era-decks.md requires. */
function applyAudit(
  state: GameState, e: Extract<Effect, { op: 'audit' }>, ctx: DrawContext,
): GameState {
  return resolveTarget(state, e.target, ctx.drawer).reduce((s, player) => {
    const p = s.players[player]
    const fine = ECONOMY.AUDIT_FINE_PER_HEAT * p.heat
    const paidFromCash = Math.min(fine, Math.max(0, p.cleanCash))
    const capitalised = fine - paidFromCash
    const audited = patchPlayer(s, player, {
      dirtyCash: 0,
      cleanCash: p.cleanCash - paidFromCash,
      drawnCredit: p.drawnCredit + capitalised,
      heat: 0,
    })
    const withFine = { ...audited, treasury: audited.treasury + fine }
    if (e.extraPenalty === undefined) return withFine
    const penalty = evalAmount(withFine, player, e.extraPenalty)
    return penalty <= 0 ? withFine : payToTreasury(withFine, player, penalty)
  }, state)
}

/**
 * Flags a margin call at the current round if the player is not already flagged,
 * matching `credit`'s own `MarginCallFlagged` reducer exactly (`marginCallFlaggedAt:
 * state.round`, from which `credit`'s `liquidationRound` selector derives the standard
 * two-round cure window). The card's own `cureRatio` is informational only: enforcing a
 * NON-standard cure ratio (E4-01's 80%, E4-04's 60%) against the ordinary margin-call
 * cure check is `credit`'s settlement logic, which Task 18 does not own and does not
 * modify — see the task report for this scoping note.
 */
function applyMarginFlag(
  state: GameState, e: Extract<Effect, { op: 'margin-flag' }>, ctx: DrawContext,
): GameState {
  return resolveTarget(state, e.target, ctx.drawer).reduce((s, player) => {
    const p = s.players[player]
    return p.marginCallFlaggedAt !== null ? s : patchPlayer(s, player, { marginCallFlaggedAt: s.round })
  }, state)
}

/** era-decks 6.4: reductions apply to REMAINING face (face - paid), never original
 * face, so a partially-paid tranche is cheaper to write down. */
function applyTrancheFace(
  state: GameState, e: Extract<Effect, { op: 'tranche-face' }>,
): GameState {
  return {
    ...state,
    pools: state.pools.map((pool) => {
      if (pool.terminated) return pool
      return {
        ...pool,
        tranches: pool.tranches.map((t) => {
          if (t.kind !== e.tranche) return t
          const remaining = Math.max(0, t.face - t.paid)
          if (remaining <= 0) return t
          return { ...t, face: t.paid + floorPercent(remaining, e.factor) }
        }),
      }
    }),
  }
}

function applyOptionStrike(
  state: GameState, e: Extract<Effect, { op: 'option-strike' }>,
): GameState {
  if (state.options.length === 0) return state
  return {
    ...state,
    options: state.options.map((o) => ({ ...o, strike: Math.max(e.floor, o.strike + e.delta) })),
  }
}

function applyOptionExpiry(
  state: GameState, e: Extract<Effect, { op: 'option-expiry' }>,
): GameState {
  if (state.options.length === 0) return state
  const resolved = resolveExpiry(state, e.expiry)
  return {
    ...state,
    options: state.options.map((o) => ({ ...o, expiry: Math.min(o.expiry, resolved.round) })),
  }
}

/**
 * era-decks 6.5: the equity holder (or originator) of the pool pays cash NOW. Because
 * `GameState` carries no pool cash balance — the real waterfall pays straight out of the
 * originator's own clean cash at Settlement (`securitization/waterfall.ts`) — the
 * payment is routed through the Treasury, which absorbs it as an escrow, and the amount
 * is separately recorded in `cardEffects.poolInjections` for a later settlement step to
 * release into that pool's waterfall. This keeps the conservation identity balanced at
 * the moment of the draw rather than leaving cash unaccounted for until Settlement.
 */
function applyPoolInject(
  state: GameState, e: Extract<Effect, { op: 'pool-inject' }>,
): GameState {
  const handle = resolveEntity(state, e.entity)
  if (handle === null || handle.kind !== 'pool') return state
  const pool = state.pools.find((p) => p.id === handle.poolId)
  if (pool === undefined) return state
  const payer = e.payer === 'originator'
    ? pool.originator
    : pool.tranches.find((t) => t.kind === 'equity')?.holder
  if (payer === undefined) return state
  const amount = evalAmount(state, payer, e.amount)
  if (amount <= 0) return state
  const paid = payToTreasury(state, payer, amount)
  const existing = paid.cardEffects.poolInjections[handle.poolId] ?? 0
  return {
    ...paid,
    cardEffects: {
      ...paid.cardEffects,
      poolInjections: { ...paid.cardEffects.poolInjections, [handle.poolId]: existing + amount },
    },
  }
}

function applyPoolTerminate(
  state: GameState, e: Extract<Effect, { op: 'pool-terminate' }>,
): GameState {
  const handle = resolveEntity(state, e.entity)
  if (handle === null || handle.kind !== 'pool') return state
  const already = state.cardEffects.scheduledPoolTerminations
  if (already.includes(handle.poolId)) return state
  return {
    ...state,
    cardEffects: { ...state.cardEffects, scheduledPoolTerminations: [...already, handle.poolId] },
  }
}

/**
 * era-decks 6.8. Sequence: select the eligible deed (unmortgaged, its whole colour
 * group undeveloped, no outstanding option), pay any rent-future make-whole and
 * terminate that contract, mortgage the deed (Treasury pays proceeds), then apply the
 * proceeds first to drawn credit and the remainder to clean cash. Margin status is
 * deliberately NOT re-evaluated here — the card text defers that to the next
 * Settlement, which is `credit`'s own flagging pass, outside Task 18's scope.
 */
function applyForcedMortgage(
  state: GameState, e: Extract<Effect, { op: 'forced-mortgage' }>, ctx: DrawContext,
): GameState {
  return resolveTarget(state, e.target, ctx.drawer).reduce((s, player) => {
    const optioned = new Set(s.options.map((o) => o.deed))
    const eligible = deedsOwnedBy(s, player)
      .filter((d) => !d.mortgaged && !groupIsDeveloped(s, d.group) && !optioned.has(d.id))
      .sort((a, b) => b.faceValue - a.faceValue)[0]
    return eligible === undefined ? s : mortgageDeedDirect(s, player, eligible.id)
  }, state)
}

function mortgageDeedDirect(state: GameState, player: PlayerId, deedId: DeedId): GameState {
  const deed = state.deeds[deedId]
  if (deed === undefined) return state

  let working = state
  const future = working.futures.find((f) => f.deed === deedId)
  if (future !== undefined) {
    const makeWhole = markRentFuture(working, future.id)
    if (makeWhole > 0) {
      const p = working.players[player]
      working = patchPlayer(working, player, { drawnCredit: p.drawnCredit + makeWhole })
      const holder = working.players[future.holder]
      working = patchPlayer(working, future.holder, { cleanCash: holder.cleanCash + makeWhole })
    }
    working = { ...working, futures: working.futures.filter((f) => f.id !== future.id) }
  }

  const proceeds = floorPercent(deed.faceValue, ECONOMY.MORTGAGE_RATE)
  working = {
    ...working,
    deeds: { ...working.deeds, [deedId]: { ...deed, mortgaged: true } },
    treasury: working.treasury - proceeds,
  }
  const p = working.players[player]
  const toDebt = Math.min(proceeds, p.drawnCredit)
  const toCash = proceeds - toDebt
  return patchPlayer(working, player, { drawnCredit: p.drawnCredit - toDebt, cleanCash: p.cleanCash + toCash })
}

export function applyStructuralEffect(
  state: GameState, effect: Effect, ctx: DrawContext,
): GameState {
  switch (effect.op) {
    case 'modifier': return applyModifier(state, effect, ctx)
    case 'entitlement': return applyEntitlement(state, effect, ctx)
    case 'audit': return applyAudit(state, effect, ctx)
    case 'margin-flag': return applyMarginFlag(state, effect, ctx)
    case 'tranche-face': return applyTrancheFace(state, effect)
    case 'option-strike': return applyOptionStrike(state, effect)
    case 'option-expiry': return applyOptionExpiry(state, effect)
    case 'pool-inject': return applyPoolInject(state, effect)
    case 'pool-terminate': return applyPoolTerminate(state, effect)
    case 'forced-mortgage': return applyForcedMortgage(state, effect, ctx)
    // The reveal is a client-side concern; the engine only records the resulting
    // permutation, which arrives separately as a DeckReordered event.
    case 'deck-peek': return state
    default: return state
  }
}
