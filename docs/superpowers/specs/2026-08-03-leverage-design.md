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
| **II — Expansion** | 7–12 | 6% | Peer loans, rent futures, ventures, laundering, bribery. Treasury pays $300 stimulus to each player at the start of round 7. |
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

- **Rent tables** are standard, including the full-colour-group doubling on undeveloped
  sets, railroads at $25/$50/$100/$200 for one through four owned, and utilities at 4x
  or 10x the dice roll for one or two owned.
- **Building** requires ownership of the full unmortgaged colour group and follows the
  even-build rule. House and hotel costs are standard.
- **House and hotel supply is limited** to 32 houses and 12 hotels. The housing shortage
  is a legitimate and deliberate strategy.
- **Mortgages** pay 50% of face value; unmortgaging costs 55%. A mortgaged property
  collects no rent and contributes nothing to the borrowing base.
- **GO** pays $200 on passing or landing, from the Treasury.
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
   property, they skip that round and receive **$150** in compensation.

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

### Starting position

Each player receives a **single unified budget of $3,000**. The draft spends from it;
whatever remains is that player's operating cash. There is no separate acquisition
budget, so the deeds-versus-liquidity tradeoff is made before a die is rolled.

```
STARTING TOTAL                     $12,000   ($3,000 x 4)
TOTAL FACE VALUE OF 28 DEEDS        $5,690
EXPECTED DRAFT OUTFLOW             ~$6,700   (face + contest premiums)
                                       ↓
EXPECTED HOLDINGS AFTER DRAFT      ~$5,300   (~$1,325 each)
```

### Treasury

Draft proceeds flow to a **Treasury**, not out of the game. The Treasury pays out on a
fixed schedule and takes in all interest paid to the bank:

| Flow | Direction | Amount |
|---|---|---|
| Draft proceeds | In | ~$6,700 |
| Credit line interest | In | variable |
| GO salary | Out | $200 per pass |
| Era II stimulus | Out | $300 per player, once, at round 7 |

The Treasury may run a deficit; it is an accounting entity, not a constraint. Its
balance is displayed to all players as a macro indicator.

---

## 5. Bank credit

A revolving credit line. Draw and repay freely during any Open phase.

**Borrowing base** = 50% of unmortgaged deed face value + 25% of building cost.

Interest accrues each Settlement on the drawn balance at the era's prevailing rate
and is paid to the Treasury. If a player cannot pay interest from clean cash, the
interest capitalises into the drawn balance.

### Margin calls

If drawn balance exceeds borrowing base at Settlement — because the player mortgaged,
sold, or lost a deed — the position is flagged. The player has until the end of the
next Open phase to cure it by repaying or by raising the base.

If uncured, the app force-liquidates. Deeds are offered to the other three players in
descending face-value order. Each is sold to the highest bid at or above **70% of face
value**; if no player bids, the bank takes it at exactly 70%. The deed becomes
unowned-by-bank and is not re-drafted. Proceeds pay down the drawn balance until the
position is cured.

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
| **Escort Service** | $300 | 4 rounds | +40% of all rent collected, paid in dirty cash | +2 |
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

## 19. Validated reference data

### Landing probabilities

Derived from a 120-state Markov chain over `(square, consecutive doubles)`, modelling
the exact 2d6 distribution, the three-consecutive-doubles rule, the Go To Jail square,
and all sixteen Chance and sixteen Community Chest cards with recursive destination
resolution. Assumes the "pay to leave Jail immediately" convention.

Verified three independent ways: power iteration against a linear solve of
`π(P − I) = 0` agreeing to 5.3e-16, and a 40-million-roll Monte Carlo matching every
square to within 0.005 percentage points.

- Derivation script: `scripts/landing_probs.py`
- Golden fixture the engine must reproduce: `tests/fixtures/landing-probabilities.json`
- Full table: `docs/reference/landing-probabilities.md`

**Traffic by group**, which is the single most important dataset for pricing rent
futures and for valuing deeds in the draft:

| Group | Combined | Per square |
|---|---|---|
| Railroads (4) | 11.38% | 2.85% |
| Orange (3) | 8.81% | 2.94% |
| Red (3) | 8.76% | 2.92% |
| Yellow (3) | 7.97% | 2.66% |
| Green (3) | 7.80% | 2.60% |
| Pink (3) | 7.54% | 2.51% |
| Light Blue (3) | 6.88% | 2.29% |
| Utilities (2) | 5.41% | 2.71% |
| Dark Blue (2) | 4.81% | 2.41% |
| Brown (2) | 4.29% | 2.15% |

Two consequences the design depends on:

**The railroads are the most valuable set on the board** at 11.38% combined traffic,
exceeding every colour group. Because they are acquired individually and need no
even-build development, they constitute a monopoly nobody has to be traded into — which
makes them the most contested deeds in the draft, exactly as intended.

**Dark blue is traffic-poor.** Boardwalk (2.62%) is landed on less often than Kentucky
Avenue (2.84%), and the group as a whole ranks ninth of ten. Boardwalk's rent is
enormous but its frequency is not, so correctly priced rent futures on it sit well below
where player instinct will place them. This is a deliberate source of edge for players
who read the data the app provides.

Jail is the most-landed square overall at 6.22%, which is why the orange group — sitting
six to nine squares past Jail, squarely inside the 2d6 sweet spot — leads all colour
groups per square.
