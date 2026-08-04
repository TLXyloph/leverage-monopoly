import { ECONOMY } from '../../config/economy.js'
import type { ContractId, DeedId, Money, PlayerId, RoundNumber } from '../../core/types.js'
import type { GameState } from '../../core/state.js'
import type { GameEvent } from '../../core/events.js'
import { type Rejection, reject } from '../../core/errors.js'
import { outstandingOption } from './selectors.js'

export interface WriteDeedOption {
  readonly type: 'WriteDeedOption'
  readonly player: PlayerId
  readonly deed: DeedId
  readonly holder: PlayerId
  readonly premium: Money
  readonly strike: Money
  readonly expiry: RoundNumber
}

export interface SellDeedOption {
  readonly type: 'SellDeedOption'
  readonly player: PlayerId
  readonly contract: ContractId
  readonly to: PlayerId
  readonly price: Money
}

export interface ExerciseDeedOption {
  readonly type: 'ExerciseDeedOption'
  readonly player: PlayerId
  readonly contract: ContractId
}

export type DeedOptionCommand = WriteDeedOption | SellDeedOption | ExerciseDeedOption

/**
 * Deterministic identity. (deed, writer, expiry) is unique: a deed carries at most
 * one outstanding option, and a replacement can only be written once the previous
 * one has lapsed or been exercised, by which point the current round already
 * exceeds the lapsed option's expiry.
 */
export function deedOptionId(
  deed: DeedId, writer: PlayerId, expiry: RoundNumber,
): ContractId {
  return `do:${deed}:${writer}:${expiry}`
}

/**
 * Spec section 9 unlocks deed options in Era III. `markets`' sanctioned dependency set
 * (spec section 14) is `board` and `credit`, not `session`, so the unlock table is read
 * straight off `ECONOMY.UNLOCK_ERA` rather than through `session`'s `isUnlocked` — the
 * same resolution `decide.ts` uses for rent futures and `credit/decide-loans.ts` uses
 * for peer loans.
 */
function locked(state: GameState): boolean {
  return state.config.unlockMode !== 'all' && state.era < ECONOMY.UNLOCK_ERA['deed-option']
}

function decideWrite(
  state: GameState, cmd: WriteDeedOption,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Deed options can only be written during an Open phase.')
  }
  if (locked(state)) {
    return reject(
      'INSTRUMENT_LOCKED_THIS_ERA',
      `Deed options unlock in Era ${ECONOMY.UNLOCK_ERA['deed-option']}.`,
    )
  }
  const deed = state.deeds[cmd.deed]
  if (deed === undefined) {
    return reject('DEED_UNAVAILABLE', `There is no deed called ${cmd.deed}.`)
  }
  if (deed.owner !== cmd.player) {
    return reject('NOT_OWNER', 'Only the owner of a deed may write an option on it.')
  }
  if (outstandingOption(state, cmd.deed) !== null) {
    return reject('DEED_ENCUMBERED', 'This deed already has an outstanding option.')
  }
  if (cmd.holder === cmd.player) {
    return reject('SELF_DEALING', 'A deed option must be written to another player.')
  }
  if (cmd.expiry < state.round || cmd.expiry > ECONOMY.TOTAL_ROUNDS) {
    return reject(
      'INVALID_WINDOW',
      `Expiry must fall between round ${state.round} and round ${ECONOMY.TOTAL_ROUNDS}.`,
    )
  }
  if (cmd.premium < 0 || cmd.strike < 0) {
    return reject('NEGATIVE_AMOUNT', 'Premium and strike cannot be negative.')
  }
  if (state.players[cmd.holder].cleanCash < cmd.premium) {
    return reject(
      'INSUFFICIENT_CLEAN_CASH',
      `${cmd.holder} cannot cover a premium of $${cmd.premium}.`,
    )
  }
  const id = deedOptionId(cmd.deed, cmd.player, cmd.expiry)
  if (state.options.some((o) => o.id === id)) {
    return reject('DUPLICATE_CONTRACT_ID', 'An option with this identity already exists.')
  }
  return [{
    type: 'DeedOptionWritten',
    id,
    deed: cmd.deed,
    writer: cmd.player,
    holder: cmd.holder,
    premium: cmd.premium,
    strike: cmd.strike,
    expiry: cmd.expiry,
  }]
}

function decideSell(
  state: GameState, cmd: SellDeedOption,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'Deed options can only be resold during an Open phase.')
  }
  if (locked(state)) {
    return reject(
      'INSTRUMENT_LOCKED_THIS_ERA',
      `Deed options unlock in Era ${ECONOMY.UNLOCK_ERA['deed-option']}.`,
    )
  }
  const o = state.options.find((x) => x.id === cmd.contract)
  if (o === undefined) {
    return reject('CONTRACT_NOT_FOUND', 'That deed option is no longer outstanding.')
  }
  if (o.holder !== cmd.player) {
    return reject('NOT_ASSET_OWNER', 'Only the holder of a deed option may resell it.')
  }
  if (cmd.to === cmd.player) {
    return reject('SELF_DEALING', 'A deed option must be sold to another player.')
  }
  if (cmd.price < 0) {
    return reject('NEGATIVE_AMOUNT', 'The price cannot be negative.')
  }
  if (state.players[cmd.to].cleanCash < cmd.price) {
    return reject('INSUFFICIENT_CLEAN_CASH', `${cmd.to} cannot cover a price of $${cmd.price}.`)
  }
  return [{
    type: 'DeedOptionSold', id: o.id, from: cmd.player, to: cmd.to, price: cmd.price,
  }]
}

function decideExercise(
  state: GameState, cmd: ExerciseDeedOption,
): readonly GameEvent[] | Rejection {
  if (state.phase !== 'open') {
    return reject('WRONG_PHASE', 'A deed option can only be exercised during an Open phase.')
  }
  const o = state.options.find((x) => x.id === cmd.contract)
  if (o === undefined) {
    return reject('CONTRACT_NOT_FOUND', 'That deed option is no longer outstanding.')
  }
  if (o.holder !== cmd.player) {
    return reject('NOT_ASSET_OWNER', 'Only the holder of a deed option may exercise it.')
  }
  if (state.round > o.expiry) {
    return reject('CONTRACT_NOT_FOUND', 'That deed option has expired.')
  }
  const deed = state.deeds[o.deed]
  if (deed === undefined || deed.owner !== o.writer) {
    return reject('NOT_OWNER', 'The writer no longer owns the underlying deed.')
  }
  if (state.players[cmd.player].cleanCash < o.strike) {
    return reject(
      'INSUFFICIENT_CLEAN_CASH',
      `Exercising costs the $${o.strike} strike and ${cmd.player} cannot cover it.`,
    )
  }
  return [{ type: 'DeedOptionExercised', id: o.id, strikePaid: o.strike }]
}

export function decideDeedOptions(
  state: GameState, cmd: DeedOptionCommand,
): readonly GameEvent[] | Rejection {
  switch (cmd.type) {
    case 'WriteDeedOption': return decideWrite(state, cmd)
    case 'SellDeedOption': return decideSell(state, cmd)
    case 'ExerciseDeedOption': return decideExercise(state, cmd)
  }
}

/** Settlement step 11, spec 19.1. Deed options reaching expiry lapse unexercised. */
export function lapseDeedOptions(state: GameState): readonly GameEvent[] {
  return state.options
    .filter((o) => o.expiry <= state.round)
    .map((o): GameEvent => ({ type: 'DeedOptionExpired', id: o.id }))
}
