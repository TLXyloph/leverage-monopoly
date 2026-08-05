import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import type { GameEvent } from '@leverage/engine'

/**
 * The event log IS the database (spec section 14). Two tables carry the game:
 * `events` is append-only and authoritative, `snapshots` is a pure cache that can be
 * deleted at any time without losing a dollar. Everything else is metadata.
 *
 * Undo is `truncate(gameId, n)` — delete the tail and replay — which is the whole
 * reason event sourcing was chosen. It only works because the engine generates no
 * randomness: replaying the same log always produces the same state.
 */

export interface CommandRecord {
  /** The log length BEFORE this command's events, so undoing to it un-does exactly it. */
  readonly seq: number
  readonly type: string
  readonly actor: string
  readonly body: unknown
}

export interface GameRow {
  readonly id: string
  readonly roomCode: string
  readonly createdAt: string
  readonly label: string
}

/** How many appended events pass before a snapshot is written. */
export const SNAPSHOT_INTERVAL = 50

interface EventRow { readonly payload: string }
interface SnapshotRow { readonly seq: number; readonly state: string }
interface MetaRow { readonly value: string }
interface CountRow { readonly n: number }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
  id         TEXT PRIMARY KEY,
  room_code  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  label      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  game_id TEXT NOT NULL,
  seq     INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (game_id, seq)
);
CREATE TABLE IF NOT EXISTS snapshots (
  game_id TEXT NOT NULL,
  seq     INTEGER NOT NULL,
  state   TEXT NOT NULL,
  PRIMARY KEY (game_id, seq)
);
CREATE TABLE IF NOT EXISTS commands (
  game_id TEXT NOT NULL,
  seq     INTEGER NOT NULL,
  type    TEXT NOT NULL,
  actor   TEXT NOT NULL,
  body    TEXT NOT NULL,
  PRIMARY KEY (game_id, seq)
);
`

export class Store {
  private readonly db: Database.Database

  constructor(file: string) {
    // better-sqlite3 refuses a path whose directory does not exist, which turns
    // `LEVERAGE_DB=~/games/tonight.db` into a crash on the one night it matters.
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
    this.db = new Database(file)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.exec(SCHEMA)
  }

  /**
   * The HMAC key that signs player tokens, minted once and persisted. Persisted
   * rather than regenerated at boot because a restart must not invalidate the QR
   * code taped to the table — a player who reloads mid-game has to land back in
   * their own view, not a 401.
   */
  secret(): string {
    const row = this.db.prepare<[string], MetaRow>('SELECT value FROM meta WHERE key = ?')
      .get('token_secret')
    if (row !== undefined) return row.value
    const fresh = randomBytes(32).toString('hex')
    this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('token_secret', fresh)
    return fresh
  }

  createGame(row: GameRow): void {
    this.db
      .prepare('INSERT INTO games (id, room_code, created_at, label) VALUES (?, ?, ?, ?)')
      .run(row.id, row.roomCode, row.createdAt, row.label)
  }

  findGame(id: string): GameRow | null {
    const row = this.db
      .prepare<[string], { id: string; room_code: string; created_at: string; label: string }>(
        'SELECT id, room_code, created_at, label FROM games WHERE id = ?',
      )
      .get(id)
    if (row === undefined) return null
    return { id: row.id, roomCode: row.room_code, createdAt: row.created_at, label: row.label }
  }

  listGames(): readonly GameRow[] {
    return this.db
      .prepare<[], { id: string; room_code: string; created_at: string; label: string }>(
        'SELECT id, room_code, created_at, label FROM games ORDER BY created_at DESC',
      )
      .all()
      .map((r) => ({ id: r.id, roomCode: r.room_code, createdAt: r.created_at, label: r.label }))
  }

  eventCount(gameId: string): number {
    const row = this.db
      .prepare<[string], CountRow>('SELECT COUNT(*) AS n FROM events WHERE game_id = ?')
      .get(gameId)
    return row?.n ?? 0
  }

  /**
   * Appends in one transaction. `expectedSeq` is the log length the caller decided
   * against; a mismatch means another writer got there first and the whole batch is
   * refused rather than interleaved. Four players acting simultaneously in the Open
   * phase is the normal case, so this is the ordinary path, not an edge case.
   */
  appendEvents(gameId: string, expectedSeq: number, events: readonly GameEvent[]): number {
    const insert = this.db.prepare(
      'INSERT INTO events (game_id, seq, payload) VALUES (?, ?, ?)',
    )
    const run = this.db.transaction((): number => {
      const current = this.eventCount(gameId)
      if (current !== expectedSeq) {
        throw new ConcurrentWriteError(expectedSeq, current)
      }
      events.forEach((event, offset) => {
        insert.run(gameId, current + offset, JSON.stringify(event))
      })
      return current + events.length
    })
    return run()
  }

  readEvents(gameId: string, fromSeq = 0): readonly GameEvent[] {
    return this.db
      .prepare<[string, number], EventRow>(
        'SELECT payload FROM events WHERE game_id = ? AND seq >= ? ORDER BY seq ASC',
      )
      .all(gameId, fromSeq)
      .map((r) => JSON.parse(r.payload) as GameEvent)
  }

  /**
   * The command that produced the events starting at `seq`. Kept so the admin console
   * can show what happened in the words the table used ("P3 mortgaged Illinois Avenue")
   * rather than in events, and so "undo the last thing" can rewind a whole command — a
   * dice roll emits five or six events, and rewinding one of them leaves a state nobody
   * at the table would recognise.
   */
  recordCommand(gameId: string, seq: number, type: string, actor: string, body: unknown): void {
    this.db
      .prepare('INSERT OR REPLACE INTO commands (game_id, seq, type, actor, body) VALUES (?, ?, ?, ?, ?)')
      .run(gameId, seq, type, actor, JSON.stringify(body))
  }

  readCommands(gameId: string): readonly CommandRecord[] {
    return this.db
      .prepare<[string], { seq: number; type: string; actor: string; body: string }>(
        'SELECT seq, type, actor, body FROM commands WHERE game_id = ? ORDER BY seq ASC',
      )
      .all(gameId)
      .map((r) => ({ seq: r.seq, type: r.type, actor: r.actor, body: JSON.parse(r.body) as unknown }))
  }

  /**
   * Undo. Drops every event from `length` onward, and every snapshot taken at or
   * after that point — a snapshot of a future that no longer happened would
   * otherwise be replayed back into existence on the next load.
   */
  truncateEvents(gameId: string, length: number): void {
    const run = this.db.transaction((): void => {
      this.db.prepare('DELETE FROM events WHERE game_id = ? AND seq >= ?').run(gameId, length)
      this.db.prepare('DELETE FROM snapshots WHERE game_id = ? AND seq > ?').run(gameId, length)
      this.db.prepare('DELETE FROM commands WHERE game_id = ? AND seq >= ?').run(gameId, length)
    })
    run()
  }

  /**
   * Removes a game and everything derived from it, in one transaction.
   *
   * There is no foreign key between `events` and `games` — the log is append-only and
   * deliberately knows nothing about the row that names it — so all four tables have to
   * be swept explicitly. Missing one would strand events that no game lists, which
   * `readEvents` would happily replay into a game that no longer exists.
   */
  deleteGame(gameId: string): void {
    const run = this.db.transaction((): void => {
      for (const table of ['events', 'snapshots', 'commands'] as const) {
        this.db.prepare(`DELETE FROM ${table} WHERE game_id = ?`).run(gameId)
      }
      this.db.prepare('DELETE FROM games WHERE id = ?').run(gameId)
    })
    run()
  }

  putSnapshot(gameId: string, seq: number, state: unknown): void {
    this.db
      .prepare('INSERT OR REPLACE INTO snapshots (game_id, seq, state) VALUES (?, ?, ?)')
      .run(gameId, seq, JSON.stringify(state))
  }

  /** The newest snapshot at or before `atMostSeq`, or null if none applies. */
  latestSnapshot(gameId: string, atMostSeq: number): { seq: number; state: unknown } | null {
    const row = this.db
      .prepare<[string, number], SnapshotRow>(
        'SELECT seq, state FROM snapshots WHERE game_id = ? AND seq <= ? ORDER BY seq DESC LIMIT 1',
      )
      .get(gameId, atMostSeq)
    if (row === undefined) return null
    return { seq: row.seq, state: JSON.parse(row.state) as unknown }
  }

  close(): void {
    this.db.close()
  }
}

export class ConcurrentWriteError extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`Log moved under this command: expected length ${expected}, found ${actual}.`)
    this.name = 'ConcurrentWriteError'
  }
}
