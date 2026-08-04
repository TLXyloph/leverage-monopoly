import { GROUP_MEMBERS } from '../../config/board.js'
import { ECONOMY } from '../../config/economy.js'
import { floorPercent } from '../../core/money.js'
import type { GameState } from '../../core/state.js'
import type { ColorGroup, Money, PlayerId } from '../../core/types.js'
import type { PlayerMetric, PlayerPredicate } from './effects.js'
import { borrowingBase, deedsOwnedBy, peerLoanInterestDue } from '../credit/index.js'
import { ownsWholeGroup } from '../board/index.js'

const HOTEL = 5

/**
 * A local, conservative net-worth approximation. Task 19 owns the canonical
 * `netWorth` (spec section 12) and this engine does not yet expose it, so — per the
 * brief's explicit fallback instruction — `decks` defines the minimal metric it needs
 * here rather than blocking on a context that does not exist. Clean cash, plus deed
 * equity (unmortgaged face in full, mortgaged face net of the standing mortgage), plus
 * building cost, minus drawn credit and distressed debt. Dirty cash is deliberately
 * excluded: era-decks.md states it is worth $0 at scoring.
 */
function localNetWorth(state: GameState, p: PlayerId): Money {
  const player = state.players[p]
  const deeds = deedsOwnedBy(state, p)
  const equity = deeds.reduce((sum, d) => {
    const buildings = d.houses * d.houseCost
    if (d.mortgaged) return sum + floorPercent(d.faceValue, 1 - ECONOMY.MORTGAGE_RATE) + buildings
    return sum + d.faceValue + buildings
  }, 0)
  return player.cleanCash + equity - player.drawnCredit - player.distressedDebt
}

function bestGroup(state: GameState, p: PlayerId): { buildings: number; face: Money } {
  let best = { buildings: -1, face: 0 }
  for (const group of Object.keys(GROUP_MEMBERS) as ColorGroup[]) {
    if (!ownsWholeGroup(state, group, p)) continue
    const inGroup = GROUP_MEMBERS[group]
      .map((id) => state.deeds[id])
      .filter((d): d is NonNullable<typeof d> => d !== undefined)
    const buildings = inGroup.reduce((t, d) => t + d.houses, 0)
    const face = inGroup.reduce((t, d) => t + d.faceValue, 0)
    if (buildings > best.buildings || (buildings === best.buildings && face > best.face)) {
      best = { buildings, face }
    }
  }
  return best.buildings < 0 ? { buildings: 0, face: 0 } : best
}

function completeGroupCount(state: GameState, p: PlayerId): number {
  return (Object.keys(GROUP_MEMBERS) as ColorGroup[])
    .filter((group) => ownsWholeGroup(state, group, p)).length
}

export function evalMetric(state: GameState, p: PlayerId, m: PlayerMetric): number {
  const player = state.players[p]
  const deeds = deedsOwnedBy(state, p)
  const live = deeds.filter((d) => !d.mortgaged)
  const face = (xs: readonly { faceValue: Money }[]): Money =>
    xs.reduce((t, d) => t + d.faceValue, 0)

  switch (m) {
    case 'one': return 1
    case 'clean-cash': return player.cleanCash
    case 'dirty-cash': return player.dirtyCash
    case 'heat': return player.heat
    case 'net-worth': return localNetWorth(state, p)
    case 'drawn-credit': return player.drawnCredit
    case 'borrowing-base': return borrowingBase(state, p)
    case 'drawn-to-base-ratio': {
      const base = borrowingBase(state, p)
      if (base > 0) return player.drawnCredit / base
      return player.drawnCredit > 0 ? Number.POSITIVE_INFINITY : 0
    }
    case 'distressed-debt': return player.distressedDebt
    case 'total-obligations':
      return player.drawnCredit
        + evalMetric(state, p, 'peer-principal-borrowed')
        + evalMetric(state, p, 'cds-notional-written')
        + player.distressedDebt
    case 'deed-count': return deeds.length
    case 'unmortgaged-deed-count': return live.length
    case 'mortgaged-deed-count': return deeds.length - live.length
    case 'deed-face-value': return face(deeds)
    case 'unmortgaged-face-value': return face(live)
    case 'mortgaged-face-value': return face(deeds.filter((d) => d.mortgaged))
    case 'railroad-count': return deeds.filter((d) => d.group === 'railroad').length
    case 'utility-count': return deeds.filter((d) => d.group === 'utility').length
    case 'house-count':
      return deeds.reduce((t, d) => t + (d.houses === HOTEL ? 0 : d.houses), 0)
    case 'hotel-count':
      return deeds.filter((d) => d.houses === HOTEL).length
    case 'building-count':
      return deeds.reduce((t, d) => t + d.houses, 0)
    case 'complete-group-count':
      return completeGroupCount(state, p)
    case 'best-group-buildings':
      return bestGroup(state, p).buildings
    case 'best-group-face-value':
      return bestGroup(state, p).face
    case 'active-venture-count': return player.ventures.length
    case 'peer-principal-lent':
      return state.loans
        .filter((l) => l.lender === p && l.status === 'active')
        .reduce((t, l) => t + l.outstanding, 0)
    case 'peer-note-count':
      return state.loans.filter((l) => l.lender === p && l.status === 'active').length
    case 'peer-principal-borrowed':
      return state.loans
        .filter((l) => l.borrower === p && l.status === 'active')
        .reduce((t, l) => t + l.outstanding, 0)
    case 'peer-max-rate':
      return state.loans
        .filter((l) => l.borrower === p && l.status === 'active')
        .reduce((t, l) => Math.max(t, l.ratePerRound), 0)
    case 'peer-interest-due-per-round':
      return state.loans
        .filter((l) => l.borrower === p && l.status === 'active')
        .reduce((t, l) => t + peerLoanInterestDue(l), 0)
    case 'cds-notional-written':
      return state.swaps
        .filter((s) => s.seller === p && s.status === 'active')
        .reduce((t, s) => t + s.notional, 0)
    case 'rent-received-this-era':
      return state.cardEffects.counters.rentReceivedThisEra[p] ?? 0
    case 'rent-received-this-game':
      return state.cardEffects.counters.rentReceivedThisGame[p] ?? 0
    case 'dirty-actions-this-game':
      return state.cardEffects.counters.dirtyActionsThisGame[p] ?? 0
    case 'launder-count-this-game':
      return state.cardEffects.counters.launderCountThisGame[p] ?? 0
  }
}

export function testPredicate(state: GameState, p: PlayerId, pred: PlayerPredicate): boolean {
  switch (pred.kind) {
    case 'always': return true
    case 'metric-at-least': return evalMetric(state, p, pred.metric) >= pred.value
    case 'metric-at-most': return evalMetric(state, p, pred.metric) <= pred.value
    case 'metric-above': return evalMetric(state, p, pred.metric) > pred.value
    case 'all-of': return pred.of.every((q) => testPredicate(state, p, q))
  }
}
