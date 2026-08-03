# LEVERAGE — Design Specification

**Date:** 2026-08-03
**Status:** Approved for planning
**Repo:** https://github.com/TLXyloph/leverage-monopoly

A Monopoly variant for 4 players and a facilitator, played on a physical board with a
web application owning the entire financial layer. Target session length is 2 to 2.5
hours including setup.

---

## 1. Goals and constraints

### The problem being solved

Monopoly is unskillful for four compounding reasons, and this design addresses all four:

| Problem | Fix |
|---|---|
| Acquisition is luck — whoever lands on Boardwalk owns it | All 28 deeds allocated by simultaneous sealed-bid draft before play |
| Income is lumpy — rent arrives on a ~1-in-15 event | Rent stays landing-only, but becomes tradeable via a futures market |
| Capital is trapped — no leverage, no instruments | Credit lines, peer loans, securitization, derivatives |
| The endgame is decided long before it ends | Fixed 24 rounds with net-worth scoring; no elimination |

### Hard constraints

- **No API keys anywhere.** The backend has zero LLM dependency. The facilitator agent
  is Claude Code running in the operator's terminal on their existing subscription.
- **The app is the source of truth for every number.** Banking, interest, waterfalls,
  ratings and laundering haircuts are all computed deterministically by the engine.
  The agent never adjudicates money.
- **Four players plus one facilitator**, all with concurrent access.
- **Physical board, physical dice, physical houses.** The app owns everything the
  board cannot.
- **State survives reload.** A player closing and reopening their tab rebuilds exact
  current state from the server.
- **Mixed player experience.** Some players are comfortable with heavy economic games,
  some know Monopoly and Catan. Era gating and an information-parity assist panel
  bridge the gap.

### Explicit non-goals

- Remote play. The design assumes everyone is at one table with one board.
- Player accounts, passwords, or persistent identity across games.
- More than 4 players, or fewer than 4.
- Rendering the board. Token positions are entered by the facilitator.

---

## 2. Game structure

### Round loop

Twenty-four rounds, four phases each. The deep phase is simultaneous, which is the
single mechanism that keeps a game this complex inside the time budget.

| Phase | Actor | Typical duration | Contents |
|---|---|---|---|
| **Market** | Facilitator | ~15s | App posts round number, era, prevailing rate, active card effects |
| **Open** | All four, simultaneously | 45–90s | All financial actions and negotiation |
| **Movement** | Each player in turn | ~15s each | Physical dice roll, facilitator enters result, app resolves landing |
| **Settlement** | Automatic | ~10s | Interest, waterfalls, maturities, venture timers, margin calls, audits |

There is **no enforced timer.** The app displays a round clock for pacing awareness
only; the facilitator advances phases manually.

### Eras

Instruments unlock progressively. This is the default; an admin setting
(`unlockMode: 'progressive' | 'all'`) makes everything available from round 1.

| Era | Rounds | Rate | Unlocks |
|---|---|---|---|
| **I — Recovery** | 1–6 | 5% | Deeds, building, mortgage, trading, bank credit line |
| **II — Expansion** | 7–12 | 6% | Peer loans, rent futures, ventures, laundering, bribery. Treasury advances each player a $300 stimulus at the start of round 7, **as an interest-bearing loan**. |
| **III — Financialization** | 13–18 | 8% | CDO pools and tranches, CDS, deed options, insider trading. **Audit checks begin.** |
| **IV — Reckoning** | 19–24 | 12% | No new instruments. Rate pressure and the Reckoning deck only. |

Era IV deliberately introduces no new mechanics. The final six rounds are about
surviving the leverage already taken on, not learning anything new.

### Turn order

Fixed for the whole game, determined by a single die roll at setup. Because no
property is acquired by landing, turn order carries far less advantage than in
standard Monopoly — it affects only the order of movement within a round.

### Standard rules retained

Everything below is unchanged from standard Monopoly and is stated explicitly because
the engine must implement it and the landing-probability model depends on some of it.

- **Rent tables** are standard. Where a player owns every deed in a colour group,
  rent on each **individually undeveloped** deed in that group is doubled — the standard
  per-square rule, not a whole-set test, so a group with houses on one deed still pays
  doubled rent on its undeveloped siblings. Railroads pay $25/$50/$100/$200 for one
  through four owned; utilities pay 4x or 10x the dice roll for one or two owned.
  Mortgaged deeds count toward neither the group-ownership test nor the railroad and
  utility owned-counts.
- **Building** requires ownership of the full unmortgaged colour group and follows the
  even-build rule. **House and hotel costs are 90% of standard**, to offset the
  development suppression caused by the carrying cost. Buildings sell back to the bank
  at 50% of the price paid.
- **House and hotel supply is limited** to 32 houses and 12 hotels. The housing shortage
  is a legitimate and deliberate strategy.
- **Mortgages** pay 50% of face value; unmortgaging costs 55%. A mortgaged property
  collects no rent and contributes nothing to the borrowing base.
- **GO** pays **$350** on passing or landing, from the Treasury. This is higher than
  standard Monopoly because the per-deed carrying cost drains far more than standard
  Monopoly ever does; the pair was tuned together and neither number is meaningful alone.
- **Income Tax** (square 4) is a flat $200 and **Luxury Tax** (square 38) is $100, both
  paid to the Treasury. The percentage option on Income Tax is not offered.
- **Free Parking** (square 20) does nothing. No accumulated-pot house rule.
- **Jail:** a player sent to Jail leaves on their next turn by paying $50. This is the
  convention the landing-probability model assumes, and it is mandatory rather than
  optional so that the model stays exact. Rolling for doubles to escape is not offered.
- **Three consecutive doubles** sends the player to Jail without moving.

---

## 3. The draft

Seven rounds, all simultaneous. Every player ends with exactly seven deeds.

### Submission

Each draft round, every player privately submits:

- A **ranked list of three target properties**
- A **maximum bid** for their first choice, which must be at least that property's
  face value and at most their remaining budget

### Resolution

