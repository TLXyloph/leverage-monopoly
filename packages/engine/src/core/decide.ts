import type { PropertyPorts } from '../contexts/board/index.js'
import { decideProperty, type PropertyCommand } from '../contexts/board/index.js'
import { assertDeedTransferable, makeWholeOnMortgage } from '../contexts/markets/index.js'
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
