# Handoff — End-to-end tests

**Prerequisite: read `HANDOFF.md` at the repo root, then the server and web briefs.**
This needs both running.

---

## What this is

Playwright driving **five concurrent browser contexts** — one admin and four players —
against a real server with a real SQLite file. Not mocks. The user asked for "strict end
to end testing for all features added," and this is that.

**Spec section 15** defines the scenarios.

---

## Why this is achievable at all

The engine generates no randomness. Dice, card-shuffle order and audit rolls all arrive
as event payload. That means **E2E tests assert exact values, not statistical ranges** —
you can script a full 24-round game and assert the precise final net worths.

This is the single reason a test suite of this ambition is realistic. Protect it: if any
layer starts generating randomness, every scenario below degrades into flakiness.

---

## The scenarios

From spec section 15, in rough order of increasing value:

1. **Full seven-round draft** — 28 deeds allocated, exactly 7 per player, budgets correct,
   cascades resolved. Assert the deed counts; the flat $8-per-deed carrying cost is only
   fair because they are equal.
2. **Margin call → forced liquidation** at the 80% floor. Assert each sale *narrows* the
   shortfall — liquidation convergence is a load-bearing invariant.
3. **Rent future** originated, resold, matured, paid out; encumbrance survives a deed trade.
4. **CDO** built, rated, waterfall paid, underlying defaults, **CDS triggers**.
5. **Venture → dirty cash → audit → seizure**, including the step 9 → step 10 chain where
   an audit fine capitalises and triggers a margin call in the same Settlement.
6. **Distressed debt path** — a player cannot pay, keeps playing, scores negative.
7. **A full scripted 24-round game asserting exact final net worths.**

Scenario 7 is the strongest regression test the project can have.

---

## Concurrency is the point

Four players act **simultaneously** during the Open phase — that is the mechanism keeping
the game inside 2.5 hours. Tests must exercise genuine concurrency, not four sequential
players wearing a trench coat. Assert that simultaneous commands are neither lost nor
reordered.

---

## Coverage must be measured, not assumed

The engine's property suite shipped with a generator arm at **0.0–0.1% acceptance** — its
properties passed on roughly zero samples and reported green. A reviewer only found it by
instrumenting acceptance rates externally.

**Apply the same discipline here.** A scenario that silently stops reaching a feature is
worse than no scenario, because the suite claims coverage it does not have. Consider
asserting that each scenario actually exercised the events it claims to — for instance,
that the CDO scenario really emitted `SwapTriggered` rather than passing because nothing
happened.

---

## The defect class to hunt

Six defects escaped 21 task-scoped engine reviews, all with the same shape: **correct
code, passing tests, nothing calling it.** Among them, a whole game mechanic — the Era II
stimulus — was implemented, unit-tested, reviewed, approved, and never fired. It was found
only when a generator drove complete games.

E2E is the layer positioned to catch the UI and server equivalents. Two checks worth
building in deliberately:

- **Does every era-gated instrument actually become usable in its era?** Play to round 7
  and confirm the stimulus lands, ventures appear, futures can be originated. Play to 13
  and confirm audits begin.
- **Does every admin control do something?** An override that renders but doesn't apply is
  the same bug in a different costume.

---

## CI

GitHub Actions already runs lint, typecheck, build and test on every push
(`.github/workflows/ci.yml`). Add the E2E job there. It needs the server started and torn
down around the suite.

Keep the engine's discipline: **fail loudly and name the thing.** The coverage floor in
the property suite fails with the offending arm's name; do the same for a scenario that
stops reaching its feature.

---

## Known-inert, do not test for behaviour

Four entitlement kinds are unspent. **E3-08 (Refinancing Window) and E3-14 (Voluntary
Disclosure Programme) do nothing when drawn** — documented, adjudicated non-blocking,
and features rather than wiring gaps. E2-09 and E3-04 fire their fallback clauses and
under-deliver.

If a scenario draws one of those cards, expect nothing to happen. That is current
intended behaviour, not a bug to chase.
