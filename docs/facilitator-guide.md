# Facilitating LEVERAGE

For the human running the table. Everything here assumes four players, one physical
Monopoly board, and this app owning every dollar.

Budget **2 to 2.5 hours**. The single thing that decides whether you land inside it is
the Open phase, covered below.

---

## Before anyone arrives

```bash
npm ci && npm run build     # once, or after a git pull
npm run game                # starts the server, opens a table, prints the links
```

You get a room code, a facilitator link, a television link, and four player links each
with a QR code. In another terminal:

```bash
npm run facilitate          # a live checklist of what needs doing right now
```

**Open your own link on a laptop.** That is `/admin`, and it is the only view that can
move the clock.

On the table itself you need the board, the dice, the tokens, the houses and the hotels.
You do not need the money, the title deeds, or the Chance and Community Chest cards —
the app is the bank, the registry and the deck.

If you have a television, open the `/table` link on it. It is read-only by design; a
curious player cannot drive the game from it.

---

## Seating the players

Hand each player their QR code. They scan it, and that phone is their seat for the
evening — the link survives a reload, a dead battery and a server restart.

Say roughly this:

> The board is normal Monopoly. The money is not. Everything financial happens on your
> phone, and the app is always right — if it says no, it will tell you why in a sentence.
>
> You will not go bankrupt and you will not be eliminated. If you cannot pay, the debt
> follows you and you keep playing. You can finish with a negative score.
>
> Your phone shows you the math but never tells you what to do. That is the whole point.

Then run the draft.

---

## The draft — seven rounds, all at once

There is no auction and no going around the table. Every player submits **three ranked
deeds and a maximum bid**, simultaneously, and the round resolves in one pass.

Your job per round:

1. Wait for "4 of 4 submitted" on your console.
2. Click **Resolve draft round**.

Repeat seven times. All 28 deeds are allocated, exactly seven each, out of one $2,500
budget. That equality is deliberate — it is what makes the flat $8-per-deed carrying cost
fair.

Tell them once, at the start: *an uncontested first choice costs face value; a contested
one goes to the highest bid, and losers cascade to their second choice, then their third.*
They will work out the rest.

---

## The round loop

Five phases. You advance the clock; the app does everything else.

### Market

Nothing to do. The era clock has already turned. If the prevailing rate just changed,
say so out loud — that is the moment people re-plan.

### Open — 45 to 90 seconds

**All four players act at the same time, on their own phones.** Do not take turns. Do not
route anything through your keyboard. This is the mechanism that keeps a game this
complex inside its time budget, and serializing it is the single easiest way to turn a
2.5-hour evening into a four-hour one.

Your job is to watch, answer questions fast, and call time. Say "thirty seconds" and mean
it. If someone is confused or has put their phone down, act on their behalf from your
console — the player selector at the top of the action panel — and keep the clock moving.

### Movement

Each player rolls the physical dice in turn order. The roll gets typed in, by them or by
you. A token resting on a **card square** (2, 7, 17, 22, 33, 36) draws from the current
era's deck — click **Card** for that player.

Check nobody was skipped before you advance.

### Settlement

Eleven steps in a fixed order. One click: **Run Settlement**.

**The one thing that will trip you up:** from round 13 onward, every player carrying Heat
of 2 or more needs a physical 2d6 audit roll typed in *before* you run Settlement. Your
console shows an Audit rolls panel listing exactly who. Miss one and Settlement refuses,
naming the player — no harm done, just roll and try again.

### Scoring

Round 24 only. Pools terminate, credit default swaps fire, and the game scores itself.

---

## What to announce, and when

- **Round 7** — Era II. Everyone receives a $300 stimulus, and it is a **loan, not a
  gift**; it accrues interest like any other drawn balance. Peer loans, rent futures,
  ventures, laundering and bribery all unlock.
- **Round 13** — Era III. CDOs, credit default swaps, deed options and insider trading
  unlock. **Audits begin.** Say this loudly; players carrying dirty cash have been safe
  for twelve rounds and are about to stop being safe.
- **Round 19** — Era IV. Nothing new unlocks. The rate is 12%. The last six rounds are
  about surviving the leverage already on the table.

---

## Forced liquidation

When a player's drawn credit exceeds their borrowing base, they are flagged at Settlement
and have until the end of the *next* round to fix it. Still breached after that, their
deeds are sold.

Your console shows a **Forced liquidation** panel when it is due. Deeds go in descending
face value at an 80% floor. Offer each lot to the table out loud first — someone may want
it above the floor — then click through. If nobody bids, the bank takes it at the floor.

Each sale narrows the shortfall, so the process always terminates. If the portfolio runs
out before the debt does, the remainder becomes distressed debt at 15% a round and the
player keeps playing.

---

## When something goes wrong

**Undo.** It is free and it is exact — the app records the dice rather than rolling them,
so rewinding and replaying reproduces the game to the dollar. Your console has **Undo last
command**, and every entry in the history strip has **Undo to here**.

A mistyped die roll is the common case. Fix it and move on; nobody needs to recalculate
anything.

**There is deliberately no way to edit a player's cash directly.** Every dollar in the
game has a named counterparty, and one total is invariant across the whole log. A raw
edit would break that silently and permanently. Between undo and acting on someone's
behalf, every correction a table actually needs is covered.

**A player's phone died or they closed the tab.** They reopen their link. Everything is
where they left it; the server is the source of truth and their phone only ever mirrors it.

**The server restarted.** Same links, same game. The log is the database.

---

## Four cards that do less than they say

Documented and adjudicated, not bugs:

- **E3-08 Refinancing Window** and **E3-14 Voluntary Disclosure Programme** do nothing
  when drawn.
- **E2-09** and **E3-04** fire their fallback clause and under-deliver.

If one comes up, say so plainly and move on.

---

## Questions you will actually get

**"Is that legal?"** — Have them try it. The rejection is written for players, not
developers: *"Your borrowing base allows at most $340 more."* Reading it aloud settles it
faster than any explanation.

**"What is this contract worth?"** — It is on their screen. Every live contract carries a
mark. Do not compute one by hand; yours and the engine's will differ and the engine is
what scores the game.

**"Should I launder this?"** — Not your call, and the app deliberately will not answer it
either. Point at the number: their panel shows exactly what the dirty cash converts to at
their current Heat.

**"Why did my venture lose money?"** — Because ventures cost clean cash and pay dirty
cash, and dirty cash scores zero until laundered at a 25% haircut or worse. A venture has
to return over 133% of its cost to break even. Their panel leads with the laundered
figure for exactly this reason. This is the biggest single skill gap in the game — worth
saying once, early, to everyone.

**"Can I go bankrupt?"** — No. You can go negative and keep playing.

---

## Running a shorter game

Two knobs, both set when you open the table:

- **`unlockMode: all`** makes every instrument available from round 1. Good for teaching,
  bad for a first real game — the era ramp is what makes the complexity survivable.
- Stopping early is fine. Standings are live and meaningful at any point; you simply lose
  the round-24 termination, where pools wind up and swaps fire.

---

## If the app misbehaves

`npm run facilitate` prints what the server thinks is true. If that disagrees with a
player's screen, the server is right and their tab needs a reload.

The event log is at `/api/game/<id>/log` and is complete — every dollar that has ever
moved is in it, in order. Nothing is hidden and nothing is derived from anything you
cannot read.
