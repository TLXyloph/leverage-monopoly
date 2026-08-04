# LEVERAGE — Handoff

**Read this first. Then read the one subsystem brief you're picking up.**

---

## Goal

Build a Monopoly variant that replaces landing luck with financial skill, playable by
4 players and a facilitator in 2–2.5 hours on a physical board, with a web application
owning the entire financial layer.

Four things ship:

| Part | Status |
|---|---|
| **Rules engine** — pure, deterministic, event-sourced | ✅ **complete, merged, 715 tests** |
| **Player rulebook** — web artifact | ✅ **published** |
| **Server** — persistence, real-time, HTTP API | ❌ not started |
| **Web frontend** — admin console, 4 player views, projector | ❌ not started |
| **E2E suite** — Playwright, 5 concurrent browser contexts | ❌ not started |

The game is **playable today by hand** using the published rulebook. The remaining work
replaces manual bookkeeping with software.

---

## Current state

```
branch      main @ 0889686 — 55 commits ahead of origin/main (NOT PUSHED)
tests       715 passing across 48 files
gates       npm run lint · typecheck · build · test — all clean
engine      packages/engine — 81 source files, zero runtime dependencies
```

**The remote is behind.** `main` was merged locally at the user's request and never
pushed. `origin/engine` still exists and is fully contained in `main`. Ask before
pushing — the user makes remote decisions.

### The authoritative documents

| What | Where |
|---|---|
| **The spec** — every rule, the authority | `docs/superpowers/specs/2026-08-03-leverage-design.md` |
| Engine plan + merge reconciliation table | `docs/superpowers/plans/2026-08-03-rules-engine.md` |
| Per-task plan parts (21 tasks) | `docs/superpowers/plans/parts/` |
| 80 authored era cards | `docs/reference/era-decks.md` |
| Landing probabilities (verified) | `docs/reference/landing-probabilities.md` |
| Economy simulations (3 studies, 250k+ games) | `docs/reference/economy-results*.md` |
| Player rulebook content | `docs/reference/rulebook-content.md` |
| Published rulebook artifact | https://claude.ai/code/artifact/ca352b51-f20d-410f-bdd8-33bf8169a666 |

**Where the spec and any plan disagree, the spec wins.** Several plan files carry stale
names and superseded numbers — they were authored in parallel before the spec settled.

### Subsystem briefs

- [`docs/handoffs/server.md`](docs/handoffs/server.md)
- [`docs/handoffs/web.md`](docs/handoffs/web.md)
- [`docs/handoffs/e2e.md`](docs/handoffs/e2e.md)

Build them in that order. The web frontend needs the server's API; E2E needs both.

---

## The engine you're building against

Pure, deterministic, event-sourced. `reduce(state, event) => state` contains no
`Math.random` and no `Date` — **all randomness arrives as event payload** carrying values
the physical dice already produced:

```ts
{ type: 'DiceRolled',   player: 'P2', dice: [3, 5] }
{ type: 'CardDrawn',    deck: 'era3', index: 7 }
{ type: 'AuditChecked', player: 'P4', dice: [1, 2] }
```

Three properties follow, and the whole architecture rests on them:

- **Undo is free** — truncate the log and replay.
- **E2E tests assert exact values**, not statistical ranges.
- **The dice on the table are the RNG.** No server-side shuffle anyone must trust.

Enforced by ESLint (`no-restricted-globals`, `no-restricted-syntax`) *and* by a test that
greps compiled output — because lint alone is defeatable.

### ⚠️ The one trap that will cost you a day

`decideCredit` is exported and takes a `ports` parameter that **defaults to
`NO_ENCUMBRANCES`, which silently returns $0** for make-whole and option refunds. A
server calling it directly will force-liquidate an encumbered deed, pay the futures
holder nothing, and raise no error.

**Use `decideCreditAction` from `core/decide.js`** — the composition root, with
`MARKET_PORTS`/`CREDIT_PORTS` correctly wired. Same applies to property actions:
`decidePropertyAction`, not the raw context decider.

This was a Critical finding in the final review. The fix made *one* port required-with-
no-default so it fails to compile if unwired; the others still have the footgun.

### Public surface

Import only from the package root (`@leverage/engine`). It re-exports core types, state,
events, errors, `ECONOMY`, board config, `reduce`, `decide`, money helpers, card effects,
and all eight contexts. Two markets names are aliased at the root to avoid collisions:
`expectedFutureHitsPerRound`, `contractRoundsRemaining`.

---

## What worked

**Randomness as event data.** The single highest-leverage decision. It makes replay
exact, undo trivial, and E2E assertions precise. Preserve it — a server that generates
a die roll breaks all three at once.

**One conserved quantity, no exceptions.**
`sum(cleanCash) − sum(drawnCredit) − sum(distressedDebt) + treasury` is invariant.
Dirty cash is deliberately **outside** it — ventures create it from nothing, audits
destroy it, it scores $0. Every bank-facing transaction has a named counterparty.
Asking "what must stay constant?" found more real defects than any other technique.