1. For each property receiving exactly one first-choice nomination, that player
   acquires it at **face value**.
2. For each property receiving multiple first-choice nominations, the highest maximum
   bid wins and pays **their own bid** (first-price). Ties on bid amount resolve to the
   player who has acquired less total face value so far; if still tied, to the player
   earlier in turn order.
3. Players who lost a contest cascade to their second choice, then their third,
   acquiring at face value if available.
4. Two cascading players landing on the same property resolve by **lower total face
   value acquired so far** — a quiet self-balancing rule requiring no extra bid round.
5. If all three of a player's ranked choices become unavailable — taken by others or
   lost in contests — they acquire the **cheapest remaining property** at face value.
6. If a player's remaining budget cannot cover the face value of any remaining
   property, they receive the **cheapest remaining property at no cost**.

Rule 6 grants a deed rather than compensating with cash because **every player ending
with exactly seven deeds is load-bearing**, not cosmetic. The flat per-deed carrying
cost in section 4 is incidence-neutral only because deed counts are equal; a player
holding six would pay a permanently lower levy for the rest of the game.

Submissions are validated at entry: a player may not nominate a property already
allocated in an earlier round, and their maximum bid may never exceed their remaining
budget.

After each round, all allocations are revealed to everyone. Information from rounds
1–6 is what makes round 7 skillful.

### Consequence: monopolies are rare by design

Twenty-eight deeds split 7/7/7/7 across ten colour groups means completing a group
costs two or three of your seven picks while three opponents work to stop you. This is
intentional. It makes trading and negotiation load-bearing from round 1 rather than an
afterthought, and it gives deed options (Era III) a clear purpose.

---

## 4. Money supply

