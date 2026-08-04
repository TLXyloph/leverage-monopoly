import type { BoardCommand, BoardPorts, PropertyPorts } from '../contexts/board/index.js'
import { decideBoard, decideProperty, type PropertyCommand } from '../contexts/board/index.js'
import type { CreditCommand, CreditPorts } from '../contexts/credit/index.js'
import { decideCredit } from '../contexts/credit/index.js'
import {
  assertDeedTransferable, deedOptionRefund, makeWholeOnMortgage, rentFutureMakeWhole,
} from '../contexts/markets/index.js'
import { decideSession, type SessionCommand } from '../contexts/session/index.js'
import { ventureIncomeFromRent } from '../contexts/underworld/index.js'
import type { Rejection } from './errors.js'
import type { GameEvent } from './events.js'
import type { GameState } from './state.js'

/** The live wiring. Task 20's driver must dispatch through this, not through the default. */
export const MARKET_PORTS: PropertyPorts = { makeWholeOnMortgage, assertDeedTransferable }

/**
 * Spec 19.5's wiring for Escort Service and Chop Shop. `board` emits `RentCharged` and
 * `underworld` turns it into dirty cash for the deed's owner; the two cannot import each
 * other (`board -> underworld -> session -> markets -> board`), so the composition root
 * joins them. `BoardPorts` has no default implementation on purpose — before this, the
 * two rent-driven ventures paid $0 for the whole game because nothing called
 * `ventureIncomeFromRent`, and a defaulted no-op port would have hidden that just as
 * effectively as no call site at all.
 */
export const BOARD_PORTS: BoardPorts = { ventureIncomeFromRent }

export function decideBoardAction(
  state: GameState,
  command: BoardCommand,
): readonly GameEvent[] | Rejection {
  return decideBoard(state, command, BOARD_PORTS)
}

export function decidePropertyAction(
  state: GameState,
  command: PropertyCommand,
): readonly GameEvent[] | Rejection {
  return decideProperty(state, command, MARKET_PORTS)
}

/**
 * `credit`'s own default (`NO_ENCUMBRANCES`) zeroes out both make-whole and refund
 * amounts, which is only safe for tests. This is the real wiring for forced
 * liquidation (spec 19.12) — `credit` cannot import `markets` directly (spec section
 * 14's dependency table runs `markets -> credit`, so the reverse would cycle), which is
 * exactly why `CreditPorts` exists as an injection point. Nothing dispatched liquidation
 * through the real ports before this task; every `SettleLiquidationLot` command reaching
 * `decideCredit` directly got a silent $0 make-whole and refund instead of a rejection,
 * which is the kind of gap that only shows up once an encumbered deed is liquidated.
 */
export const CREDIT_PORTS: CreditPorts = { rentFutureMakeWhole, deedOptionRefund }

export function decideCreditAction(
  state: GameState,
  command: CreditCommand,
): readonly GameEvent[] | Rejection {
  return decideCredit(state, command, CREDIT_PORTS)
}

/**
 * `session`'s Settlement fold (`settle`) and phase clock (`advance-phase`) need no
 * injected ports: `settlement.ts` reaches `credit`, `markets`, `securitization` and
 * `underworld` directly through their own `index.ts` files with no cycle back to
 * `session` (`decks` is the only context that reads `session`, and `decks` is not
 * itself read by any of the four). This wrapper exists only so every command family
 * has a same-shaped `decide*Action` entry point at this composition root, for Task 20's
 * driver to dispatch through uniformly.
 */
export function decideSessionAction(
  state: GameState,
  command: SessionCommand,
): readonly GameEvent[] | Rejection {
  return decideSession(state, command)
}
