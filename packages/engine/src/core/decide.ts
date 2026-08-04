import type { PropertyPorts } from '../contexts/board/index.js'
import { decideProperty, type PropertyCommand } from '../contexts/board/index.js'
import type { CreditCommand, CreditPorts } from '../contexts/credit/index.js'
import { decideCredit } from '../contexts/credit/index.js'
import {
  assertDeedTransferable, deedOptionRefund, makeWholeOnMortgage, rentFutureMakeWhole,
} from '../contexts/markets/index.js'
import { decideSession, type SessionCommand } from '../contexts/session/index.js'
import type { Rejection } from './errors.js'
import type { GameEvent } from './events.js'
import type { GameState } from './state.js'

/** The live wiring. Task 20's driver must dispatch through this, not through the default. */
export const MARKET_PORTS: PropertyPorts = { makeWholeOnMortgage, assertDeedTransferable }

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