All figures in this section are the output of a Monte Carlo study of 172,000 simulated
games across 43 configurations, with money conservation verified in every trial. See
[section 19](#19-validated-reference-data). **Every constant here lives in a single
tunable config module**, because they will want retuning after the game is played.

### Starting position

Each player receives a **single unified budget of $2,500**. The draft spends from it;
whatever remains is that player's operating cash. There is no separate acquisition
budget, so the deeds-versus-liquidity tradeoff is made before a die is rolled.

```
STARTING TOTAL                     $10,000   ($2,500 x 4)
TOTAL FACE VALUE OF 28 DEEDS        $5,690
EXPECTED DRAFT OUTFLOW             ~$6,300   (face + contest premiums)
                                       ↓
EXPECTED HOLDINGS AFTER DRAFT      ~$3,700   (~$925 each)
```

### Carrying cost

Each Settlement, every player pays **$8 per unmortgaged deed** to the Treasury.
Buildings are **not** charged.

This is the recurring drain that makes the entire credit layer function. Rent is a
player-to-player transfer that nets to zero, so without a drain the economy has income
but no pressure, and nobody ever needs to borrow — which would leave peer loans rare
and the whole Era III securitization layer decorative.

**It is deliberately a flat per-deed charge rather than a percentage of value.** An
ad-valorem levy was tested and rejected: because monopolies are rare by design,
expensive deeds do not earn proportionally more rent, so charging on face value bills
the most for the assets that earn the least. Simulation showed it inverting the draft
outright — the top drafter's win rate fell from 28% to 18% against a 25% neutral
baseline, and their mean net worth dropped below the bottom drafter's at every rate
tested. The incidence is simply wrong, and no rate corrects it.

The flat charge raises equivalent revenue with neutral incidence, since the draft gives
every player exactly seven deeds. It also makes **mortgaging a live tactical lever**:
mortgaging cuts your carrying cost immediately, at the price of borrowing base and rent.

The charge applies from **round 1**. A grace period until round 7 was tested and
rejected — it lets players bank a cash cushion the charge never catches up with, and
peak table debt collapses from $2,142 to $1,157.

### Treasury

Draft proceeds flow to a **Treasury**, not out of the game. The Treasury pays out on a
fixed schedule and takes in carrying costs and all interest paid to the bank:

| Flow | Direction | Amount |
|---|---|---|
| Draft proceeds | In | ~$6,300 |
| Carrying cost | In | $8 per unmortgaged deed per player per round |
| Credit line interest | In | variable, and now material |
| GO salary | Out | $350 per pass |
| Era II stimulus | Out | $300 per player at round 7, **as an interest-bearing loan** |

The Era II stimulus is a **loan, not a grant** — it is added to the player's drawn
credit balance and accrues at the prevailing era rate. This single change converts
$1,200 of permanent inflation into serviceable debt and gives the Treasury a real
revenue leg, lifting its interest income roughly sixfold.

The Treasury may run a deficit; it is an accounting entity, not a constraint. Its
balance is displayed to all players as a macro indicator.

### The money supply deflates, deliberately

Under this configuration the money supply contracts roughly 29% over 24 rounds. This is
intended and should not be corrected. Cash scarcity is what creates borrowing, and cash
scarcity *is* deflation — they are one variable observed twice. A neutral-supply
configuration exists but drops peak table debt by a third.

The defect in the earlier design was never the direction of the money supply. It was
that liquidity pressure *decreased* over the game while the interest curve escalated
from 5% to 12%. Mild deflation puts those two forces in the same direction.

---

## 5. Bank credit

A revolving credit line. Draw and repay freely during any Open phase.

**Borrowing base** = **75%** of unmortgaged deed face value + **50%** of building cost.

These ratios are load-bearing rather than arbitrary. At 50%/25% the total credit
available to the entire table is capped at $2,845 — 50% of the board's $5,690 face
value — which is too little to securitize meaningfully and made the design's own debt
targets arithmetically unreachable. Raising the base also cuts forced liquidations from
81% to 63% of the games in which they occur, because a player absorbing a shock can now
borrow through it instead of mortgaging into a spiral.

Interest accrues each Settlement on the drawn balance at the era's prevailing rate
and is paid to the Treasury. If a player cannot pay interest from clean cash, the
interest capitalises into the drawn balance.

### Margin calls

If drawn balance exceeds borrowing base at Settlement — because the player mortgaged,
sold, or lost a deed — the position is flagged. The player has until the end of the
next Open phase to cure it by repaying or by raising the base.

If uncured, the app force-liquidates at the start of the next Open phase (see 19.8).
Deeds are offered to the other three players in descending face-value order. Each is
sold to the highest bid at or above **80% of face value**; if no player bids, the bank
takes it at exactly 80%. The deed becomes bank-owned and is not re-drafted.

**Developed deeds are stripped first.** Buildings across the colour group are sold back
to the bank at 50% of cost following the even-build rule, and those proceeds go against
the debt before the deed itself is auctioned. Buildings contribute 50% of cost to the
borrowing base and return 50% of cost in cash, so stripping is exactly shortfall-neutral.

**Liquidation stops when the position is cured, or when the player has no unmortgaged
deeds left.** Any residual shortfall becomes distressed debt.

### The floor must exceed the advance rate

`LIQUIDATION_FLOOR` (0.80) is required to be strictly greater than `DEED_ADVANCE_RATE`
(0.75), and the engine asserts this at startup.

The reason is that liquidation would otherwise diverge. Selling a deed raises
`floor × face` in cash but removes `advance × face` from the borrowing base. If the
floor is below the advance rate, every forced sale *widens* the shortfall — at a 70%
floor against a 75% advance rate, each sale makes the position 5% of face worse, and
the loop terminates only by consuming the player's entire portfolio.

At 80% against 75%, each sale narrows the shortfall by 5% of face and liquidation
converges. This invariant was violated in an earlier draft of this spec and is recorded
here so the two constants are never tuned independently again.

### Distressed debt

Under fixed-round scoring there is no elimination. If a player cannot meet an
obligation after exhausting credit and liquidation, the shortfall becomes **Distressed
Debt**, accruing at **15% per round** and subtracting from net worth at scoring. The
player continues to act normally in every phase.

This is the deliberate answer to "what happens when you go broke": you stay in the
game, you keep making decisions, and you carry a wound that compounds.

---

## 6. Rent futures

The centrepiece instrument, unlocked in Era II.

A contract transferring all rent collected on **one specified property** over a
**specified window of rounds** to the contract holder.

### Rules

- Only the property's owner may originate a contract.
- Windows are at most **8 rounds**, must begin at the round after origination or later,
  and must end at or before round 24.
- A **mortgaged property cannot originate** a contract, since it collects no rent.
- **One active contract per property.** A property with an outstanding future cannot
  have another originated against it.
- Price is negotiated freely between the two players.
- During the window, rent collected on that property routes automatically to the holder.
- The holder may resell the contract to any other player at any negotiated price.

### Encumbrance

**Contracts follow the deed.** If the owner sells or trades an encumbered property,
the new owner inherits the obligation. The app displays the encumbrance on the deed so
it is priced into the trade.

**Mortgaging triggers make-whole.** An encumbered property may be mortgaged, but the
owner immediately owes the holder the contract's remaining expected value as computed
by the engine, and the contract terminates. This closes the obvious rug-pull.

### Valuation

The engine computes exact landing probabilities using a Markov chain over all 40
squares — including two-dice distribution, the three-consecutive-doubles rule, the Go
To Jail square, and all card-driven movement — conditioned on current token positions.

The steady-state distribution has been independently derived and verified (see
[section 19](#19-validated-reference-data)). `tests/fixtures/landing-probabilities.json`
is a golden fixture the engine's implementation must reproduce.

Displayed to all players for any property: landing probability, expected hits over the
window, current rent at present development, expected value, and the 10th and 90th
percentiles of the outcome distribution.

**This is what makes the market skillful rather than solved.** The model prices the
property as it currently is. Players price it as it will be. Selling futures on a
property you are about to develop, or buying them from a player one bad roll from a
margin call, are both edges the displayed number cannot capture.

---

## 7. Peer loans

Unlocked in Era II. Freely negotiated between any two players.

**Terms:** principal, per-round interest rate, term in rounds, and zero or more deeds
pledged as collateral.

The app enforces every term. Interest is due each Settlement. The lender holds a
**note**, which is an asset — it can be sold outright or pooled into a CDO.

### Default

Default occurs on a missed interest payment, or on an outstanding balance at term
expiry. On default:

1. Collateral deeds transfer to the lender.
2. Any remaining balance is written off.
3. The borrower's **credit line borrowing base is permanently halved** for the
   remainder of the game.

---

## 8. Securitization

Unlocked in Era III.

### Pools and tranches

A player may pool **three or more assets they own** — peer loan notes, rent futures,
or deed options — into a CDO. The engine computes the pool's total expected cashflow.

The originator defines three tranches:

- **Senior** — a fixed face amount, paid first, retires when paid in full
- **Mezzanine** — a fixed face amount, paid second, retires when paid in full
- **Equity** — uncapped residual, receives everything after Senior and Mezzanine are
  satisfied, for the life of the pool

Senior and Mezzanine face amounts are set by the originator at creation and cannot
exceed the pool's expected cashflow in total. Tranches are sold to other players at
freely negotiated prices.

### Waterfall

Each Settlement, all cash collected by the pool's underlying assets is distributed in
strict priority: Senior to its remaining face, then Mezzanine to its remaining face,
then Equity takes the residual. The pool terminates when all underlying assets have
matured or defaulted.

### Ratings

Ratings are computed deterministically by the engine and displayed on every tranche.
No human or agent judgment is involved.

```
coverage       = expected pool cashflow / cumulative claim through this tranche
concentration  = largest share of expected pool cashflow from a single obligor  (0..1)
leverage       = cashflow-weighted mean borrower (drawn debt / borrowing base), capped at 5

score = coverage x (1 - 0.25 x concentration) / (1 + 0.10 x leverage)
```

| Score | Rating |
|---|---|
| ≥ 2.2 | AAA |
| ≥ 1.5 | AA |
| ≥ 1.2 | A |
| ≥ 1.0 | BBB |
| ≥ 0.8 | BB |
| ≥ 0.6 | B |
| < 0.6 | CCC |

The formula is deliberately coverage-dominant and forgiving of concentration. A pool
of three loans all made to the same player at 3.8x leverage still rates its senior
slice **AA**. That rating is arithmetically correct and analytically worthless, which
is both the joke and a genuine strategy. The Era IV deck issues downgrades.

Alongside the rating, the app always displays obligor concentration and weighted
borrower leverage as raw figures, so the information is available to anyone who reads.

### Credit default swaps

A CDS references either a **peer loan note** or a **CDO tranche**.

- The buyer pays a negotiated **premium** each Settlement to the seller.
- On a **credit event**, the seller pays the buyer the **notional**, agreed at
  origination and capped at the face value of the reference obligation.
- **Naked CDS is legal.** A player may buy protection on debt they do not own.
- The seller must post **30% of notional** against their borrowing base, which
  prevents unlimited writing.

**Credit events:** for a loan note, borrower default. For a tranche, receiving less
than its full face by pool termination — so tranche CDS settle at termination.

**All pools terminate at the end of round 24** for scoring, whether or not their
underlying assets have run their course. Any tranche short of its face at that moment
triggers its referencing CDS. This makes the final round genuinely dangerous for anyone
who wrote protection, and it removes any ambiguity about unresolved positions at
scoring.

---

## 9. Deed options

Unlocked in Era III. Exists specifically to serve the rare-monopolies consequence of
the draft.

Three numbers: **premium** paid at origination, **strike** price, **expiry** round.
The deed's owner writes the option; the holder may exercise during any Open phase up
to and including the expiry round, paying the strike and receiving the deed.

While an option is outstanding, the writer **may not sell, trade or mortgage** the
underlying deed. Options may be resold by the holder.

---

## 10. The underworld

Ventures unlock in Era II. Audit checks begin in Era III, giving a six-round honeymoon
in which vice appears to be free money.

### Ventures

| Venture | Cost | Duration | Effect | Heat |
|---|---|---|---|---|
| **Escort Service** | $150 | 4 rounds | +60% of all rent charged on your deeds, paid in dirty cash | +2 |
| **Numbers Racket** | $150 | 6 rounds | +$60 dirty per round, flat | +2 |
| **Chop Shop** | $250 | 4 rounds | +$150 dirty each time any opponent lands on a deed you own | +3 |
| **Speakeasy** | $250 | one-shot | Roll 2d6 against the payout table below, paid in dirty cash | +2 |

Speakeasy payout table:

| Roll | Payout | Probability |
|---|---|---|
| 2 | $0 | 2.8% |
| 3–5 | $100 | 25.0% |
| 6–8 | $250 | 44.4% |
| 9–11 | $500 | 25.0% |
| 12 | $1,200 | 2.8% |

Expected payout is $294 in dirty cash against a $250 cost — marginally negative in
laundered terms, plus Heat. It is a gamble, not an income source.

Escort Service and Chop Shop are deliberately complementary. Escort rewards high rent
per hit, so it suits a player with hotels on the oranges. Chop Shop rewards traffic
volume regardless of rent, so it suits a player holding many cheap high-frequency
squares. They reward opposite board positions.

### Dirty cash

Dirty cash is worth **exactly $0 at final scoring** and is **fully seizable** in an
audit. It can be spent only on ventures, bribery, insider trading, and laundering.

**Laundering** converts dirty to clean at a **25% haircut**, worsening by **5 percentage
points for each Heat point above 3**, capped at a 60% haircut. Each laundering
transaction costs **+1 Heat**, and a player may launder at most once per Open phase.

### Heat and audits

```
+2   launching a venture (+3 for Chop Shop)
+1   each laundering transaction
+1   bribery
+1   insider trading
-1   per round in which the player takes no dirty action

AUDIT CHECK each Settlement from round 13 onward:
  roll 2d6; audit occurs if the roll is less than or equal to Heat

  Heat 3  →   8.3%       Heat 7  →  58.3%
  Heat 5  →  27.8%       Heat 9  →  83.3%

ON AUDIT:  all dirty cash seized
           fine of $100 x Heat, payable in clean cash
           Heat resets to 0
```

The system self-balances. Escort Service pays a percentage of *your* rent, so it is
strongest for the player with the biggest board position — and that same player has
the most exposed when the audit lands. The instrument is most powerful exactly where
it is most dangerous.

### Bribery and insider trading

**Bribery** costs $200, **payable in dirty cash**, once per round per player, and does
exactly one of three things:

- Forces a re-roll of any single die roll, including another player's movement
- Cancels an era card effect drawn this round that targets the briber specifically
- Delays one of the briber's own margin calls by one round

It cannot cancel a card that targets all players, and it cannot be used during
Settlement after an audit has already resolved. +1 Heat.

**Insider trading** costs $100 in clean or dirty cash and reveals the top card of the
current era deck to the buyer only. +1 Heat.

Bribery being payable in dirty cash is what stops dirty money from being a pure
liability — it gives the underworld branch its own internal economy.

---

## 11. Era decks

The physical Chance and Community Chest cards are not used. Landing on squares 7, 22,
36 (Chance) or 2, 17, 33 (Community Chest) causes the facilitator to tap a draw button,
and the app draws from the current era's deck.

Four decks of approximately 20 cards each. Shuffle order is recorded as an event at
era start, so games remain exactly replayable.

Cards may reference live game state, which physical cards cannot. Representative
examples by era:

- **Era I:** "Zoning variance approved. Build one house at half cost."
- **Era II:** "Vice squad reshuffle. All players reduce Heat by 2."
- **Era III:** "Ratings downgrade. All mezzanine tranches lose 30% of face value."
- **Era IV:** "Audit sweep. The player holding the most dirty cash forfeits 40% of it."
- **Era IV:** "Covenant breach. The most leveraged player is margin-called immediately."

Full deck contents are an implementation deliverable, authored against the same
constants module the engine imports.

---

## 12. Scoring and win conditions

```
NET WORTH =   clean cash
            + deed face value
            + building cost
            + instruments held, marked to model
            - drawn credit balance
            - peer loan balances owed
            - distressed debt
            - CDS notional written and triggered
            + dirty cash x 0
```

**Marking instruments to model**, all computed by the engine:

| Instrument | Mark |
|---|---|
| Rent future held | Remaining expected value from the Markov model |
| CDO tranche held | Expected remaining cashflow through the waterfall |
| Loan note held | `principal x (1 − 0.15 x min(borrowerLeverage, 4))` |
| Deed option held | `max(0, deed face value − strike)` |
| CDS bought, untriggered | Zero |
| CDS written, untriggered | Zero; the 30% collateral reduces borrowing base, not net worth |

`borrowerLeverage` is the borrower's drawn credit balance divided by their borrowing
base, so a note against an unlevered player marks at par and a note against a player at
4x or worse marks at 40% of principal.

**Default win condition:** highest net worth after round 24.

**Alternative, set by the admin at setup:** first player to reach a configured net
worth target. The app tracks and displays progress toward it.

---

## 13. Randomness inventory

Four sources total, and only the first is imposed on the player:

1. **Dice** — physical, unavoidable, the dominant source
2. **Era deck draws** — on the six card squares, roughly one draw per player per two rounds
3. **Speakeasy rolls** — opt-in only
4. **Audit checks** — driven by Heat, which is entirely self-chosen

Everything else — interest, waterfalls, ratings, valuations, margin calls, draft
resolution, scoring — is deterministic.

---

## 14. Architecture

### Keystone decision: randomness is data, never code

The engine is a pure reducer, `reduce(state, event) => state`. It contains **no
`Math.random` and no `Date.now`, anywhere.** Randomness enters exclusively as event
payload carrying values the physical dice already produced:

```ts
{ type: 'DiceRolled',    player: 'P2', dice: [3, 5] }
{ type: 'CardDrawn',     deck: 'era3', index: 7 }
{ type: 'AuditChecked',  player: 'P4', dice: [1, 2] }
```

Three required properties follow directly:

- **Undo is free.** Truncate the log and replay.
- **End-to-end tests assert exact values**, not statistical ranges. A full 24-round
  game can be scripted and its final net worths asserted precisely.
- **The dice on the table are the RNG.** There is no server-side shuffle anyone must trust.

### Bounded contexts

Seven contexts, each with a typed public interface, each independently testable, each
under the 500-line file limit. The dependency graph is also the build order.

| Context | Owns | Depends on |
|---|---|---|
| `session` | players, rounds, eras, config, scoring | — |
| `board` | movement, landing, rent, Markov pricing model | — |
| `draft` | ranked-triple submission, collision resolution | session |
| `credit` | credit lines, peer loans, interest, margin calls, distressed debt | session, board |
| `underworld` | ventures, dirty cash, heat, laundering, audits | session, board |
| `markets` | rent futures, deed options, valuation | board, credit |
| `securitization` | pools, tranches, ratings, waterfall, CDS | credit, markets |

### Package layout

```
packages/engine      pure TypeScript, zero I/O, zero runtime dependencies
packages/server      Fastify + ws + SQLite (better-sqlite3), Zod at every boundary
packages/web         React + Vite + TypeScript + Tailwind
packages/rulebook    rulebook generator, sourced from the engine's constants
.claude/skills/leverage-facilitator/
tests/e2e            Playwright
docs/  scripts/  config/
```

### Server

An append-only `events` table plus periodic snapshots; the log is the database.
Commands are validated against current state and either rejected or emitted as events.
State changes broadcast over WebSocket to all connected clients.

Authentication is a room code plus a signed per-player token in the URL, with a
separate admin token. No accounts, no passwords, no API keys. Four players and a
facilitator is a trivial load.

REST surface consumed by the facilitator agent:

```
GET  /api/game/:id/state          current derived state
GET  /api/game/:id/log            full event log
GET  /api/game/:id/valuation/:ref engine valuation for any instrument
GET  /api/rules/:topic            ruleset reference
```

### Frontend

One bundle, three shells:

- **`/admin`** — enter dice rolls, advance phase, draw cards, round clock, undo, and
  full view-and-edit override of any player's cash, deeds, heat, contracts and debt.
  The facilitator can also act on behalf of any player.
- **`/p/:token`** — the player view: cash, dirty cash, heat, deeds, credit gauge, live
  contracts, and an era-gated action panel.
- **`/table`** — optional projector view for a television: leaderboard, era, prevailing
  rate, Treasury balance, live contracts.

**Players act in their own view.** Routing every action through the facilitator would
serialize the Open phase and destroy the one mechanism keeping the game inside its time
budget. The admin override exists on top of player self-service, not instead of it.

### Assist panel

The player view surfaces **the math, never the move**: expected values, landing
probabilities, credit headroom, and hard warnings such as "mortgaging this triggers a
margin call" or "your audit probability this round is 58%".

It never ranks or recommends actions. Driven by deterministic heuristics computed in
the engine — not an LLM, because there is no key and it must be instant. The goal is to
close the information gap between players without closing the skill gap.

**Venture payoffs must always be shown at their laundered value, never their dirty
value.** Simulation puts the gap between correct and naive underworld play at roughly
$1,290 — the largest skill cliff anywhere in the economy — and it exists almost entirely
because ventures cost clean cash and pay dirty, so a venture must return over 133% of
its cost merely to break even before Heat is counted. A player reading the raw dirty
figure walks straight into it. Displaying the laundered number is the single highest-value
thing the assist panel does.

### Facilitator agent

`.claude/skills/leverage-facilitator/` ships in the repo containing the full ruleset as
reference files. Claude Code in the operator's terminal queries `localhost` over the
REST surface above. It is **read-only against game state** — it answers rules questions,
flags what needs to happen this round, and drafts between-round summaries. It proposes
admin actions; the human executes them.

### Rulebook

Generated from the same constants module the engine imports, so it cannot drift from
the implemented rules. Era-aware, with a "what is new this era" view. Served at
`/rulebook` and publishable as a standalone artifact for players' phones.

---

## 15. Testing

Three layers, all run by GitHub Actions on every push.

**Unit (Vitest)** — mock-first, one test per rule. Every context's public interface.

**Property-based (fast-check)** — invariants that must hold across all generated
histories:

- Money is conserved: player cash + Treasury + bank equals the constant total
- The waterfall never distributes more than the pool collected
- `replay(log)` is identical to accumulated state
- Clean cash never goes negative (shortfalls become distressed debt instead)
- Borrowing base is never negative; drawn balance never exceeds base outside a flagged margin call

**End-to-end (Playwright)** — five concurrent browser contexts, one admin and four
players, against the real server:

1. Full seven-round draft: 28 deeds allocated, 7 per player, budgets correct, cascades resolved
2. Margin call leading to forced liquidation at the 70% floor
3. Rent future originated, resold, matured, paid out; encumbrance survives a deed trade
4. CDO built, rated, waterfall paid, underlying defaults, CDS triggers
5. Venture launched, dirty cash accrued, laundered, audit fires, cash seized
6. Distressed debt path: player cannot pay, keeps playing, scores negative
7. **Full scripted 24-round game asserting exact final net worths**

Scenario 7 is the strongest regression test available to the project, and it is only
possible because of the randomness-as-data decision.

---

## 16. Hosting

**Game night:** `npm run game` starts the server, opens an ngrok tunnel, and prints
four player URLs plus a QR code for the table. Game state persists in SQLite on the
operator's machine, so tunnel restarts and page reloads are both non-events.

**Later:** a Fly.io free-tier deploy configuration for a stable URL that survives a
laptop reboot. WebSockets are supported and SQLite lives on a volume. Deferred until
the game has been played at least once.

---

## 17. Build waves

```
Wave 0            repo, monorepo scaffold, CI, shared types, event schema
Wave 1  x3  ║     session   │  board + Markov  │  draft
Wave 2  x2  ║     credit    │  underworld
Wave 3  x2  ║     markets   │  securitization
Wave 4  x3  ║     server    │  web shell       │  rulebook generator
Wave 5            era decks, E2E suite, hosting scripts, facilitator skill
```

Waves 1 through 4 parallelize across subagents along bounded-context lines. Each
context has a typed interface agreed in Wave 0, so parallel work does not collide.

---

## 18. Decisions deliberately made against alternatives

| Decision | Rejected alternative | Reason |
|---|---|---|
| Landing-only rent plus a futures market | Per-round base yield | Keeps Monopoly's texture; moves variance management into a tradeable market rather than smoothing it away by rule |
| Ranked-triple draft submission | One pick per round with live collision bidding | Single submission, instant resolution, no cascading negotiation rounds |
| Single $3,000 budget | Split acquisition and operating budgets | Preserves the deeds-versus-liquidity tension; split budgets make full spending strictly correct |
| Escalating era rates | Per-round Boom/Recession macro cycle | One less random system to track and explain; the rate curve creates the crisis arc deterministically |
| Distressed debt | Elimination on bankruptcy | No dead players watching for an hour |
| App-drawn era decks | Physical Chance and Community Chest | Cards can reference live state; content scales with the era; nothing to print |
| Bonds and REIT shares cut | Including them | Bonds duplicate peer loans; REIT shares duplicate rent futures. Neither earned its teaching cost |
| No enforced timer | Hard auto-lock at zero | Operator judgment beats a rule that will eventually cut off a half-finished trade |

---

## 19. Rule clarifications

Every rule below was found underspecified while writing the ruleset out for players.
Each one blocks an implementation decision, so each is resolved here explicitly. These
are binding.

### 19.1 Settlement order

Settlement steps resolve in exactly this sequence. Order is observable — whether an
audit fine can itself trigger a margin call in the same Settlement depends on it:

1. Rent futures reaching their end round expire
2. Venture payouts accrue as dirty cash; venture timers decrement
3. Carrying cost charged, $8 per unmortgaged deed
4. Credit line interest accrues on drawn balances
5. Peer loan interest falls due; unpaid loans default
6. Pool waterfalls distribute collected cash
7. CDS premiums transfer from buyers to sellers
8. Distressed debt accrues at 15%, compounding
9. Audit checks roll, Era III onward, and resolve immediately
10. Margin calls flagged; previously-flagged uncured positions marked for liquidation
11. Deed options reaching expiry lapse

Audits resolve at step 9, **before** margin flagging at step 10, so an audit fine can
and should trigger a margin call in the same Settlement.

On round 24 only, three further steps follow: all pools terminate, every tranche short
of face triggers its referencing CDS, then scoring runs.

### 19.2 Rent futures — who pays, who receives, and how hits are counted

Rent is owed by whichever player lands on the deed, **except its owner, who owes
nothing**. The recipient is the futures holder if a contract is active, otherwise the
owner.

If the futures holder lands on the deed and is not its owner, they would owe rent to
themselves. **No payment occurs.**

Valuation converts the Markov chain's per-roll probabilities to expected hits per
round by multiplying by the number of players who can owe rent — three, being all
players other than the owner — and by 1.19 to account for the extra rolls generated by
doubles. The engine exposes this figure directly so no player ever computes it.

### 19.3 Equity tranche ratings

Equity has no face amount, so it needs an explicit claim for the coverage formula. Its
claim is `expected pool cashflow − senior face − mezzanine face`. Coverage therefore
evaluates to approximately 1.0, and equity ordinarily rates CCC. This is correct: the
residual tranche is genuinely the riskiest.

### 19.4 Collateral on a pooled loan note

When a peer loan held inside a pool defaults, its collateral deeds are sold to the bank
at the standard liquidation floor of 70% of face value, and the proceeds enter the
pool's collected cash for that round's waterfall.

Deeds cannot be distributed through a waterfall, only cash — this converts them.

### 19.5 Ventures interact with rent charged, not rent received

Escort Service and Chop Shop pay their bonus to **the deed's owner**, calculated on rent
*charged* on deeds they own, regardless of who actually receives that rent.

Selling a rent future therefore does not extinguish your venture income, and a futures
holder running their own Escort Service earns nothing from deeds they do not own. This
avoids a recursive case and keeps ventures attached to operating property rather than to
a cashflow claim.

### 19.6 Mortgaging a developed property

Buildings must be sold back before a property can be mortgaged, following the standard
even-build rule across the colour group. Buildings sell back to the bank at **50% of
their purchase cost**.

### 19.7 Distressed debt

Repayable at any time during an Open phase. Accrues at 15% **compounding** per round.
It is **not** automatically swept from spare clean cash at Settlement — repayment is
always the player's choice, and the compounding rate is the pressure.

### 19.8 Forced liquidation has its own window

Forced liquidation does not occur during Settlement. Positions are marked at Settlement
step 10 and resolve at the **start of the next Open phase**, before other actions, as a
facilitator-run auction among the other three players.

**Liquidation applies only to uncured margin calls.**

### The obligation waterfall

Every obligation in the game — rent, interest, carrying cost, taxes, audit fines, CDS
premiums, peer loan interest — resolves through one path:

1. **Clean cash**, to the extent available.
2. **Any shortfall capitalises into the drawn credit balance**, *without regard to the
   borrowing base*.
3. A player is never left unable to pay. There is no third step at this stage.

Step 2 is deliberately uncapped, and it is the only mechanism by which a drawn balance
comes to exceed a borrowing base. **Voluntary** draws, by contrast, are always capped at
the base. This distinction is what makes section 19.1 true: an audit fine a player cannot
cover from clean cash raises their drawn balance, and if that pushes them past their
base, the margin call flagged at step 10 of the same Settlement is a direct consequence
of the audit resolved at step 9.

A small unpayable bill therefore does *not* trigger an auction. It capitalises, the
drawn balance rises slightly, and if the player is still inside their base nothing
further happens. The liquidation machinery engages only on an actual breach.

### Distressed debt is the terminal state

Distressed debt arises in exactly one circumstance: a margin call went uncured, the
forced liquidation ran, and it stopped because the player had no unmortgaged deeds
left. Whatever shortfall remains becomes distressed debt at 15% compounding.

It therefore means something precise — *you are underwater and have nothing left to
sell* — rather than being a general-purpose bucket for unpaid bills. This is what keeps
a broke player making decisions rather than stalling the table.

### 19.9 Ventures on mortgaged deeds

A mortgaged deed charges no rent, so Escort Service and Chop Shop bonuses computed on
it are **zero**. Section 19.5's "regardless of who receives it" governs the *recipient*
of rent, not whether rent was charged at all.

### 19.10 A second peer loan default does not halve again

The borrowing base penalty for defaulting on a peer loan is a single permanent halving.
Subsequent defaults carry the collateral loss and the write-off but do not compound the
penalty. Two halvings against a 75% advance rate would take a player to 18.75%, which is
a functionally different and much crueller game than a single floor at 37.5%.

### 19.11 Jail does not reduce the rent-payer count

The ×3 multiplier in 19.2 assumes three opponents can owe rent each round. This holds:
under the mandatory pay-to-leave convention a jailed player still rolls and moves on
their next turn, so no player is ever absent from a round. A player sent to Jail
mid-turn takes no further roll that round, which the Markov model already accounts for.

### 19.12 Forced liquidation extinguishes encumbrances

A forced liquidation **cancels any rent future and any deed option on the liquidated
deed**. The futures holder receives the standard make-whole payment; the option holder
receives a refund of their premium. Both amounts are added to the liquidated player's
shortfall.

Deed options otherwise lock the underlying deed against sale, trade and mortgage, and
rent futures otherwise follow the deed to a new owner. Neither survives liquidation, and
the deed reaches auction unencumbered.

This closes two exploits that the encumbrance rules would otherwise open. If locks
blocked liquidation, a distressed player could write a $1 option on every deed and
become judgment-proof. If encumbrances instead followed the deed into the auction, a
player could write a $1-strike option to a confederate, be liquidated, collect the
bank's 80% floor, and have the confederate exercise for a dollar. Extinguishing on
liquidation removes the value of both manoeuvres.

### 19.13 Heat timing

The laundering haircut is computed from the player's Heat **before** that transaction's
+1 is applied. At Heat 3 the haircut is 25%, not 30%.

Heat decays by 1 in any round in which the player takes no *deliberate* dirty action —
launching a venture, laundering, bribery, or insider trading. **Automatic payouts from
an already-running venture do not block decay.** Without this, a six-round Numbers
Racket would make cooling down impossible before audits begin.

---

## 20. Validated reference data

### Landing probabilities

Derived from a 120-state Markov chain over `(square, consecutive doubles)`, modelling
the exact 2d6 distribution, the three-consecutive-doubles rule, the Go To Jail square,
and the mandatory pay-to-leave-Jail convention from section 2.

**The era decks contain no movement cards**, so squares 2, 7, 17, 22, 33 and 36 are
ordinary resting squares and square 30 is the only relocating square on the board.
**Published Monopoly landing tables therefore do not apply to this game** — every
figure in circulation assumes the standard movement decks, and citing them here would
be wrong.

Verified three independent ways: power iteration against a linear solve of
`π(P − I) = 0` agreeing to 2.1e-16, and a 40-million-roll Monte Carlo matching every
square to within 0.006 percentage points.

- Derivation script: `scripts/landing_probs.py`
- Golden fixture the engine must reproduce: `tests/fixtures/landing-probabilities.json`
- Full table: `docs/reference/landing-probabilities.md`

**Traffic by group**, which is the single most important dataset for pricing rent
futures and for valuing deeds in the draft:

| Group | Combined | Per square |
|---|---|---|
| Railroads (4) | 9.97% | 2.49% |
| Orange (3) | 8.23% | **2.74%** |
| Yellow (3) | 8.10% | 2.70% |
| Red (3) | 8.02% | 2.67% |
| Green (3) | 7.74% | 2.58% |
| Pink (3) | 7.25% | 2.42% |
| Light Blue (3) | 6.82% | 2.27% |
| Utilities (2) | 5.06% | 2.53% |
| Brown (2) | 4.63% | 2.31% |
| Dark Blue (2) | 4.44% | 2.22% |

Three consequences the design depends on:

**Orange is the strongest colour group per square** at 2.74%. Jail is the most-landed
square on the board at 5.33%, and the orange group sits six to nine squares past it,
squarely inside the 2d6 sweet spot. With card movement removed, Jail traffic is now the
*entire* explanation for orange's strength rather than one contributor among several.

**The railroads lead by count, not by quality.** Their 9.97% combined is the highest of
any set, but at 2.49% per square they sit *below* board average — lower than orange,
yellow, red and green. They are strategically valuable because four deeds acquired
individually form a set requiring no trade, no colour-group completion and no even-build
development, which sidesteps the rare-monopolies problem entirely. They are not valuable
because any individual railroad is heavily trafficked.

**Dark blue is the least-trafficked group on the board** at 2.22% per square. Boardwalk
draws 2.26%, below Mediterranean Avenue. Its rent is enormous and its frequency is the
worst on the board, so correctly priced rent futures on it sit far below where player
instinct will place them — a deliberate and durable source of edge.

### Traffic is deliberately flatter than standard Monopoly

Removing card movement narrows the spread between the busiest and quietest property by
**44.5%** — from a 1.50x ratio to 1.27x. The busiest property is now Tennessee Avenue
(2.77%) and the quietest is Park Place (2.19%).

This is accepted, and it shifts where deed value comes from. With traffic close to
uniform, a deed's worth is dominated by its **rent table and development potential**
rather than by its position — and development is a variable players control rather than
one the dice hand out. Rent futures accordingly price mostly off what is built, which
makes the market a read on opponents' building intentions rather than on board geometry.

One consequence for tuning: the six card squares are not equally likely. Square 17 sits
on the wave crest seven past Jail and draws 2.82%, while square 7 draws 2.27% — roughly
24% less often. Era deck draw rates are set by board geometry, not by card design.

### Economy simulation

172,000 simulated games across 43 configurations. Money conservation verified in 100%
of trials on two independent checks: a three-pool invariant, and a bottom-up flow-ledger
reconciliation. The movement engine was validated separately against the landing
probabilities above.

- Simulation: `scripts/economy_sim.py` (`--v2` runs the carrying-cost study)
- Results: `docs/reference/economy-results.md`, `docs/reference/economy-results-v2.md`

Behaviour of the specified configuration:

| Measure | Value |
|---|---|
| Credit drawn at some point | 93% of games |
| Peak total table debt | $2,142 (p90 $3,360) |
| Bankruptcy rate | 4.8% |
| Median player cash floor | $594 |
| Player-rounds below $200 | 1.6% |
| Top-draft-position win rate | 24% (25% is neutral) |
| Money supply over 24 rounds | −29% |

Rejected alternatives, with the reason each failed:

| Tested | Result |
|---|---|
| Ad-valorem carrying cost, 1–4% of portfolio value | **Inverts the draft.** Top-drafter win rate 28% → 18%; structural, not tunable |
| 4% ad-valorem rate | Bankruptcy 20.4%, over double the 10% ceiling |
| Carrying cost from round 7 | Peak debt collapses $2,142 → $1,157; players bank an uncatchable cushion |
| $3,000 starting cash | Economy inflates 27%; credit used in only 30% of games |
| $3,500 starting cash | Peak table debt $158. The financial layer never activates |
| $2,000 starting cash | Breaks the draft — the table cannot clear 28 deeds |
| Era II stimulus as a grant | $1,200 of permanent inflation; Treasury recovers 2% of outlay |

### Why the game is 24 rounds

The round count is a constraint, not a preference. Simulated at 36 rounds, player
bankruptcy reaches 43% under the earlier configuration and 82% under this one. The
cause is Era IV's open-ended 12% rate tier: a 24-round game spends six rounds there,
a 36-round game spends eighteen.

**24 rounds is near the maximum this rate curve supports.** A longer format would
require capping Era IV at 8–10% and giving the Treasury a spending mechanism. The
carrying cost is not what would need to change.

### Development, and why building is aggressive

Building aggression is not a tunable assumption — it is an equilibrium. Run as a
tournament with two players on each policy at the same table sharing the same dice,
aggressive building wins at every level tested (55%, 54%, 52%, 51%), flattening around
a 0.75 cash-reserve ratio.

The cause is in section 12: **buildings are scored at full cost.** Building therefore
converts cash into an asset marked at par which also earns rent, so the cautious policy
is dominated. A player who under-builds to stay liquid loses.

At that equilibrium the carrying cost suppresses development by **13%** — 17.0 houses
against a levy-free control of 19.6. House costs are accordingly set to **90% of
standard**, which recovers about 65% of the gap at 18.7 houses while leaving credit
pressure, distress rates, money supply and draft fairness essentially unmoved.

The exchange rate for further cuts, should playtesting show rents still too flat: each
additional 10% price cut buys +1.5 houses and +1.5 percentage points of early-monopoly
win rate. Development is cheap in credit terms and expensive in fairness terms — the
early-monopoly net worth edge widens from +13% to +31% at a 30% cut. A 20% cut is the
next step if needed; beyond that the fairness cost dominates.

### Rejected: raising the building advance rate

Advancing 75% against building cost instead of 50% was tested. It does almost nothing
for development (17.0 to 17.5 houses) though it does raise peak table debt to $3,230,
which would help the securitization layer.

**It is rejected because it breaks liquidation convergence.** Buildings sell back at 50%
of cost, so if they advanced at 75% of cost, stripping a developed deed would widen the
shortfall by 25% of building cost — the same class of bug as the liquidation floor
in section 5.

`BUILDING_ADVANCE_RATE` must never exceed the building sell-back rate. The engine
asserts this alongside the floor-versus-advance-rate check.
