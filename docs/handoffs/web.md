# Handoff — Web frontend

**Prerequisite: read `HANDOFF.md` at the repo root, then `docs/handoffs/server.md`.**
This depends on the server's API and WebSocket broadcast.

---

## What this is

One React + Vite + TypeScript bundle serving three shells. It is what four people at a
physical Monopoly board actually touch, while the board, dice, tokens and houses stay
real.

**Spec sections that govern it:** 14 (Architecture), and the assist-panel rule in the
same section.

---

## The three shells

| Route | Who | Contents |
|---|---|---|
| `/admin` | facilitator | enter dice rolls, advance phase, draw cards, round clock, **undo**, and full view-and-edit override of any player's cash, deeds, heat, contracts and debt |
| `/p/:token` | each player | cash, dirty cash, heat, deeds, credit gauge, live contracts, era-gated action panel, assist panel |
| `/table` | a TV, optional | leaderboard, era, prevailing rate, Treasury balance, live contracts |

---

## The decision that shapes everything

**Players act in their own views. The admin has full override on top — not instead.**

Routing every action through the facilitator serializes the Open phase, which is the one
mechanism keeping a game this complex inside 2.5 hours. The Open phase is 45–90 seconds
of all four players acting *simultaneously*. If they queue behind one person's keyboard,
the game runs four hours.

The admin can still act on behalf of anyone who is confused or away from their phone.

---

## The assist panel — show the math, never the move

This is a spec rule, not a preference. The panel surfaces expected values, landing
probabilities, credit headroom, and hard warnings like *"mortgaging this triggers a
margin call"* or *"your audit probability this round is 58%."*

**It never ranks or recommends actions.** The goal is closing the information gap between
players without closing the skill gap — the table is mixed, some players know heavy
economic games and some know Monopoly and Catan.

Driven by deterministic heuristics computed in the engine. **Not an LLM** — there is no
API key anywhere in this project, and it must be instant.

### One requirement worth stating loudly

**Venture payoffs must be shown at their LAUNDERED value, never their dirty value.**

Ventures cost clean cash and pay dirty cash, so a venture must return **over 133% of its
cost** merely to break even after the laundering haircut. Simulation put the gap between
correct and naive underworld play at roughly **$1,290** — the largest skill cliff in the
game. A player reading the raw dirty figure walks straight off it. Displaying the
laundered number is the single highest-value thing this panel does.

---

## Era gating

Instruments unlock progressively: Era I has deeds, building, mortgage, trading and the
credit line; Era II adds peer loans, rent futures, ventures, laundering, bribery; Era III
adds CDOs, tranches, CDS, deed options, insider trading; Era IV adds nothing but pressure.

The engine exposes `isUnlocked(state, instrument)` reading `ECONOMY.UNLOCK_ERA`. The
action panel must gate off that, not off its own table — a duplicated gating table was a
Critical finding during engine development and took a fix round to consolidate.

An admin setting (`unlockMode: 'all'`) makes everything available from round 1.

---

## State

The server is authoritative. The client holds a mirror updated by WebSocket. Optimistic
UI only for local form state — never for anything the engine computes.

**A player reloading their tab must rebuild exact current state from the server.** That
is a spec hard constraint and the reason the whole persistence design exists.

---

## Design

There is a published rulebook artifact whose visual language you may want to carry over —
a securities-offering-memorandum treatment, ledger-paper ground, engraved safety green as
the structural accent, oxblood reserved strictly for risk (margin calls, audit odds,
default). See https://claude.ai/code/artifact/ca352b51-f20d-410f-bdd8-33bf8169a666

Phone-first for `/p/:token` — players hold their phones at the table. The admin console
is a laptop. `/table` is a TV across the room, so it needs large type and no interaction.

Use tabular numerals wherever digits line up in columns. Half of every screen is money.

---

## What to verify before declaring done

The engine's final review found six defects shaped as *correct code, passing tests,
nothing calling it.* The UI equivalent:

1. **Every era-gated action is reachable in its era.** A button that never renders is the
   same defect as a function nobody calls.
2. **Every warning the assist panel can produce actually fires** in a real scenario.
3. **Reconnect mid-Open-phase** — close a player's tab while they have a half-filled form,
   reopen, confirm server state is intact and the client rebuilds correctly.
4. **Simultaneous action by all four players** does not lose or reorder commands.

---

## Reference

The player rulebook content at `docs/reference/rulebook-content.md` is written for exactly
this audience — four people at a table, mid-game, looking one thing up under mild social
pressure. Its structure is a reasonable guide to what the UI needs to surface and when.
