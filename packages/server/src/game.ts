import {
  createGame, initialState, isRejection, reduce, replay,
  type GameConfig, type GameEvent, type GameState, type PlayerId, type Rejection,
} from '@leverage/engine'
import { SNAPSHOT_INTERVAL, Store, type CommandRecord, type GameRow } from './db.js'
import { dispatch, isPermitted } from './commands/dispatch.js'
import type { WireCommand } from './commands/schema.js'

/**
 * One live game. Holds the log and the state derived from it, and is the only thing in
 * the process allowed to append.
 *
 * The command loop is spec section 14, verbatim: validate at the boundary (Zod, in
 * `routes`), decide against current state, and either return a Rejection changing
 * nothing or append the events, reduce them in, and broadcast. Nothing between intake
 * and the log may invent a number — the engine is the source of truth for every dollar.
 */

export type Actor =
  | { readonly kind: 'player'; readonly player: PlayerId }
  | { readonly kind: 'admin' }
  | { readonly kind: 'table' }

export type SubmitResult =
  | { readonly ok: true; readonly events: readonly GameEvent[]; readonly length: number }
  | { readonly ok: false; readonly rejection: Rejection }

export type ChangeListener = (room: GameRoom) => void

function forbidden(message: string): Rejection {
  return { rejected: true, code: 'NOT_YOUR_TURN', message }
}

/**
 * A snapshot is a cache, never an authority. It is written only when the JSON round trip
 * is provably lossless for this exact state, so a state that ever grew a field JSON
 * cannot carry degrades to "no snapshot" — slower load — instead of "wrong state".
 * The engine holds no `undefined`-valued fields today; this makes that a checked
 * property rather than an assumption a future card effect could quietly break.
 */
function roundTripsExactly(state: GameState): boolean {
  return JSON.stringify(JSON.parse(JSON.stringify(state))) === JSON.stringify(state)
}

export class GameRoom {
  private events: GameEvent[]
  private current: GameState
  private readonly listeners = new Set<ChangeListener>()

  private constructor(
    readonly row: GameRow,
    private readonly store: Store,
    events: readonly GameEvent[],
    state: GameState,
  ) {
    this.events = [...events]
    this.current = state
  }

  /**
   * Loads from the newest usable snapshot and replays only the tail. With no snapshot it
   * replays the whole log, which is the path every reconnect took before snapshots
   * existed and is still the correctness reference — `tests/replay.test.ts` asserts the
   * two agree.
   */
  static load(store: Store, row: GameRow): GameRoom {
    const events = store.readEvents(row.id)
    const snapshot = store.latestSnapshot(row.id, events.length)
    if (snapshot === null) {
      return new GameRoom(row, store, events, replay(events))
    }
    const state = events
      .slice(snapshot.seq)
      .reduce(reduce, snapshot.state as GameState)
    return new GameRoom(row, store, events, state)
  }

  /** Bootstraps a brand-new game: writes the row and its single `GameCreated` event. */
  static create(store: Store, row: GameRow, config: GameConfig): GameRoom {
    store.createGame(row)
    const events = createGame(config)
    store.appendEvents(row.id, 0, events)
    return new GameRoom(row, store, events, initialState(config))
  }

  get id(): string {
    return this.row.id
  }

  get state(): GameState {
    return this.current
  }

  get log(): readonly GameEvent[] {
    return this.events
  }

  get length(): number {
    return this.events.length
  }

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private announce(): void {
    for (const listener of this.listeners) listener(this)
  }

  /**
   * The whole write path. Synchronous end to end on purpose: four players acting
   * simultaneously in the Open phase land here on the same event-loop turn, and a
   * decide/append pair that cannot be interleaved is what makes "commands are neither
   * lost nor reordered" true by construction rather than by lock.
   */
  submit(command: WireCommand, actor: Actor): SubmitResult {
    if (actor.kind === 'table') {
      return { ok: false, rejection: forbidden('The table view is read-only.') }
    }
    if (actor.kind === 'player' && !isPermitted(command, actor.player)) {
      return {
        ok: false,
        rejection: forbidden(
          `${actor.player} may not submit ${command.type}. Ask the facilitator.`,
        ),
      }
    }
    const outcome = dispatch(this.current, this.events, command)
    if (isRejection(outcome)) return { ok: false, rejection: outcome }
    if (outcome.length === 0) return { ok: true, events: [], length: this.events.length }

    const before = this.events.length
    const length = this.store.appendEvents(this.id, before, outcome)
    this.store.recordCommand(
      this.id, before, command.type,
      actor.kind === 'player' ? actor.player : 'admin', command,
    )
    for (const event of outcome) {
      this.events.push(event)
      this.current = reduce(this.current, event)
    }
    this.maybeSnapshot(before)
    this.announce()
    return { ok: true, events: outcome, length }
  }

  /**
   * Undo, spec section 14: truncate the log and replay. Free because the engine holds no
   * randomness — every value that could have varied is already in the log.
   *
   * Never truncates below 1: `GameCreated` carries the config the state is built from,
   * so a zero-length log is not a game that existed earlier, it is no game at all.
   */
  undo(toLength: number): number {
    const target = Math.max(1, Math.min(toLength, this.events.length))
    if (target === this.events.length) return target
    this.store.truncateEvents(this.id, target)
    this.events = this.events.slice(0, target)
    this.current = replay(this.events)
    this.announce()
    return target
  }

  /**
   * Rewinds the last whole command. The facilitator WILL mistype a die roll — the server
   * brief calls this the most-used admin feature — and a roll emits five or six events,
   * so rewinding by event count would leave a state nobody at the table recognises.
   */
  undoLastCommand(): number {
    const history = this.history()
    const last = history[history.length - 1]
    return this.undo(last === undefined ? 1 : last.seq)
  }

  history(): readonly CommandRecord[] {
    return this.store.readCommands(this.id)
  }

  /**
   * A single command can emit a dozen events — a Settlement emits far more — so the log
   * length regularly JUMPS over a multiple of the interval rather than landing on it.
   * Fires on CROSSING a boundary, not on hitting one; the earlier equality test meant a
   * long game could run to completion having written no snapshot at all.
   */
  private maybeSnapshot(before: number): void {
    const length = this.events.length
    if (Math.floor(length / SNAPSHOT_INTERVAL) <= Math.floor(before / SNAPSHOT_INTERVAL)) return
    if (!roundTripsExactly(this.current)) return
    this.store.putSnapshot(this.id, length, this.current)
  }
}

/** Keeps one `GameRoom` per game id, so every connection sees the same live log. */
export class GameRegistry {
  private readonly rooms = new Map<string, GameRoom>()

  constructor(private readonly store: Store) {}

  get(id: string): GameRoom | null {
    const cached = this.rooms.get(id)
    if (cached !== undefined) return cached
    const row = this.store.findGame(id)
    if (row === null) return null
    const room = GameRoom.load(this.store, row)
    this.rooms.set(id, room)
    return room
  }

  create(row: GameRow, config: GameConfig): GameRoom {
    const room = GameRoom.create(this.store, row, config)
    this.rooms.set(row.id, room)
    return room
  }

  byRoomCode(code: string): GameRoom | null {
    const match = this.store.listGames().find((g) => g.roomCode === code.toUpperCase())
    return match === undefined ? null : this.get(match.id)
  }
}
