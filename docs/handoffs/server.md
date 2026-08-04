# Handoff — Server

**Prerequisite: read `HANDOFF.md` at the repo root first.** It carries the engine
contract, the non-negotiable constraints, and the trap that will otherwise cost you a day.

**Build this first.** The web frontend and E2E suite both depend on it.

---

## What this is

A Fastify + WebSocket server that owns the event log and broadcasts state to five
concurrent clients — four players and one facilitator. It is the only thing between the
rules engine and the people at the table.

**Spec sections that govern it:** 14 (Architecture), 15 (Testing), 16 (Hosting), and the
hard constraints in section 1.

---

## Hard constraints from the spec

- **No API keys. No LLM dependency of any kind.** The facilitator agent is Claude Code
  running in the operator's terminal on their own subscription, talking to this server
  over localhost HTTP. The server is a plain deterministic service.
- **The app is the source of truth for every number.** The agent never adjudicates money.
- **State survives reload.** A player closing and reopening their tab rebuilds exact
  current state from the server.
- **Four players plus one facilitator**, concurrent. That is the entire load — SQLite on
  a laptop is comically sufficient.
- **The event log is the database.** Append-only, with periodic snapshots.

---

## Architecture

```
packages/server/
  src/
    index.ts          Fastify bootstrap
    db.ts             better-sqlite3, append-only events table + snapshots
    game.ts           command intake -> decide() -> append -> broadcast
    ws.ts             WebSocket broadcast of derived state
    auth.ts           room code + signed per-player token; separate admin token
    routes/
      game.ts         player/admin command endpoints
      agent.ts        read-only surface for the facilitator skill
```

**The core loop:**

```
client sends Command
  -> validate at the boundary (Zod)
  -> decideXAction(state, command)        // composition root, NOT the raw context decider
  -> Rejection?  return it to that client, change nothing
  -> Events?     append to log, reduce into state, snapshot if due, broadcast
```

### ⚠️ Use the composition root

`decideCredit` and the raw context deciders take a `ports` parameter defaulting to
`NO_ENCUMBRANCES`, which **silently returns $0** for make-whole and option refunds. A
liquidation of an encumbered deed would pay the futures holder nothing and raise no error.

Use `decideCreditAction` and `decidePropertyAction` from `core/decide.js`, re-exported at
the package root. This was a Critical finding in the engine's final review.

### Randomness never originates here

Dice, card-shuffle order and audit rolls all arrive as event payload from the facilitator
entering what the physical dice produced. **If the server generates a die roll, replay
breaks, undo breaks, and the E2E strategy breaks.** The engine's lint rules do not extend
to this package — the discipline is yours to keep.

---

## HTTP surface for the facilitator agent

The repo ships a Claude Code skill at `.claude/skills/leverage-facilitator/` (not yet
written — see below). It curls localhost. Read-only against game state:

```
GET  /api/game/:id/state              current derived state
GET  /api/game/:id/log                full event log
GET  /api/game/:id/valuation/:ref     engine valuation for any instrument
GET  /api/rules/:topic                ruleset reference
```

The agent **proposes** admin actions; the human executes them. It has no write authority
over money.

---

## Auth

Room code plus a signed per-player token in the URL. Separate admin token. No accounts,
no passwords, no API keys. Tokens go in the URL so a player can open their view by
scanning a QR code at the table.

---

## Undo

Free, and the reason event sourcing was chosen: truncate the log at a point and replay.
The facilitator will mistype a die roll — this is the most-used admin feature. Expose it
as a first-class endpoint, not an emergency tool.

---

## What to verify before declaring done

The engine's final review found six defects of one shape: **correct code, passing tests,
nothing calling it.** Budget time for these:

1. **Dead-code sweep.** For every exported function, does anything call it outside its
   own tests? That signature caught a whole game mechanic that never fired.
2. **Event-union audit, both directions.** Every `GameEvent` variant should be reachable
   from a command path, and every event the engine emits should be persisted and
   broadcast. An event appended but not broadcast silently desyncs a client.
3. **Reconnect actually works.** Kill a client mid-game, reconnect, assert its rebuilt
   state equals the server's. This is the property the whole persistence design exists for.
4. **Replay identity holds through the DB.** `replay(events from SQLite)` must deep-equal
   the live in-memory state. The engine proves this for in-memory logs; you own the
   round-trip through storage.

---

## Testing

Integration tests against a real server and a real SQLite file — not mocks. The engine
has 715 unit and property tests; what needs proving here is persistence, concurrency and
broadcast, which mocks cannot show.

Note `tsconfig.test.json` exists at the engine and includes `tests/**` in typechecking.
Mirror that; test code drifting from the types it asserts against is a silent gap.

---

## Hosting

`npm run game` should start the server, open an ngrok tunnel, and print four player URLs
plus a QR code for the table. Fly.io free tier is the deferred alternative for a stable
URL — WebSockets supported, SQLite on a volume. Do ngrok first; it needs no account.

---

## Still to write

`.claude/skills/leverage-facilitator/` — a Claude Code skill shipping the full ruleset as
reference files, so the operator's terminal agent can answer rules questions and flag
what needs doing each round. It talks to the HTTP surface above. No key, runs on the
operator's own subscription.
