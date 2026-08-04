import { replay, reduce } from '../../src/core/reduce.js'
import { isRejection, type Rejection } from '../../src/core/errors.js'
import type { GameEvent } from '../../src/core/events.js'
import type { GameState } from '../../src/core/state.js'
import type { DeedId, DiceRoll } from '../../src/core/types.js'
import { ECONOMY } from '../../src/config/economy.js'
import { createGame, decideSession } from '../../src/contexts/session/index.js'
import { DRAFT_ROUNDS, availableDeeds, decideDraft } from '../../src/contexts/draft/index.js'
import { decideBoard } from '../../src/contexts/board/index.js'
import { decideDeck } from '../../src/contexts/decks/index.js'
import { decideCreditAction } from '../../src/core/decide.js'
import {
  exhaustLiquidation, liquidationQueue, playersAwaitingLiquidation,
} from '../../src/contexts/credit/index.js'
import { ACTION_KINDS } from './arbitraries.js'
import type { GameScript, ScriptedAction, ScriptedDraftRound, ScriptedRound } from './arbitraries.js'
import { amount, dispatch } from './dispatch.js'

export interface Batch { readonly label: string; readonly events: readonly GameEvent[] }

/** Per-`ScriptedAction`-arm acceptance telemetry. `attempts` counts every time the
 * generator produced that arm and the driver actually dispatched it (skip, reject or
 * accept all count as an attempt); `accepted` is the subset the engine's real decider
 * accepted. `coverage.test.ts` sums this across every run in a census and asserts a
 * floor per arm, so a generator arm that has quietly gone vacuous fails loudly instead
 * of the rest of the suite passing against a near-empty sample for it. */
export type ArmStats = Readonly<Record<ScriptedAction['kind'], { accepted: number; attempts: number }>>

export interface Trace {
  /** `before[i]` is the state the batch at `batches[i]` was decided against. */
  readonly before: readonly GameState[]
  readonly batches: readonly Batch[]
  readonly events: readonly GameEvent[]
  readonly final: GameState
  /** Acceptance telemetry. `coverage.test.ts` asserts floors on these. */
  readonly accepted: number
  readonly rejected: number
  readonly skipped: number
  /** Per-arm acceptance telemetry; see `ArmStats`. */
  readonly armStats: ArmStats
}

class Run {
  state: GameState
  readonly before: GameState[] = []
  readonly batches: Batch[] = []
  accepted = 0
  rejected = 0
  skipped = 0
  readonly armStats = new Map<ScriptedAction['kind'], { accepted: number; attempts: number }>()

  constructor(state: GameState) { this.state = state }

  submit(label: string, produced: readonly GameEvent[] | Rejection | null): boolean {
    if (produced === null) { this.skipped += 1; return false }
    if (isRejection(produced)) { this.rejected += 1; return false }
    this.before.push(this.state)
    this.batches.push({ label, events: produced })
    this.state = produced.reduce(reduce, this.state)
    this.accepted += 1
    return true
  }

  /** Tallies one `ScriptedAction` arm's outcome, independent of `submit`'s aggregate
   * counters, so `coverage.test.ts` can report and floor each arm individually rather
   * than only the sum across all 24. */
  tallyArm(kind: ScriptedAction['kind'], accepted: boolean): void {
    const entry = this.armStats.get(kind) ?? { accepted: 0, attempts: 0 }
    this.armStats.set(kind, { accepted: entry.accepted + (accepted ? 1 : 0), attempts: entry.attempts + 1 })
  }

  advance(label: string): void {
    this.submit(label, decideSession(this.state, { type: 'advance-phase' }))
  }
}

function threeDistinct(available: readonly DeedId[], offset: number): readonly DeedId[] | null {
  if (available.length < 3) return null
  const start = Math.abs(offset) % available.length
  const out: DeedId[] = []
  for (let k = 0; out.length < 3 && k < available.length; k += 1) {
    const id = available[(start + k) % available.length]
    if (id !== undefined && !out.includes(id)) out.push(id)
  }
  return out.length === 3 ? out : null
}

/**
 * `bidPercents` deliberately samples down to 90% of face (Step 9's design: the tail
 * below 100 exercises BID_BELOW_FACE as a real rejection path). But `resolve-draft-round`
 * requires EVERY player to have submitted before it will resolve at all — one player's
 * scripted below-face bid stalls the whole round, including the three players who bid
 * validly, and with only `DRAFT_ROUNDS` (7) iterations budgeted there is no room to
 * "waste" several on a single stuck round. So a rejected scripted bid gets one retry at
 * exactly face value (capped at the player's cash), which cannot itself fail on
 * BID_BELOW_FACE, before the round moves on. The rejection still counts in
 * `run.rejected` — the coverage floor sees it — but it no longer costs the draft an
 * entire round of forward progress.
 */
