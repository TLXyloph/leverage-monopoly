# LEVERAGE

A Monopoly variant that replaces landing luck with financial skill.

All 28 title deeds are allocated before play through a simultaneous sealed-bid draft,
so no property is ever acquired by chance. Rent is still collected only on landing —
but rent is tradeable. Players originate and sell rent futures, borrow against their
deeds on a revolving credit line, write peer loans, pool those loans into tranched
CDOs, buy naked credit protection against each other, and run an underworld economy
of ventures that pay in seizable dirty cash.

Designed for 4 players and a facilitator, over roughly 2 to 2.5 hours.

## Status

In design. See [`docs/superpowers/specs/`](docs/superpowers/specs/) for the
current specification.

## Layout

```
packages/engine      pure rules engine, zero I/O, deterministic
packages/server      Fastify + WebSocket + SQLite event log
packages/web         React + Vite player and admin views
packages/rulebook    rulebook generator, sourced from the engine's constants
.claude/skills/      Claude Code facilitator skill
tests/e2e            Playwright, five concurrent browser contexts
```

## Design principle

The engine never generates randomness. Dice rolls, card draws and audit checks all
arrive as event data carrying values produced by the physical dice on the table.
Every game is therefore exactly replayable, undo is free, and the end-to-end tests
can assert precise final scores rather than statistical ranges.