**Exact integer arithmetic for all money.** `floorPercent`/`floorPercentSum` in
`core/money.ts`, working in basis points. `Math.floor(a * b)` is lint-banned. The trap is
narrower than it looks and **cannot be reasoned about by inspection** — `0.25 + 0.05*2`
is exactly `0.35` and fine, while a Heat-9 haircut at `0.55` floors $1000 to $449
instead of $450. Spot-checking one rate proves nothing about another.

**Verifying wiring by severing it.** A passing test proves a function works, not that
anything calls it. Cutting the call site and watching a test fail is the only proof.

**Reviewing every task against its brief, with the reviewer running its own tests.**
Caught ~20 defects. Reviewers that wrote scratch tests and reported observed numbers
found real bugs; reviewers that read code and agreed found none.

---

## What didn't work

**Task-scoped review misses interaction defects — six times.** Every escape had the same
shape: **correct code, passing tests, nothing calling it.**

- `EncumbranceExtinguished` paid the holder but never removed the contract from state
- `core/reduce.ts` routed 8 of 10 context reducers for several tasks
- The Era II stimulus was implemented, unit-tested, reviewed, approved — and never called
- 12 card-effect selectors had zero non-test callers (~⅓ of the deck was decoration)
- `ventureIncomeFromRent` was never called (two ventures paid $0 forever)
- The public API omitted markets and the composition root

A review comparing a diff to a brief has no reason to ask *"does anything invoke this?"*
**Budget a dead-code sweep and an event-union audit before declaring any subsystem done.**

**Filing a Critical as a deferred minor.** `ventureIncomeFromRent` sat in the ledger for
nine tasks as *"not yet wired — deferred by design."* A deferred item whose text says
"not yet wired" is a Critical in disguise.

**Trusting grep to verify wiring.** A `grep -o` for reducer names found all ten and
looked fine — two appeared only inside a comment. Verify by behaviour.

**Property tests that reach nothing.** One generator arm sat at 0.0–0.1% acceptance, so
its properties passed on ~zero samples. The suite now reports per-arm acceptance against
a floor and fails naming the arm. **Apply the same discipline to E2E coverage.**

**Concluding "not reproducible" too early.** A conservation failure was declared a flake
after 75,000 histories; a reviewer reproduced it at higher `numRuns` across 7 seeds and
located the mechanism. Seeds are now pinned and logged.

**Plans authored in parallel drift from each other.** Assumed signatures were wrong in
four places; `kind` vs `type` command discriminants appeared in **twelve** briefs. Verify
real signatures on disk before coding against any plan text.

---

## How to work in this repo

```bash
npm ci
npm test                 # 715 tests, ~20s
npm run lint             # determinism + money-arithmetic + import rules
npm run typecheck        # includes tests/ via tsconfig.test.json
npm run build
```

**Non-negotiable constraints** (enforced by tooling — they will fail your build):

- No `Math.random`, no `Date`, no I/O, no dynamic `import()` in `packages/engine/src` —
  **not even the literal string in a comment**; the built-output scanner greps for it
- All money integer dollars; percentages via `core/money.ts` only
- Commands discriminate on `type`, never `kind` (data variants like `Tranche.kind` keep `kind`)
- Contexts import each other only through `index.ts`
- Economic constants live only in `config/economy.ts`
- Files under 500 lines
- `isWholeDollars(-1)` returns **true** — guard amounts with an explicit `> 0`

**Process that worked:** brainstorming → spec → plan → subagent-driven execution with a
fresh implementer per task, a review after each, and a whole-branch review at the end.
Each remaining subsystem deserves its own spec → plan → build cycle.

---

## Next steps

1. **Server** (`docs/handoffs/server.md`) — Fastify, WebSocket, SQLite event log, HTTP API
   for the Claude Code facilitator skill. No LLM dependency, no API keys.
2. **Web frontend** (`docs/handoffs/web.md`) — `/admin`, `/p/:token`, `/table`. Players act
   in their own views; admin has full override. Assist panel shows the math, never the move.
3. **E2E** (`docs/handoffs/e2e.md`) — Playwright, 5 concurrent contexts, including a full
   scripted 24-round game asserting exact final net worths.

### Known-inert, documented, non-blocking

Four entitlement kinds are unspent, affecting 4 of 80 cards. **E3-08 (Refinancing Window)
and E3-14 (Voluntary Disclosure Programme) do nothing when drawn.** E2-09 and E3-04 fire
their fallback clauses and under-deliver. These need new commands, not wiring — treat as
features if you want them.

### Deferred minors worth knowing

- `GameEvent` variant fields lack `readonly` (no mutation site exists)
- Several dead exports remain, mostly in `board/markov.ts` and `securitization/ratings.ts`
- Four test files exceed the 500-line guideline
- `.eslintrc.json` matches the import *string* `contexts/*/*`, so `'../credit/selectors.js'`
  evades the encapsulation rule