function runDraft(run: Run, script: readonly ScriptedDraftRound[]): void {
  for (let r = 0; r < DRAFT_ROUNDS; r += 1) {
    const scripted = script[r]
    run.state.config.turnOrder.forEach((player, i) => {
      const ranked = threeDistinct(availableDeeds(run.state), scripted?.offsets[i] ?? i)
      if (ranked === null) return
      const named: readonly [string, string, string] = [ranked[0] ?? '', ranked[1] ?? '', ranked[2] ?? '']
      const [first] = ranked
      const face = first === undefined ? 0 : run.state.deeds[first]?.faceValue ?? 0
      const pct = scripted?.bidPercents[i] ?? 110
      const ok = run.submit(`draft:${player}`, decideDraft(run.state, {
        type: 'submit-draft', player, ranked: named, maxBid: Math.floor((face * pct) / 100),
      }))
      if (ok) return
      const fallback = Math.min(face, run.state.players[player].cleanCash)
      run.submit(`draft:${player}:retry`, decideDraft(run.state, {
        type: 'submit-draft', player, ranked: named, maxBid: fallback,
      }))
    })
    run.submit('draft:resolve', decideDraft(run.state, { type: 'resolve-draft-round' }))
  }
}

/**
 * Auctions off the front lot of every player awaiting forced liquidation, one lot per
 * iteration (spec 19.8 auctions descending face value one deed at a time), bidding from
 * every other player as a percentage of THEIR OWN clean cash — the driver cannot see the
 * floor price before the auction closes, so it cannot aim a bid at it, which is exactly
 * the "fractions, not dollars" trick applied to a third party's balance. Without this,
 * `playersAwaitingLiquidation` would only ever reach `exhaustLiquidation`'s empty-queue
 * branch and `DeedLiquidated` would never fire — `CreditWrittenDown` is the terminal
 * event in THIS engine's vocabulary (not `DistressedDebtIncurred`, which spec 19.7
 * reserves for the same state but which no context in this codebase actually emits; see
 * `exhaustLiquidation` in `contexts/credit/settlement.ts`).
 */
function runLiquidations(run: Run, round: ScriptedRound): void {
  for (const player of playersAwaitingLiquidation(run.state)) {
    const bidders = run.state.config.turnOrder.filter((p) => p !== player)
    // Bounded well above any real portfolio (28 deeds is the whole board) so a stale
    // read cannot spin forever; each successful bid strictly shrinks the queue.
    for (let guard = 0; guard < 30; guard += 1) {
      const queue = liquidationQueue(run.state, player)
      const deed = queue[0]
      if (deed === undefined) break
      const bids = bidders.map((bidder, i) => ({
        player: bidder,
        amount: amount(run.state.players[bidder].cleanCash, round.liquidationBidPercents[i] ?? 100),
      }))
      const ok = run.submit(`liquidate-lot:${player}:${deed}`, decideCreditAction(run.state, {
        type: 'SettleLiquidationLot', player, deed, bids,
      }))
      if (!ok) break
    }
    run.submit(`liquidate-exhaust:${player}`, exhaustLiquidation(run.state, player))
  }
}

function runRound(run: Run, round: ScriptedRound): void {
  const marker = run.batches.length
  run.advance('market->open')

  // Spec 19.8: forced liquidation resolves at the START of the Open phase, before
  // any other action. Driving it here is the only way a generated history reaches
  // distressed debt or a completed auction.
  runLiquidations(run, round)

  round.actions.forEach((action, i) => {
    const ok = run.submit(`action:${action.kind}`, dispatch(run.state, action, i))
    run.tallyArm(action.kind, ok)
  })

  run.advance('open->movement')
  run.state.config.turnOrder.forEach((player, i) => {
    const dice: DiceRoll = round.rolls[i] ?? [1, 2]
    run.submit(`roll:${player}`, decideBoard(run.state, { type: 'roll-dice', player, dice }))
    if (round.drawCard && i === 0) {
      run.submit('draw-card', decideDeck(run.state, {
        type: 'DrawCard', era: run.state.era, player,
      }))
    }
  })

  run.advance('movement->settlement')
  run.submit('settle', decideSession(run.state, {
    type: 'settle',
    input: {
      auditDice: round.auditDice,
      roundEvents: run.batches.slice(marker).flatMap((b) => b.events),
    },
  }))
  run.advance('settlement->next')
}

export function runScript(script: GameScript): Trace {
  const run = new Run(replay(createGame(script.config)))
  for (const era of [1, 2, 3, 4] as const) {
    run.submit(`shuffle:${era}`, decideDeck(run.state, {
      type: 'ShuffleDeck', era, order: script.shuffles[era],
    }))
  }
  run.advance('setup->draft')
  runDraft(run, script.draft)
  run.advance('draft->market')

  const rounds = script.rounds.slice(0, ECONOMY.TOTAL_ROUNDS)
  for (const round of rounds) {
    if (run.state.phase === 'complete' || run.state.phase === 'scoring') break
    runRound(run, round)
  }

  const armStats = Object.fromEntries(
    ACTION_KINDS.map((kind) => [kind, run.armStats.get(kind) ?? { accepted: 0, attempts: 0 }]),
  ) as ArmStats

  return {
    before: run.before,
    batches: run.batches,
    events: run.batches.flatMap((b) => b.events),
    final: run.state,
    accepted: run.accepted,
    rejected: run.rejected,
    skipped: run.skipped,
    armStats,
  }
}
