import {
  CARD_SQUARES, PLAYER_IDS, deckFor, type Era, type GameState, type PlayerId,
} from '@leverage/engine'
import type { Harness } from './harness.js'
import type { Sync } from '../src/views.js'

/**
 * Drives a whole game over the real HTTP surface, the way the facilitator console will.
 *
 * Every value that could vary — dice, shuffle order, audit rolls — is passed in, because
 * the engine generates none of them. That is what makes a scripted game assert exact
 * final net worths instead of statistical ranges, and it is the single reason a test
 * suite of this ambition is realistic at all.
 */

/**
 * A mutable pair, deliberately. The engine's `DiceRoll` is `readonly [number, number]`
 * and a mutable tuple assigns INTO it, but not the other way round — so the scripts that
 * build dice locally use the mutable form and hand it to both the wire schema and the
 * engine without a cast anywhere.
 */
export type Dice = [number, number]

export type Rolls = Readonly<Record<PlayerId, Dice>>

export async function readState(h: Harness, token?: string): Promise<GameState> {
  const { body } = await h.get(`/api/game/${h.gameId}/state`, token ?? h.tokens.admin)
  return (body as Sync).state
}

export async function readSync(h: Harness, token?: string): Promise<Sync> {
  const { body } = await h.get(`/api/game/${h.gameId}/state`, token ?? h.tokens.admin)
  return body as Sync
}

/** Identity order: the deck plays in authored order, so a scripted game is reproducible. */
export async function shuffleAllDecks(h: Harness): Promise<void> {
  for (const era of [1, 2, 3, 4] as const) {
    await h.must({
      type: 'ShuffleDeck', era,
      order: Array.from({ length: deckFor(era).length }, (_, i) => i),
    })
  }
}

function availableDeedIds(state: GameState): readonly string[] {
  return Object.values(state.deeds)
    .filter((d) => d.owner === null)
    .sort((a, b) => a.faceValue - b.faceValue || a.square - b.square)
    .map((d) => d.id)
}

/**
 * One draft round with no deliberate contests: each player's triple is a rotation of the
 * cheapest available deeds, so every first choice is distinct while the seventh round —
 * where only four deeds remain — still yields three distinct picks per player.
 */
export async function submitDraftRound(h: Harness): Promise<void> {
  const state = await readState(h)
  const available = availableDeedIds(state)
  for (const [index, player] of PLAYER_IDS.entries()) {
    const ranked = [0, 1, 2].map((offset) => available[(index + offset) % available.length])
    const [first, second, third] = ranked
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error('fewer than three deeds remain; the draft cannot be scripted')
    }
    await h.must({
      type: 'submit-draft', player, ranked: [first, second, third],
      maxBid: state.deeds[first]?.faceValue ?? 0,
    }, h.tokens.players[player])
  }
  await h.must({ type: 'resolve-draft-round' })
}

/** Setup through to the Market phase of round 1, with all 28 deeds allocated. */
export async function runDraft(h: Harness): Promise<void> {
  await shuffleAllDecks(h)
  await h.must({ type: 'advance-phase' })
  for (let round = 0; round < 7; round += 1) await submitDraftRound(h)
  await h.must({ type: 'advance-phase' })
}

export async function advanceTo(
  h: Harness, phase: 'open' | 'movement' | 'settlement',
): Promise<void> {
  for (let guard = 0; guard < 6; guard += 1) {
    const state = await readState(h)
    if (state.phase === phase) return
    await h.must({ type: 'advance-phase' })
  }
  throw new Error(`could not reach the ${phase} phase`)
}

/**
 * One movement phase: every player rolls in turn order, and a token resting on a card
 * square draws from the current era's deck — the facilitator's job at the table, and the
 * only way the deck path is ever exercised.
 */
export async function runMovement(h: Harness, rolls: Rolls, drawCards = true): Promise<void> {
  for (const player of PLAYER_IDS) {
    const dice = rolls[player]
    await h.must({ type: 'roll-dice', player, dice }, h.tokens.players[player])
    if (!drawCards) continue
    const state = await readState(h)
    if (!CARD_SQUARES.includes(state.players[player].position)) continue
    const deck = state.decks[state.era]
    if (deck.order.length === 0 || deck.drawn >= deck.order.length) continue
    await h.must({ type: 'DrawCard', era: state.era as Era, player })
  }
}

export async function runSettlement(
  h: Harness, auditDice: AuditDice = NEVER_AUDITED,
): Promise<void> {
  await advanceTo(h, 'settlement')
  await h.must({ type: 'settle', auditDice })
}

/**
 * Market through Settlement, then the clock forward. Audit dice are supplied for every
 * player carrying Heat, because a Settlement missing a required roll rejects outright.
 */
export async function playRound(
  h: Harness,
  rolls: Rolls,
  options: { auditDice?: Partial<AuditDice>; drawCards?: boolean } = {},
): Promise<void> {
  await advanceTo(h, 'movement')
  await runMovement(h, rolls, options.drawCards ?? true)
  await runSettlement(h, { ...NEVER_AUDITED, ...options.auditDice })
  await h.must({ type: 'advance-phase' })
}

export type AuditDice = Readonly<Record<PlayerId, Dice>>

/**
 * A losing roll for every player. Audits fire on a 2d6 total AT OR BELOW Heat, so 12 is
 * the roll that can never audit — supplied for all four players so a Settlement can
 * never reject for a missing roll, and so a test that wants an audit has to ask for one
 * explicitly rather than receiving one by accident.
 */
export const NEVER_AUDITED: AuditDice = {
  P1: [6, 6], P2: [6, 6], P3: [6, 6], P4: [6, 6],
}

export const SAFE_ROLLS: Rolls = { P1: [1, 2], P2: [1, 2], P3: [1, 2], P4: [1, 2] }

/**
 * The 2d6 that walks a token from `from` to `to`, or null when the distance is not
 * reachable in one roll. Doubles are avoided where an alternative split exists, so a
 * scripted landing cannot accidentally grant an extra roll or a third-double jailing.
 */
export function diceToReach(from: number, to: number): Dice | null {
  const delta = ((to - from) % 40 + 40) % 40
  if (delta < 2 || delta > 12) return null
  const splits: Dice[] = []
  for (let a = 1; a <= 6; a += 1) {
    const b = delta - a
    if (b >= 1 && b <= 6) splits.push([a, b])
  }
  return splits.find(([a, b]) => a !== b) ?? splits[0] ?? null
}

/**
 * Walks `player` onto `deed`, taking a filler roll first when the deed is out of range.
 * Landing on a chosen square is what makes "rent was charged and routed to the futures
 * holder" a scripted assertion rather than something a test waits for by luck.
 */
export async function landOn(h: Harness, player: PlayerId, deed: string): Promise<void> {
  const target = (await readState(h)).deeds[deed]?.square
  if (target === undefined) throw new Error(`no deed called ${deed}`)
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const state = await readState(h)
    const dice = diceToReach(state.players[player].position, target)
    if (dice !== null) {
      await h.must({ type: 'roll-dice', player, dice }, h.tokens.players[player])
      return
    }
    await h.must({ type: 'roll-dice', player, dice: [6, 1] }, h.tokens.players[player])
  }
  throw new Error(`could not walk ${player} onto ${deed}`)
}
