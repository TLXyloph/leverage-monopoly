import type { DraftSubmission, GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import type { DeedId, Money, PlayerId } from '../../core/types.js'
import { availableDeeds, faceValueAcquired, turnIndex } from './selectors.js'

interface Allocation {
  readonly player: PlayerId
  readonly deed: DeedId
  readonly price: Money
  readonly contested: boolean
}

/**
 * The collision algorithm for one draft round. Spec section 3, applied in
 * this exact order:
 *
 *   7. A player whose cash cannot cover even the cheapest remaining deed's
 *      face value has no legal triple to submit (`decideDraft` guarantees
 *      resolution never proceeds while such a player still could have
 *      submitted), so they take the cheapest remaining deed for free. This
 *      runs first, in turn order, so "cheapest remaining" stays well
 *      defined for every rule that follows.
 *   1. A deed nominated first by exactly one submitter goes to them at face
 *      value.
 *   2. A deed nominated first by two or more goes to the highest bidder,
 *      who pays their OWN bid (first-price, not second-price).
 *   3. Bid ties break to whoever has acquired less total face value so
 *      far, then to earlier turn order.
 *   4. Losers of a first-choice contest cascade to their 2nd choice, then
 *      3rd, acquiring at face value if the deed is still free.
 *   5. Two cascading players landing on the same deed: lower total face
 *      value acquired so far takes it (same tie-break as rule 3).
 *   6. A player whose three ranked choices are all gone gets the cheapest
 *      remaining deed at face value, funds permitting -- otherwise rule 7
 *      applies again.
 *
 * "Total face value acquired so far" is read from `faceValueAcquired`
 * against the state passed in, snapshotted once before any award below, so
 * resolution never depends on the order deeds happen to be awarded in.
 * Likewise every affordability check reads the player's ORIGINAL
 * `cleanCash`: nothing here calls `reduce`, and a player receives at most
 * one deed per round, so the input state's cash is exactly what they have
 * to spend this round regardless of allocation order.
 */
export function resolveDraftRound(state: GameState): readonly GameEvent[] {
  const draft = state.draft
  if (draft === null) return []

  const order = state.config.turnOrder
  const acquiredAtStart = new Map<PlayerId, Money>(
    order.map((player) => [player, faceValueAcquired(state, player)]),
  )
  const submissions = new Map<PlayerId, DraftSubmission>(
    draft.submissions.map((submission) => [submission.player, submission]),
  )
  const available = new Set<DeedId>(availableDeeds(state))
  const allocations: Allocation[] = []

  const faceAcquired = (player: PlayerId): Money => acquiredAtStart.get(player) ?? 0
  const seat = (player: PlayerId): number => turnIndex(state, player)
  const faceValueOf = (deed: DeedId): Money => state.deeds[deed]?.faceValue ?? 0
  const squareOf = (deed: DeedId): number => state.deeds[deed]?.square ?? 0
  const bidOf = (player: PlayerId): Money => submissions.get(player)?.maxBid ?? 0

  const cheapestRemaining = (): DeedId | null => {
    let best: DeedId | null = null
    for (const deed of available) {
      if (best === null || faceValueOf(deed) < faceValueOf(best)
        || (faceValueOf(deed) === faceValueOf(best) && squareOf(deed) < squareOf(best))) {
        best = deed
      }
    }
    return best
  }

  const award = (player: PlayerId, deed: DeedId, price: Money, contested: boolean): void => {
    allocations.push({ player, deed, price, contested })
    available.delete(deed)
  }

  // --- Rule 7, first: a non-submitter gets the cheapest remaining deed free. ---
  for (const player of order) {
    if (submissions.has(player)) continue
    const floor = cheapestRemaining()
    if (floor === null) continue
    award(player, floor, 0, false)
  }

  // --- Rules 1 and 2: first-choice contests among everyone who submitted. ---
  const choiceIndex = new Map<PlayerId, number>(order.map((player) => [player, 0]))
  const cascading: PlayerId[] = []
  const firstChoiceGroups = new Map<DeedId, PlayerId[]>()
  for (const player of order) {
    const submission = submissions.get(player)
    if (submission === undefined) continue
    const target = submission.ranked[0]
    // Defensive: rule 7 can only have consumed this deed if it was the single
    // cheapest remaining AND this player's first choice, which submission
    // validation does not otherwise prevent. Treat it as an immediate loss
    // rather than double-awarding the deed.
    if (!available.has(target)) {
      cascading.push(player)
      continue
    }
    const group = firstChoiceGroups.get(target)
    if (group === undefined) firstChoiceGroups.set(target, [player])
    else group.push(player)
  }

  for (const [deed, group] of firstChoiceGroups) {
    const winner = pickHighestBid(group, bidOf, faceAcquired, seat)
    const contested = group.length > 1
    award(winner, deed, contested ? bidOf(winner) : faceValueOf(deed), contested)
    for (const loser of group) {
      if (loser !== winner) cascading.push(loser)
    }
  }

  // --- Rules 3, 4 and 5: cascade to the 2nd choice, then the 3rd. ---
  const exhausted: PlayerId[] = []
  let wave = order.filter((player) => cascading.includes(player))
  while (wave.length > 0) {
    const targets = new Map<DeedId, PlayerId[]>()
    const stillExhausted: PlayerId[] = []
    for (const player of wave) {
      const submission = submissions.get(player)
      const from = (choiceIndex.get(player) ?? 0) + 1
      const next = submission === undefined
        ? null
        : nextAvailableChoice(submission.ranked, from, available)
      if (next === null) {
        stillExhausted.push(player)
        continue
      }
      choiceIndex.set(player, next.index)
      const group = targets.get(next.deed)
      if (group === undefined) targets.set(next.deed, [player])
      else group.push(player)
    }

    const next: PlayerId[] = []
    for (const [deed, group] of targets) {
      const winner = [...group].sort((a, b) =>
        faceAcquired(a) - faceAcquired(b) || seat(a) - seat(b))[0] as PlayerId
      award(winner, deed, faceValueOf(deed), false)
      for (const loser of group) {
        if (loser !== winner) next.push(loser)
      }
    }
    exhausted.push(...stillExhausted)
    wave = order.filter((player) => next.includes(player))
  }

  // --- Rule 6: all three choices gone -- cheapest remaining, funds permitting. ---
  const stragglers = [...exhausted].sort((a, b) =>
    faceAcquired(a) - faceAcquired(b) || seat(a) - seat(b))
  for (const player of stragglers) {
    const deed = cheapestRemaining()
    if (deed === null) break
    const price = state.players[player].cleanCash >= faceValueOf(deed) ? faceValueOf(deed) : 0
    award(player, deed, price, false)
  }

  const events: GameEvent[] = allocations
    .sort((a, b) => seat(a.player) - seat(b.player))
    .map((allocation) => ({
      type: 'DraftDeedAwarded',
      player: allocation.player,
      deed: allocation.deed,
      price: allocation.price,
      contested: allocation.contested,
    }))
  events.push({ type: 'DraftRoundResolved', round: draft.round })
  return events
}

/** Rule 2's winner, and rule 3's tie-break: highest bid, then lower face acquired, then seat. */
function pickHighestBid(
  players: readonly PlayerId[],
  bidOf: (player: PlayerId) => Money,
  faceAcquired: (player: PlayerId) => Money,
  seat: (player: PlayerId) => number,
): PlayerId {
  return [...players].sort((a, b) =>
    bidOf(b) - bidOf(a) || faceAcquired(a) - faceAcquired(b) || seat(a) - seat(b))[0] as PlayerId
}

/** The first still-available deed at or after `fromIndex` in a submitter's ranked triple. */
function nextAvailableChoice(
  ranked: readonly [DeedId, DeedId, DeedId],
  fromIndex: number,
  available: ReadonlySet<DeedId>,
): { readonly index: number; readonly deed: DeedId } | null {
  for (let index = fromIndex; index < 3; index += 1) {
    const deed = ranked[index]
    if (deed !== undefined && available.has(deed)) return { index, deed }
  }
  return null
}
