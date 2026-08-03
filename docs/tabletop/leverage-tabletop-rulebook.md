# LEVERAGE — Tabletop Rulebook

**A facilitated Monopoly variant for four players and one facilitator. No app. No screens. Everything is in this document.**

This is the pen-and-paper edition of LEVERAGE. The design spec assumes a web application owns
the financial layer and computes every number. This edition removes that assumption: the
facilitator and the players do the arithmetic, and every figure the app would have computed is
either precomputed in **Part 5** or reduced to a lookup and one multiplication.

Nothing in the game was cut to achieve that. The draft, the credit lines, the rent futures
market, peer loans, CDOs, credit default swaps, deed options, the underworld economy and the
era decks are all here. What changed is *who computes* and *how the record is kept* — and those
two changes are the whole content of Part 4.

Companion file: **[`leverage-tabletop-cards.md`](leverage-tabletop-cards.md)** — all 80 era
cards, formatted to print and cut.

---

## Contents

**Part 0 — Before you start**
- [0.1 What you need](#01-what-you-need)
- [0.2 The facilitator's job](#02-the-facilitators-job)
- [0.3 How the paper layer works](#03-how-the-paper-layer-works)
- [0.4 Four rules that govern everything](#04-four-rules-that-govern-everything)

**Part 1 — Setup and the draft**
- [1.1 The thirty-second version](#11-the-thirty-second-version)
- [1.2 Setup, in order](#12-setup-in-order)
- [1.3 The draft](#13-the-draft)
- [1.4 A worked draft round](#14-a-worked-draft-round)

**Part 2 — The round**
- [2.1 The four phases](#21-the-four-phases)
- [2.2 Movement](#22-movement)
- [2.3 Settlement](#23-settlement)

**Part 3 — The rules, by era**
- [3.1 Era I — Recovery](#31-era-i--recovery-rounds-16)
- [3.2 Era II — Expansion](#32-era-ii--expansion-rounds-712)
- [3.3 Era III — Financialization](#33-era-iii--financialization-rounds-1318)
- [3.4 Era IV — Reckoning](#34-era-iv--reckoning-rounds-1924)
- [3.5 Scoring](#35-scoring)

**Part 4 — Facilitator's operating manual**
- [4.1 The Settlement script](#41-the-settlement-script)
- [4.2 Running the forced-liquidation auction](#42-running-the-forced-liquidation-auction)
- [4.3 Valuing things when asked](#43-valuing-things-when-asked)
- [4.4 Rulings, disputes and pace](#44-rulings-disputes-and-pace)

**Part 5 — Reference tables**
- [5.1 Constants](#51-constants)
- [5.2 Deeds: price, rent, credit value, traffic](#52-deeds-price-rent-credit-value-traffic)
- [5.3 The futures table](#53-the-futures-table)
- [5.4 Credit, interest and distressed debt](#54-credit-interest-and-distressed-debt)
- [5.5 The underworld](#55-the-underworld)
- [5.6 Ratings and marks](#56-ratings-and-marks)
- [5.7 Board traffic](#57-board-traffic)

**Part 6 — Worked examples**

**Part 7 — Printable forms**

**Part 8 — Notes**
- [8.1 Deviations from the app spec](#81-deviations-from-the-app-spec)
- [8.2 Variants and trims](#82-variants-and-trims)

---
---

# Part 0 — Before you start

## 0.1 What you need

| Item | Notes |
|---|---|
| A standard Monopoly board | Any edition with the classic US board. You need the squares, not the cards. |
| The 28 title deeds | Handed out in the draft, not bought by landing. |
| 32 houses and 12 hotels | The supply cap is a real rule and a real strategy. |
| Two dice | The only randomiser in the game apart from the era decks. |
| The money | Use the set's notes. The bank is unlimited; write an IOU if you run out of a denomination. |
| **The Chance and Community Chest cards** | **Not used.** Put them back in the box. |
| Era decks I–IV | Printed and cut from `leverage-tabletop-cards.md`. Four piles of 20. |
| Contract cards | ~40 blank index cards. See 0.3. |
| Player sheets | One per player, printed from Part 7. Pencil, not pen. |
| Facilitator's register | Printed from Part 7. Clipboard recommended. |
| A calculator | One is enough. The facilitator holds it. Phones are fine. |
| This rulebook | One copy for the facilitator. Part 5 photocopied for the table is a big help. |

**Time.** Budget **3 to 3.5 hours** including setup, for a table that has not played before. The
app edition targets 2 to 2.5; the difference is arithmetic done by hand. Section 8.2 has a
16-round variant that lands near 2 hours if that matters.

**Table shape.** The facilitator sits where they can see all four player sheets. Players should
be able to reach each other — most of this game is people negotiating across a table.

## 0.2 The facilitator's job

You are not a referee who watches. You are the clock, the registrar and the calculator. Four
things are yours and nobody else's:

1. **Advance the phases.** Say the phase name out loud. Nothing else marks time.
2. **Keep the contract register.** Every rent future, peer loan, deed option, CDO pool, tranche
   and CDS is written on a card and listed in your register. If it is not in the register, it
   does not exist.
3. **Run the Settlement script** (4.1). You read the eleven steps; the players do their own
   line of arithmetic simultaneously. This is the single mechanism that keeps the game inside
   its time budget.
4. **Answer valuation questions** (4.3). Players will ask "what is this future worth?" You look
   it up in 5.3 and read the number. You do not advise on whether to take the deal.

**You do not play.** You have no money, no deeds and no opinion about who should win.

**The one thing you must be strict about:** a deal is not a deal until both parties have said
the terms out loud and you have written the contract card. Verbal agreements that were never
registered are the only thing that can genuinely break this game.

## 0.3 How the paper layer works

The app kept four kinds of state. Here is where each one lives instead.

### Clean cash → physical notes

Ordinary Monopoly money, in front of each player, public. The bank pays and receives as usual.

### The Treasury → a marked pile

The Treasury is a separate pile from the bank, or a written running total on the facilitator's
register — a total is easier. It takes in draft proceeds, carrying costs, taxes, fines and all
credit-line interest. It pays out GO salary, the round-7 stimulus and every card that says "from
the Treasury."

**The Treasury may go negative.** It is an accounting entity, not a constraint. Announce its
balance at the start of each era; it is a genuine macro indicator and players will read it.

### Positions and balances → the player sheet

Each player keeps their own sheet (Part 7) in pencil: deeds owned, buildings, drawn credit
balance, borrowing base, distressed debt, dirty cash and Heat. **Players do their own
arithmetic.** The facilitator spot-checks during Settlement and is the final authority.

**Dirty cash is written, never physical.** It is a tally on the sheet, not notes on the table.
This is deliberate: dirty cash can only be spent on four things and is seizable in full, so
mixing it with real notes causes errors every time.

### Contracts → index cards, held by the holder

This is the load-bearing invention of the paper edition. **Every instrument is a physical card,
and the card is the ownership record.** Selling a rent future means handing over the card.

Write the card once, at origination. Both parties read it back. The facilitator copies the key
terms into the register and initials the card.

```
┌──────────────────────────────────────────────┐
│ RENT FUTURE                        #F-03     │
│ Property:  Tennessee Ave                     │
│ Originator (owner):  Ana                     │
│ Window:  rounds 12 – 19  (8 rounds)          │
│ Price paid:  $600                            │
│ HOLDER: ___Ben___  (strike through & rewrite │
│                     on each resale)          │
│                                       [ fac ]│
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ PEER LOAN NOTE                     #L-07     │
│ Borrower:  Dev        Lender: Cass           │
│ Principal: $400   Rate: 7%/round             │
│ Term: rounds 14 – 20                         │
│ Collateral: Vermont Ave, Connecticut Ave     │
│ HOLDER: ___Cass___                           │
│ Interest due each Settlement: $28            │
│                                       [ fac ]│
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ DEED OPTION                        #O-02     │
│ Underlying: Illinois Ave    Writer: Ben      │
│ Premium paid: $90    Strike: $300            │
│ Expires: end of round 20                     │
│ HOLDER: ___Dev___                            │
│ ** WRITER MAY NOT SELL / TRADE / MORTGAGE ** │
│                                       [ fac ]│
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ CDO POOL                           #P-01     │
│ Originator: Cass                             │
│ Underlying: L-07, L-09, F-03                 │
│ Expected pool cashflow: $2,080               │
│ SENIOR   face $700   held by: ____           │
│ MEZZ     face $600   held by: ____           │
│ EQUITY   residual    held by: ____           │
│ Collected-to-date tally on reverse.          │
│                                       [ fac ]│
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ CREDIT DEFAULT SWAP                #S-01     │
│ Reference: P-01 SENIOR                       │
│ Buyer: Dev        Seller: Ana                │
│ Notional: $700    Premium: $40 / Settlement  │
│ Seller posts 30% of notional = $210          │
│   against borrowing base                     │
│                                       [ fac ]│
└──────────────────────────────────────────────┘
```

Number the cards as you write them: **F-** futures, **L-** loans, **O-** options, **P-** pools,
**S-** swaps. The numbers are how the register stays readable.

### The register

One line per contract, on the facilitator's clipboard. Its job is to answer "what is due this
Settlement?" in five seconds. Layout in Part 7.

## 0.4 Four rules that govern everything

**Round down.** Every percentage result rounds **down to the nearest $1**. Interest, laundering
haircuts, mortgage values, card effects, everything. There are no cents in this game.

**Clean cash never goes negative.** If a player cannot meet an obligation, follow the obligation
path (3.1) — clean cash, then credit line, then, for uncured margin calls only, liquidation, and
any residual becomes distressed debt. **Nobody is eliminated, ever.**

**The owner never owes rent on their own deed.** Three players can owe you rent, not four. This
single fact drives every valuation in Part 5.

**A contract is what its card says.** If the card and someone's memory disagree, the card wins.
If the card and this rulebook disagree, the rulebook wins and the card gets rewritten.

---
---

# Part 1 — Setup and the draft

## 1.1 The thirty-second version

You are playing Monopoly with the luck taken out of acquisition and put into a bond market.

Before anyone rolls, all 28 deeds are handed out in a seven-round sealed-bid draft. You end with
exactly seven. Nobody starts with a monopoly and almost nobody finishes with one, so you trade.

The game runs exactly 24 rounds. Nobody goes bankrupt and nobody is eliminated. If you cannot
pay, the shortfall becomes debt compounding against you at 15% a round, and you keep playing.

Every unmortgaged deed you hold costs you $8 a round to keep. That drain is why you will borrow,
and borrowing is why the rest of the game exists: credit lines, loans to the other players,
contracts on future rent, pooled securities backed by those contracts, insurance on the
securities, and a small vice economy.

At the end, everyone totals their net worth on a worksheet. Highest number wins.

## 1.2 Setup, in order

1. **Board out, deeds in a stack, houses and hotels in the bank.** Chance and Community Chest
   cards back in the box.
2. **Shuffle the four era decks separately** and put them face-down in four labelled piles. Do
   not combine them. Era I is drawn from in rounds 1–6, Era II in 7–12, and so on.
3. **Each player takes $2,500 and a player sheet.** Write your name and your starting cash. That
   $2,500 is your entire budget for the whole game, not just the draft.
4. **Roll one die each for turn order**, highest first, re-roll ties. Write the order at the top
   of the facilitator's register. **It is fixed for the whole game.** It matters far less than in
   standard Monopoly — no property is acquired by landing, so turn order only sets the sequence
   of movement within a round.
5. **All four tokens on GO.**
6. **Run the draft** (1.3). Seven rounds, no dice, roughly 25 minutes.
7. **Facilitator writes the Treasury's opening balance** — the total of everything the draft
   collected, usually around $6,300.

Across the table the draft consumes roughly **$6,300** of the $10,000 in play, leaving each
player around **$925** in operating cash. That number is the real constraint on the game.
Overspend in the draft and you enter round 1 unable to absorb a single hoteled rent bill.

## 1.3 The draft

Seven rounds, all simultaneous. Every player ends with **exactly seven deeds** — this is
load-bearing, not cosmetic, because the flat $8-per-deed carrying cost is only fair when deed
counts are equal.

### What each player submits

Privately, on a draft slip (Part 7), all four at once:

- **A ranked list of three properties.** First, second, third.
- **A maximum bid for the first choice only.** At least that property's face value, at most
  your remaining budget.

Second and third choices carry no bid. They are only ever acquired at face value.

The facilitator checks each slip before revealing: **reject** any slip naming a property already
allocated, or bidding above the player's remaining budget, and hand it back to be redone. Check
the slips face-down; the other players must not see them.

### How the facilitator resolves a round

Lay the four slips out and work top to bottom. Steps 1–3 first for every property, then the
cascades.

| Step | Rule |
|---|---|
| 1 | A property named first by **exactly one** player goes to that player at **face value**. Their max bid is irrelevant. |
| 2 | A property named first by **two or more** players goes to the **highest maximum bid**, who pays **their own bid**. First-price, not second-price. |
| 3 | Bid ties break to whoever has acquired **less total face value** so far this draft; then to whoever is earlier in turn order. |
| 4 | Losers of a contest **cascade** to their second choice, then their third, acquiring at **face value** if it is still free. |
| 5 | If two cascading players land on the same property, the one with **less total face value acquired** so far takes it; then earlier turn order. |
| 6 | If all three of your choices are gone, you get the **cheapest remaining property** at face value. |
| 7 | If your remaining budget cannot cover the face value of any remaining property, you get the **cheapest remaining property free**. |

Money paid goes to the Treasury. **Announce every allocation and price out loud**, and let
everyone update their sheets before the next round's slips go out. What players learn in rounds
1–6 is what makes round 7 skillful.

> **Rule 7 hands you a deed, not cash, on purpose.** Running out of money in the draft never
> costs you a deed. It costs you the *choice* of deed. Everyone finishes with seven.

### Advice worth reading aloud before round 1

**You pay your own bid.** The single most expensive mistake in this game is writing your ceiling
instead of your price. Decide what the deed is worth to you and write that.

**Traffic barely varies, so stop drafting for it.** The busiest property on this board
(Tennessee Avenue, 2.77%) is landed on only **1.27 times** as often as the quietest (Park Place,
2.19%). Standard Monopoly's ratio is 1.50. With the spread this flat, a deed's value comes almost
entirely from **its rent table and how far you can develop it** — and development is something
you choose, not something the dice hand you.

**The railroads lead by count, not by quality.** Their 9.97% combined is the highest of any set,
but at 2.49% per square they sit *below* the 2.51% board average. Buy the set because four deeds
acquired individually form a complete set with no trade, no colour-group completion and no
even-build development required — which sidesteps the rare-monopolies problem entirely. Do not
tell yourself you are buying traffic.

**Rank three properties that are not near-substitutes.** If your three choices are Boardwalk,
Park Place and Marvin Gardens and a rival takes Boardwalk, your cascade lands you exactly where
two other players are also cascading.

**Monopolies are rare by design.** Twenty-eight deeds split 7/7/7/7 across ten colour groups
means completing a group costs two or three of your seven picks while three opponents work to
stop you. It is entirely reasonable to draft for cash and completability and buy your monopoly
later from someone whose carrying costs have caught up with them.

## 1.4 A worked draft round

Round 1. Ana, Ben, Cass and Dev each hold $2,500.

| Player | 1st choice | 2nd | 3rd | Max bid |
|---|---|---|---|---|
| Ana | Reading Railroad ($200) | B&O Railroad ($200) | Illinois Ave ($240) | **$340** |
| Ben | Reading Railroad ($200) | New York Ave ($200) | Tennessee Ave ($180) | **$290** |
| Cass | Illinois Ave ($240) | Kentucky Ave ($220) | Indiana Ave ($220) | **$240** |
| Dev | Boardwalk ($400) | Park Place ($350) | Marvin Gardens ($280) | **$400** |

Resolution:

- **Reading Railroad** is contested. Ana's $340 beats Ben's $290. **Ana pays $340** for a deed
  with a $200 face value.
- **Illinois Avenue** — Cass alone. **Cass pays $240**, the face value. Her max bid never came
  into it.
- **Boardwalk** — Dev alone. **Dev pays $400**, the face value. His $400 bid was irrelevant.
- **Ben** lost his contest and cascades to New York Avenue, which is unclaimed. **Ben pays $200.**

Everyone ends round 1 with one deed. Treasury collects $1,180. Ana paid a $140 premium; the
other three paid face.

**The lesson that costs people the most money:** Ana would have won Reading Railroad for $291.
She wrote $340 because she was thinking about her ceiling instead of her price — and $340 is 22%
of the roughly $1,575 she can afford to spend across all seven rounds.

---
---

# Part 2 — The round

## 2.1 The four phases

Twenty-four rounds, four phases each. **There is no timer.** The facilitator advances the phases
by saying the name out loud.

| Phase | Who acts | Target | What happens |
|---|---|---|---|
| **Market** | Facilitator | 20s | Announce round number, era, prevailing rate, Treasury balance, and any card effects still running. |
| **Open** | All four, at once | 2–3 min | Every financial action and all negotiation. |
| **Movement** | Each in turn order | 30s each | Physical dice, resolve the landing. |
| **Settlement** | All four, at once | 2–3 min | The eleven-step script (4.1). |

### The Market phase

The facilitator reads, in this order:

> "Round **N**. Era **X**. Prevailing rate **R%**. Treasury holds **$T**.
> Still running from cards: **[list]**.
> Anyone flagged for a margin call last Settlement, you cure this Open phase or you liquidate."

That is the entire phase. Its purpose is to make sure nobody discovers the rate changed after
they have already borrowed.

### The Open phase

The only phase in which financial actions happen, and everyone acts simultaneously.

**Order within the phase:** if anyone was *marked for liquidation* at the last Settlement, that
auction runs **first** (4.2), before anything else. Then everything else happens at once.

What you can do, era permitting:

- draw on or repay your bank credit line; **repay distressed debt**
- build houses and hotels; sell buildings back; mortgage and unmortgage
- trade deeds and cash with any player in any combination
- make or take peer loans; originate, buy, sell or resell rent futures
- launch a venture; launder dirty cash; pay a bribe; buy insider information
- build a CDO; sell tranches; write or buy a CDS; write or exercise a deed option
- **cure a margin call** before it liquidates you

Negotiate out loud. When a deal closes, **both parties say the terms back** and the facilitator
writes the contract card. Cash and deeds move immediately.

> **Facilitator:** end the Open phase by asking *"anything unregistered?"* and waiting three
> seconds. That question catches more errors than anything else in this document.

## 2.2 Movement

In turn order. Roll the physical dice, move, resolve the square.

- **Doubles** give you another roll. **Three consecutive doubles** sends you to Jail without
  moving.
- **Go To Jail (30)** sends you to Jail. You do not pass GO and you do not collect $350. This is
  the only square on the board that moves you.
- **Jail (10):** you pay **$50 and leave on your next turn.** This is mandatory. You do not roll
  for doubles to escape and you are never in Jail for more than one turn. Arriving in Jail ends
  your turn and resets your doubles counter.
- **Chance (7, 22, 36) and Community Chest (2, 17, 33)** are **ordinary resting squares.** You
  stop there, the facilitator draws the top card of the current era deck and reads it aloud, and
  **you stay exactly where you are.** No card in any deck moves any token.
- **GO (0):** the Treasury pays you **$350** on passing or landing.
- **Income Tax (4):** $200 to the Treasury. There is no percentage option.
- **Luxury Tax (38):** $100 to the Treasury.
- **Free Parking (20):** nothing. There is no pot.

**Rent** is owed by whoever lands on an unmortgaged deed they do not own. It is paid to the
**rent future holder** if a contract on that property is active, otherwise to the owner.

If the futures holder lands on the deed and is not its owner, they would owe rent to themselves:
**no payment occurs.**

## 2.3 Settlement

Everyone works their own sheet at the same time while the facilitator reads the steps. The
order matters — an audit fine lands at step 9 and margin calls are flagged at step 10, so a fine
can and will trigger a call in the same Settlement.

| # | Step |
|---|---|
| 1 | Rent futures reaching their end round expire. Hand the cards to the facilitator. |
| 2 | Venture payouts accrue as dirty cash; venture timers tick down one. |
| 3 | **Carrying cost: $8 per unmortgaged deed, to the Treasury.** |
| 4 | Credit line interest accrues on drawn balances, to the Treasury. |
| 5 | Peer loan interest falls due, payer to holder. Unpaid loans default. |
| 6 | Pool waterfalls distribute collected cash. |
| 7 | CDS premiums transfer, buyer to seller. |
| 8 | Distressed debt grows 15%, compounding. |
| 9 | Audit checks roll (Era III onward) and resolve immediately. |
| 10 | Margin calls flagged. Previously-flagged uncured positions are **marked for liquidation**. |
| 11 | Deed options reaching expiry lapse. |

**On round 24 only**, three further steps follow: all pools terminate, every tranche short of its
face triggers its referencing CDS, then scoring runs.

The facilitator's word-for-word script for this is [4.1](#41-the-settlement-script). Use it. In
testing, tables that improvise Settlement drop a step about every third round, and the step they
drop is almost always 3 or 8 — the two that quietly decide the game.

---
---

# Part 3 — The rules, by era

## 3.1 Era I — Recovery (rounds 1–6)

**Prevailing rate: 5% per round.** Card draws come from the **Era I deck**.

**What's new:** everything. Rent, building, mortgages, trading, one credit line — and a carrying
cost that starts draining you from the very first Settlement.

### The carrying cost

**Every Settlement, from round 1, you pay $8 to the Treasury for each unmortgaged deed you own.**
Buildings are not charged. With seven deeds that is **$56 a round**, every round, whether or not
anyone lands on anything.

This is the most important number in the game. Rent is a transfer between players and nets to
zero across the table, so without a drain the economy would have income but no pressure and
nobody would ever need to borrow. The carrying cost is what makes credit — and therefore
everything in Eras II and III — actually happen. GO pays $350 rather than the standard $200
specifically to sit against it; neither number means anything alone.

**It also makes mortgaging a live lever rather than an act of desperation.** Mortgaging stops a
deed's $8 immediately. You give up its rent and 75% of its face from your borrowing base, and you
get half its face in cash plus $8 a round back. On a cheap deed nobody lands on, in a stretch
where you need neither the rent nor the base, that trade is sometimes simply correct.

### Rent

You collect rent when an opponent's token comes to rest on an unmortgaged deed you own.

- **Undeveloped:** base rent. **If you own the entire colour group and none of it is developed,
  the base rent doubles.**
- **Developed:** the rent for its current house count, from [5.2](#52-deeds-price-rent-credit-value-traffic).
- **Railroads:** $25 / $50 / $100 / $200 for one, two, three or four owned.
- **Utilities:** 4× the dice roll if you own one, 10× if you own both. Re-roll is not permitted —
  use the roll that landed them there.

### Building

You may build only on a colour group you own **entirely and unmortgaged**, and you must build
**evenly** — no property in the group may be more than one house ahead of another. Five houses
is a hotel.

**Buildings sell back to the bank at 50% of purchase cost**, and sell-back follows the same
even-build rule as building up.

**House supply is capped at 32 houses and 12 hotels for the whole table.** Buying up the houses
so nobody else can build is a legitimate strategy. The facilitator enforces the cap by counting
the physical pieces — do not substitute.

### Mortgaging

Mortgage for **50% of face**. Unmortgage for **55% of face**. A mortgaged deed collects no rent,
contributes nothing to your borrowing base, and stops costing you its $8. Turn the deed card
face-down.

**You cannot mortgage a property that has buildings on it.** Sell the buildings back first — and
because sell-back is even across the group, mortgaging one property in a developed colour group
means stripping the whole group. This is the most expensive mistake available in Era I.

### Trading

Deeds and cash, any combination, any player, any Open phase. Both sides state the terms out loud
and the facilitator confirms. **Encumbered deeds carry their encumbrances to the new owner** —
the facilitator reads any active future or option aloud before the deal closes, so both sides
price it.

### The bank credit line

A revolving line. Draw and repay freely in any Open phase.

```
BORROWING BASE = 75% of your unmortgaged deed face value
               + 50% of your building cost
```

Per-deed 75% values and per-building 50% values are precomputed in
[5.2](#52-deeds-price-rent-credit-value-traffic) and [5.4](#54-credit-interest-and-distressed-debt)
so nobody multiplies at the table — you add up a column.

Interest is charged every Settlement on your **drawn balance** at the era rate, and paid to the
Treasury. Use the per-$100 table in 5.4. **If you cannot pay it from clean cash, the unpaid part
capitalises into the drawn balance** and starts earning interest itself.

Those ratios are generous on purpose. At a lower base the whole table could not borrow enough to
matter, and a player absorbing one bad landing had no option but to mortgage into a spiral. You
are expected to use this line.

### Margin calls

If your drawn balance exceeds your borrowing base at Settlement step 10 — usually because you
mortgaged, sold or lost a deed, or because interest capitalised — the facilitator **flags** you
and writes it on the register.

**You have until the end of the next Open phase to cure it**, by repaying cash or by raising your
base.

If you do not cure it, you are **marked for liquidation**, which happens at the **start of the
following Open phase** as a facilitator-run auction (4.2). It never happens silently during
Settlement.

### The obligation path — what happens if you cannot pay

Nobody is eliminated, ever. When you owe something you cannot cover:

```
1. Pay from clean cash as far as it goes.
2. Draw whatever credit-line headroom you have left, and pay that.
3. The remainder becomes DISTRESSED DEBT.
```

**Liquidation applies only to uncured margin calls.** An unpayable rent bill, a tax, a carrying
cost, an audit fine or a card penalty goes straight to distressed debt with no auction and no
liquidation. This is what keeps a broke player playing instead of stalling the table for ten
minutes.

**Distressed debt grows 15% per round, compounding**, and is subtracted from your net worth at
scoring. It is **repayable at any time in any Open phase**, and nobody will ever sweep it out of
your cash for you — paying it down is your decision every round, and the compounding is the
pressure. Growth table in 5.4. Worked example 5 shows what ignoring it costs.

### Fixed board payments

| Square | What happens |
|---|---|
| GO (0) | Treasury pays you **$350** on passing or landing |
| Income Tax (4) | $200 to the Treasury; no percentage option |
| Luxury Tax (38) | $100 to the Treasury |
| Free Parking (20) | Nothing. There is no pot. |
| Go To Jail (30) | Straight to Jail, no $350. The only square that moves you. |
| Jail (10) | Pay $50 on your next turn and leave. Mandatory. |
| Chance (7, 22, 36), Community Chest (2, 17, 33) | Ordinary squares. Draw an era card, stay put. |

---

## 3.2 Era II — Expansion (rounds 7–12)

**Prevailing rate: 6% per round.** Card draws come from the **Era II deck**.

**What's new:** peer loans, rent futures, ventures, laundering and bribery. At the start of round
7 the Treasury advances every player **$300 — as an interest-bearing loan, not a gift.**

Everything from Era I continues unchanged: rent, building, mortgages, trading, the $8-per-deed
carrying cost, the credit line at 75%/50% and its margin calls. Only the rate moved.

### The stimulus is a loan

The $300 is **added to your drawn credit balance** and accrues at the prevailing rate like any
other borrowing. It raises your cash, it raises your debt, and it eats $300 of your headroom
against your borrowing base. If you were already close to your base, taking delivery of the
stimulus can flag you. **Facilitator: check all four gauges immediately after paying it out.**

### Rent futures

The centrepiece. A contract that transfers **all rent collected on one specified property** over
**a specified window of rounds** to whoever holds the contract card.

**The rules:**

- Only the property's **owner** may originate a contract on it.
- The window is at most **8 rounds**, starts no earlier than the round after origination, and
  ends at or before round 24.
- A **mortgaged property cannot originate** a contract. It collects no rent.
- **One active contract per property.** No stacking.
- The **price is whatever the two of you agree.** The rulebook enforces the contract, not the
  price.
- During the window, rent on that property is paid to the holder automatically. The landing
  player pays whoever holds the card.
- The holder may **resell** the contract to any player at any price. Strike through the holder
  name on the card and write the new one; the facilitator initials.

**Who pays and who receives.** Rent is owed by whoever lands on the deed, **except its owner, who
never owes anything.** It is received by the futures holder if a contract is active, otherwise by
the owner. If the futures holder lands on the deed and is not its owner: **no payment occurs.**

**Contracts follow the deed.** Sell or trade an encumbered property and the new owner inherits
the obligation.

**Mortgaging triggers make-whole.** You may mortgage an encumbered property, but you immediately
owe the holder the contract's **remaining value** — computed from 5.3 as
`rent at current development × H × rounds left in the window` — and the contract terminates. This
closes the obvious escape route. The facilitator computes this; see 4.3.

**Valuing a future** — the whole procedure:

```
VALUE  =  rent at current development  ×  H  ×  rounds in window

H is the property's hits-per-round figure from table 5.3.
For a full 8-round window, read the fair value straight off 5.3
and skip the arithmetic entirely.
```

**Why the market is skillful.** The table prices the property **as it is right now.** You price
it as it will be. With board traffic as flat as it is here, almost all of a contract's value comes
from what is *built* on the property — so a rent future is mostly a bet on development. Selling
one on a property you are about to hotel, or buying one from a player whose carrying costs are
about to force them to strip a group, are both edges the table cannot see. See worked example 1.

### Peer loans

Any two players, freely negotiated. Four terms, all written on the card: **principal, per-round
interest rate, term in rounds, and zero or more deeds pledged as collateral.**

Interest is due each Settlement at step 5, borrower to holder. **Write the per-round interest
amount on the card at origination** so nobody recomputes it eleven times.

The lender holds a **note**, which is an asset — sellable outright, and poolable into a CDO once
Era III opens.

**A peer loan does not touch your borrowing base**, which makes it the cleanest way to cure a
margin call: you raise cash without giving up any base at all.

**Default** happens on a missed interest payment, or on any balance outstanding at term expiry.
On default:

1. Collateral deeds transfer to the lender.
2. Any remaining balance is written off.
3. The borrower's **credit line borrowing base is permanently halved** for the rest of the game.

That third clause is the real cost. **A second default does not halve again** — the penalty is a
single permanent halving, and subsequent defaults carry only the collateral loss and the
write-off. Mark the halving prominently on the player sheet.

### Ventures

Vice. All income is paid in **dirty cash**, and all of it costs Heat. Write the venture and its
remaining rounds on your player sheet; tick down at Settlement step 2.

| Venture | Cost | Duration | Effect | Heat |
|---|---|---|---|---|
| **Escort Service** | $300 | 4 rounds | +40% of all rent **charged** on deeds you own, paid dirty | +2 |
| **Numbers Racket** | $150 | 6 rounds | +$60 dirty per round, flat | +2 |
| **Chop Shop** | $250 | 4 rounds | +$150 dirty each time any opponent lands on a deed you own | +3 |
| **Speakeasy** | $250 | one-shot | Roll 2d6 on the payout table, paid dirty | +2 |

Speakeasy payouts — expected $294 dirty against a $250 cost. It is a gamble, not an income stream.

| Roll | 2 | 3–5 | 6–8 | 9–11 | 12 |
|---|---|---|---|---|---|
| Payout | $0 | $100 | $250 | $500 | $1,200 |
| Chance | 2.8% | 25.0% | 44.4% | 25.0% | 2.8% |

**Ventures pay the deed's owner, on rent *charged*, not rent received.** Escort Service and Chop
Shop calculate on what your deeds bill, regardless of who actually collects it. Selling a rent
future therefore does not extinguish your venture income — and a futures holder running their own
Escort Service earns nothing from deeds they do not own. Ventures attach to property, not to
cashflow claims.

**A mortgaged deed charges no rent**, so Escort and Chop Shop bonuses on it are zero.

Escort Service and Chop Shop reward opposite board positions on purpose. Escort pays a percentage
of rent, so it wants hotels. Chop Shop pays a flat fee per landing regardless of rent, so it wants
many deeds of any kind.

### Dirty cash

Dirty cash is worth **exactly $0 at final scoring** and is **entirely seizable in an audit.** You
may spend it on only four things: **ventures, bribery, insider trading, and laundering.**

**Laundering** converts dirty to clean at a **25% haircut**, worsening by **5 percentage points
for every Heat point above 3**, capped at a 60% haircut. Each laundering transaction costs **+1
Heat**, and you may launder **at most once per Open phase.**

**The haircut is read at your Heat *before* that transaction's +1 is applied.** At Heat 3 you pay
25%, not 30%. Full table in 5.5.

### Heat

| Action | Heat |
|---|---|
| Launch a venture | +2 |
| Launch a Chop Shop | +3 |
| Each laundering transaction | +1 |
| Bribery | +1 |
| Insider trading | +1 |
| A round in which you take no *deliberate* dirty action | −1 |

**Automatic payouts from a venture already running do not block decay.** Launching is a
deliberate action; collecting is not. A venture started in round 8 is cooling you down at −1 a
round from round 9 onward *while it pays you.* Without this rule a six-round Numbers Racket would
make cooling off impossible before the audits start.

Heat never goes below 0. Track it in a box on the player sheet, big enough to read across the
table — the facilitator needs it every Settlement from round 13.

**Nothing happens to your Heat in Era II.** Audit checks do not begin until round 13. This is a
six-round window in which vice appears to be free money — and given the decay rule, a player who
launches early and launders once can genuinely be back at Heat 0 or 1 by round 13.

### Bribery

**$200, payable only in dirty cash**, once per round per player, +1 Heat. It does exactly one of
three things:

- forces a re-roll of any single die roll, including another player's movement
- cancels an era card effect drawn this round that targets **you specifically**
- delays one of your own margin calls by one round

It cannot cancel a card that targets all players or a set of two or more, and it cannot be used
during Settlement once an audit has already resolved.

> **Cancellability rule for the facilitator:** a card is bribery-cancellable if and only if its
> Targets line resolves to exactly one player. Cards that target everyone but only bite a subset
> (e.g. "every player at Heat 4 or more") are **not** cancellable.

Bribery being payable in dirty cash is what stops dirty money from being a pure liability. It
gives the underworld its own internal currency.

---

## 3.3 Era III — Financialization (rounds 13–18)

**Prevailing rate: 8% per round.** Card draws come from the **Era III deck**.

**What's new:** CDO pools and tranches, credit default swaps, deed options, insider trading — and
**audit checks begin.**

Everything from Eras I and II continues unchanged.

### Audits

**Every Settlement from round 13, at step 9, each player rolls 2d6 against their own Heat. If the
roll is less than or equal to your Heat, you are audited.**

Facilitator: call this as one round of rolls, in turn order, and resolve each immediately.

**On an audit:** all your dirty cash is seized, you pay a fine of **$100 × your Heat in clean
cash**, and your **Heat resets to 0.**

Odds and fines in 5.5. The fine lands at step 9 and margin calls are flagged at step 10, so **an
audit fine can margin-call you in the same Settlement.** If you cannot pay the fine it becomes
distressed debt on the spot — fines are not a margin event and do not themselves trigger
liquidation.

The worst position available is high Heat plus a large unlaundered pile. Launder early, then let
the −1 per clean round drain you down.

### Insider trading

$100 in clean **or** dirty cash. The facilitator shows you the top card of the current era deck,
privately, and puts it back on top. +1 Heat.

Facilitator: walk away from the table with the player. Do not read it aloud, do not let anyone
read your face.

### Deed options

Three numbers on the card: **premium**, **strike**, **expiry round**.

The deed's owner writes the option and receives the premium. The holder may exercise in **any Open
phase up to and including the expiry round**, paying the strike and receiving the deed. Options
may be resold by the holder. Options reaching expiry lapse at Settlement step 11 — the facilitator
collects the card.

**While an option is outstanding, the writer may not sell, trade or mortgage the underlying
deed.** Turn the deed card sideways in front of the writer so this is visible.

Deed options exist because monopolies are rare here. If you need one specific deed to complete a
group and the owner will not sell today, buy the right to make them sell later.

### Securitization: pools and tranches

You may pool **three or more assets you own** — peer loan notes, rent futures, or deed options —
into a CDO. Hand the underlying contract cards to the facilitator, who clips them to the pool
card. **The underlying cards are held by the pool, not by you, until the pool terminates.**

Compute the pool's **expected cashflow** — the facilitator does this once, at creation, and it
never changes:

```
peer loan note   →  outstanding principal + (per-round interest × rounds left in term)
rent future      →  rent at current development × H × rounds left in window   (table 5.3)
deed option      →  max(0, deed face value − strike)
```

You then cut it into three tranches:

| Tranche | Face | Paid |
|---|---|---|
| **Senior** | fixed, set by you | first; retires when paid in full |
| **Mezzanine** | fixed, set by you | second; retires when paid in full |
| **Equity** | uncapped residual | everything left over, for the life of the pool |

Senior and Mezzanine faces are set at creation and **together cannot exceed the pool's expected
cashflow.** Tranches are sold to other players at freely negotiated prices — write the holder on
the pool card.

**The waterfall.** Every Settlement at step 6, all cash the pool's underlying assets collected
since the last Settlement is distributed in strict priority: Senior up to its remaining face, then
Mezzanine up to its remaining face, then Equity takes whatever is left. Tally remaining faces on
the back of the pool card.

The pool terminates when all underlying assets have matured or defaulted — or at the end of round
24, whichever comes first.

**When a pooled loan defaults**, its collateral deeds do not go to anyone as deeds. They are sold
to the bank at the standard **80% of face**, and that cash enters the pool's collected cash for
the same round's waterfall. A waterfall can only distribute money, so the deeds are converted into
money. The deeds become bank-owned and leave play.

### Ratings

Computed by the facilitator from three numbers, on request and at creation. No judgment is
involved.

```
coverage       = expected pool cashflow ÷ cumulative claim through this tranche
concentration  = largest single obligor's share of expected pool cashflow   (0 to 1)
leverage       = the obligors' leverage ratios, averaged and rounded to the
                 nearest 0.5, capped at 5      [tabletop simplification — see 8.1]

score = coverage × MULTIPLIER
```

where MULTIPLIER is read off the grid in [5.6](#56-ratings-and-marks) at that concentration and
leverage, and *cumulative claim* means Senior face for the senior tranche, Senior + Mezzanine for
the mezzanine, and the whole expected cashflow for equity.

| Score | ≥ 2.20 | ≥ 1.50 | ≥ 1.20 | ≥ 1.00 | ≥ 0.80 | ≥ 0.60 | < 0.60 |
|---|---|---|---|---|---|---|---|
| Rating | **AAA** | **AA** | **A** | **BBB** | **BB** | **B** | **CCC** |

**Equity gets a rating too.** It has no face amount, so its claim is defined as the whole expected
cashflow. Its coverage is therefore always exactly **1.00**, and its score is just the multiplier
— so equity rates CCC in any pool with meaningful concentration or leverage. That is correct. The
residual tranche is genuinely the riskiest thing in the structure.

The formula is coverage-dominant and forgiving of concentration. A pool of three loans all made to
the same player at 3.5× leverage still rates its senior slice **AA**. That rating is
arithmetically correct and analytically worthless. It is both the joke and a genuine strategy.

> **Facilitator: always say the raw numbers with the letter.** When you announce a rating, say
> *"AA — concentration 1.00, weighted leverage 3.5."* The information belongs to the whole table.
> Whether anyone listens is their problem.

### Credit default swaps

A CDS references either a **peer loan note** or a **CDO tranche**.

- The buyer pays a negotiated **premium** to the seller every Settlement, at step 7.
- On a **credit event**, the seller pays the buyer the **notional**, agreed at origination and
  capped at the face value of the reference obligation.
- **Naked CDS is legal.** You may buy protection on debt you do not own.
- The seller must post **30% of notional against their borrowing base.** This is what prevents
  unlimited writing, and it can itself trigger a margin call. Write the posting on the player
  sheet as a deduction line.

**Credit events:**

| Reference | Event |
|---|---|
| Peer loan note | The borrower defaults |
| CDO tranche | The tranche receives less than its full face by pool termination |

Because tranche CDS settle at termination, and because **every pool terminates at the end of round
24**, protection you wrote can all come due in the final Settlement of the game. Plan for that in
Era III, not in round 23.

---

## 3.4 Era IV — Reckoning (rounds 19–24)

**Prevailing rate: 12% per round.** Card draws come from the **Reckoning deck**.

**What's new: nothing.** No new instruments. The last six rounds are about surviving the leverage
you already took on.

Everything continues. The Reckoning deck issues downgrades, sweeps and covenant breaches, and its
cards read live game state — a card can name the most leveraged player or the player holding the
most dirty cash. Still no movement cards.

### What 12% actually does

A drawn balance of $1,000 costs you $120 every Settlement, on top of $56 a round in carrying cost
if you hold seven deeds. If you cannot pay from clean cash the interest capitalises, so round 20's
balance is $1,120, round 21's is $1,254, and by round 24 it is $1,574 against a borrowing base
that has not moved. **Interest alone will margin-call you.** Check your headroom in the Market
phase of round 19 and decide then whether you are deleveraging or committing.

The money supply contracts by roughly 29% across the game, and the squeeze is worst here by
design: liquidity gets tighter at exactly the point the rate curve peaks. Cash you are holding in
round 19 is worth more than cash you held in round 5.

### The final Settlement of round 24

The usual eleven steps run, and then three more, in this order:

1. **All CDO pools terminate**, whether or not their underlying assets have run their course. Run
   each waterfall one last time on cash collected to date.
2. **Every tranche short of its remaining face triggers its referencing CDS.** If you wrote
   protection, this is when you pay.
3. **Scoring runs.**

There is no ambiguity about unresolved positions, and there is no round 25 in which things work
out.

## 3.5 Scoring

Everyone fills in the scoring worksheet (Part 7). The facilitator checks all four.

```
NET WORTH =   clean cash
            + deed face value          (mortgaged deeds count at 50% of face)
            + building cost            (at what you paid, not sell-back)
            + instruments held, marked below
            − drawn credit balance
            − peer loan balances owed
            − distressed debt
            − CDS notional written and triggered
            + dirty cash × 0
```

| Instrument you hold | Marked at |
|---|---|
| Rent future | `rent at current development × H × rounds left in window` |
| CDO tranche | Expected remaining pool cashflow, allocated down the waterfall to your remaining face |
| Loan note | `principal × multiplier` from the leverage band table in 5.6 |
| Deed option | `max(0, deed face value − strike)` |
| CDS bought, untriggered | Zero |
| CDS written, untriggered | Zero — the 30% posting reduced your borrowing base, not your net worth |

A note against an unlevered player marks at par; a note against a player at 4× or worse marks at
40% of principal. **Lending to a wreck destroys the value of your own asset.**

**You win by having the highest net worth after round 24.** If the facilitator set a net-worth
target at setup instead, the first player to reach it wins.

---
---

# Part 4 — Facilitator's operating manual

## 4.1 The Settlement script

Read this aloud, one line at a time, pausing after each for players to work their own sheet.
Roughly two minutes once the table knows it. **Do not skip steps that look empty** — say the
step name, get four nods, move on.

> **"Settlement, round N."**
>
> **"One. Futures expiring."**
> — Any contract whose end round is this round: hand me the card. Rent reverts to the owner from
> next round.
>
> **"Two. Ventures pay, then tick."**
> — Take your dirty cash, then reduce every venture's remaining rounds by one. A venture at zero
> is finished; cross it off.
>
> **"Three. Carrying cost. Eight dollars per unmortgaged deed. Count them."**
> — Pay the Treasury. *This is the step tables forget. Wait for four payments.*
>
> **"Four. Credit interest at R%."**
> — [5.4] per $100 drawn, rounded down. Pay the Treasury. **If you can't pay it in cash, it
> capitalises — add it to your drawn balance.**
>
> **"Five. Peer loans."**
> — I'll read the register. *[Read each: "L-07, Dev pays Cass $28."]* A missed payment is a
> default: collateral moves, balance written off, borrower's base is halved permanently unless it
> already has been.
>
> **"Six. Waterfalls."**
> — *[For each pool: total the cash its underlying assets collected this round, then pay Senior to
> its remaining face, Mezzanine to its remaining face, Equity the rest. Update the back of the pool
> card.]*
>
> **"Seven. Swap premiums."**
> — I'll read the register. *[Read each: "S-01, Dev pays Ana $40."]*
>
> **"Eight. Distressed debt. Add fifteen per cent."**
> — Anyone carrying it: multiply by 1.15, round down, write the new number.
>
> **"Nine. Audits."** *(round 13 onward)*
> — Everyone roll two dice, in turn order. Roll at or under your Heat and you're audited: all
> dirty cash to me, fine of one hundred times your Heat in clean cash, Heat to zero.
>
> **"Ten. Margin check. Read me your drawn balance and your base."**
> — *[Four answers. Drawn > base is a flag — write it on the register. Anyone flagged last round
> and still over is MARKED FOR LIQUIDATION at the start of the next Open phase.]*
>
> **"Eleven. Options expiring."**
> — Any option with this expiry round that hasn't been exercised: hand me the card. It's worthless.
>
> **"Settlement closed. Market phase, round N+1."**

**Round 24 only**, add:

> **"Twelve. All pools terminate."** — final waterfall on cash collected.
> **"Thirteen. Credit events."** — every tranche short of its remaining face triggers its CDS;
> sellers pay notional to buyers.
> **"Fourteen. Scoring."** — worksheets out.

## 4.2 Running the forced-liquidation auction

Runs at the **start** of the Open phase, before any other action, for each player marked at the
previous Settlement. If more than one player is marked, resolve them **one at a time in turn
order**, fully finishing each before starting the next. All other three players may bid every
time, whether or not they are themselves marked.

```
1. Compute the shortfall:  drawn balance − borrowing base.

2. If the player has developed deeds, STRIP FIRST.
   Sell buildings back to the bank at 50% of cost, even-build across
   the colour group, and apply the cash against the drawn balance.
   Re-check the shortfall — stripping is exactly shortfall-neutral,
   because buildings contribute 50% of cost to the base and return
   50% of cost in cash.

3. Take the player's unmortgaged deeds in DESCENDING FACE VALUE order.
   For each one, in turn:

   a. Extinguish encumbrances. Any rent future on this deed is
      cancelled and the holder receives the standard make-whole.
      Any deed option is cancelled and the holder is refunded their
      premium. BOTH amounts are added to the liquidating player's
      shortfall. Collect the cards.

   b. Offer it to the other three players. Highest bid AT OR ABOVE
      80% of face wins and pays that bid.

   c. If nobody bids at or above 80%, the BANK takes it at exactly
      80% of face. The deed becomes bank-owned and leaves play —
      it is not re-drafted and nobody may buy it later.

   d. Apply the proceeds against the drawn balance. Recompute the
      shortfall.

   e. STOP as soon as drawn ≤ base.

4. If the player runs out of unmortgaged deeds and is still short,
   the residual becomes distressed debt. They keep playing.
```

**Why the 80% floor is not negotiable.** Selling a deed raises 80% of its face but removes 75% of
its face from the borrowing base. At 80% against 75%, each sale narrows the shortfall by 5% of
face and the process converges. Below 75% every forced sale would *widen* the shortfall and the
loop would only terminate by consuming the player's entire portfolio. If you house-rule the floor,
keep it strictly above 75%.

**Why encumbrances are extinguished.** If options blocked liquidation, a distressed player could
write a $1 option on every deed and become judgment-proof. If encumbrances instead followed the
deed into the auction, a player could write a $1-strike option to a confederate, be liquidated,
collect the bank's 80%, and have the confederate exercise for a dollar. Extinguishing on
liquidation removes the value of both manoeuvres.

## 4.3 Valuing things when asked

Players will ask. Answer with a number and nothing else.

| Question | Where you look | What you do |
|---|---|---|
| "What's a future on X worth?" | 5.3 | Full 8-round window: read the fair value straight off. Otherwise `rent × H × rounds`. |
| "What's my borrowing base?" | 5.2 + 5.4 | Sum the 75% column for their unmortgaged deeds, add 50% of building cost, subtract any CDS postings. |
| "What's my interest this round?" | 5.4 | Drawn ÷ 100, × the per-$100 figure, round down. |
| "What's the make-whole if I mortgage this?" | 5.3 | `rent at current development × H × rounds left in the window`. |
| "What's this pool's expected cashflow?" | 3.3 | Sum the three asset formulas. Compute once at creation and write it on the pool card forever. |
| "What does this tranche rate?" | 5.6 | `coverage × multiplier`, then the letter. Say the concentration and leverage out loud too. |
| "What's my net worth right now?" | Part 7 | Only for cards that need it (E3-17, E3-18, E4-07, E4-18, E4-19). Run the worksheet quickly; ignore instrument marks under $50. |

**The rule you must hold to:** you give the math, never the move. "That future is worth $752 at
its current development" is your job. "You should sell it" is not.

## 4.4 Rulings, disputes and pace

**Rounding.** Everything rounds **down to the nearest $1**, always.

**Simultaneity.** Two players cannot both buy the same thing. If two deals in the Open phase
conflict, the one you registered first stands.

**Take-backs.** Before you write the card, anything can be unwound. After you write the card,
nothing can, unless both parties agree.

**Rent noticed late.** If a player forgets to collect rent and the next player has already rolled,
it is gone. If they notice before the next roll, it is paid. State this before round 1.

**Card conflicts.** Two live rent modifiers compose **multiplicatively against base rent, applied
in the order the cards were drawn, with a single round-down at the end.** For borrowing base:
compute the base from the current formula, apply additive terms, then multipliers, then subtract
CDS postings.

**When you are unsure.** Rule quickly, say it is provisional, write it on the register, and keep
the same ruling for the rest of the game. Consistency beats correctness in a three-hour session.

**Pace.** The Open phase expands to fill any time you give it. Two soft interventions work:
announce "sixty seconds" when conversation loops, and say "anything unregistered?" to close. Do
not use a hard timer — it will eventually cut off a half-finished trade, and that is worse than
running long.

**Where new tables actually lose time**, in order: the draft (budget 25 minutes and do not rush
it); the first three Settlements (they speed up 3× once the script is familiar); and the first CDO
(walk the table through one on a whiteboard rather than letting one player build it alone).

---
---

# Part 5 — Reference tables

*Photocopy 5.1 through 5.4 for the table. Keep 5.6 for yourself.*

## 5.1 Constants

| Item | Amount |
|---|---|
| Starting budget, per player | **$2,500** |
| Total money in play at start | $10,000 |
| Total face value of all 28 deeds | $5,690 |
| GO, passing or landing | **$350** |
| **Carrying cost, every Settlement from round 1** | **$8 per unmortgaged deed** |
| Carrying cost, whole table, nothing mortgaged | $224 per round |
| Income Tax (square 4) | $200 |
| Luxury Tax (square 38) | $100 |
| Leaving Jail | $50, mandatory, on your next turn |
| Era II stimulus, start of round 7 | $300 per player, **added to drawn credit** |
| Mortgage a deed | you receive 50% of face |
| Unmortgage a deed | you pay 55% of face |
| Sell a building back | you receive 50% of its cost |
| Borrowing base | 75% of unmortgaged deed face + 50% of building cost |
| Forced liquidation floor | **80% of face** |
| Distressed debt | 15% per round, compounding |
| CDS collateral posted by the seller | 30% of notional, against borrowing base |
| Rent future maximum window | 8 rounds |
| Rolls per round that can owe you rent | **3.57** (3 opponents × 1.19 for doubles) |
| House / hotel supply | 32 / 12, for the whole table |

| Era | Rounds | Rate | Unlocks |
|---|---|---|---|
| **I — Recovery** | 1–6 | **5%** | Deeds, building, mortgage, trading, bank credit line |
| **II — Expansion** | 7–12 | **6%** | Peer loans, rent futures, ventures, laundering, bribery. $300 stimulus at round 7, **as a loan**. |
| **III — Financialization** | 13–18 | **8%** | CDO pools and tranches, CDS, deed options, insider trading. **Audits begin.** |
| **IV — Reckoning** | 19–24 | **12%** | Nothing new. Rate pressure and the Reckoning deck. |

## 5.2 Deeds: price, rent, credit value, traffic

Rent shown is the base. **Double the base rent if you own the full colour group and none of it is
developed.** "Credit" is the 75% of face that this deed contributes to your borrowing base while
unmortgaged. "Liq" is the 80%-of-face forced-liquidation floor.

| Sq | Property | Group | Price | **Credit** | Mtg | Unmtg | **Liq** | House | Rent | 1H | 2H | 3H | 4H | Hotel | Landing % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Mediterranean Ave | Brown | $60 | **$45** | $30 | $33 | $48 | $50 | $2 | $10 | $30 | $90 | $160 | $250 | 2.2911% |
| 3 | Baltic Ave | Brown | $60 | **$45** | $30 | $33 | $48 | $50 | $4 | $20 | $60 | $180 | $320 | $450 | 2.3339% |
| 6 | Oriental Ave | Lt Blue | $100 | **$75** | $50 | $55 | $80 | $50 | $6 | $30 | $90 | $270 | $400 | $550 | 2.2691% |
| 8 | Vermont Ave | Lt Blue | $100 | **$75** | $50 | $55 | $80 | $50 | $6 | $30 | $90 | $270 | $400 | $550 | 2.2735% |
| 9 | Connecticut Ave | Lt Blue | $120 | **$90** | $60 | $66 | $96 | $50 | $8 | $40 | $100 | $300 | $450 | $600 | 2.2774% |
| 11 | St. Charles Place | Pink | $140 | **$105** | $70 | $77 | $112 | $100 | $10 | $50 | $150 | $450 | $625 | $750 | 2.2809% |
| 13 | States Ave | Pink | $140 | **$105** | $70 | $77 | $112 | $100 | $10 | $50 | $150 | $450 | $625 | $750 | 2.4431% |
| 14 | Virginia Ave | Pink | $160 | **$120** | $80 | $88 | $128 | $100 | $12 | $60 | $180 | $500 | $700 | $900 | 2.5282% |
| 16 | St. James Place | Orange | $180 | **$135** | $90 | $99 | $144 | $100 | $14 | $70 | $200 | $550 | $750 | $950 | 2.7146% |
| 18 | Tennessee Ave | Orange | $180 | **$135** | $90 | $99 | $144 | $100 | $14 | $70 | $200 | $550 | $750 | $950 | **2.7743%** |
| 19 | New York Ave | Orange | $200 | **$150** | $100 | $110 | $160 | $100 | $16 | $80 | $220 | $600 | $800 | $1,000 | 2.7405% |
| 21 | Kentucky Ave | Red | $220 | **$165** | $110 | $121 | $176 | $150 | $18 | $90 | $250 | $700 | $875 | $1,050 | 2.6943% |
| 23 | Indiana Ave | Red | $220 | **$165** | $110 | $121 | $176 | $150 | $18 | $90 | $250 | $700 | $875 | $1,050 | 2.6404% |
| 24 | Illinois Ave | Red | $240 | **$180** | $120 | $132 | $192 | $150 | $20 | $100 | $300 | $750 | $925 | $1,100 | 2.6803% |
| 26 | Atlantic Ave | Yellow | $260 | **$195** | $130 | $143 | $208 | $150 | $22 | $110 | $330 | $800 | $975 | $1,150 | 2.7073% |
| 27 | Ventnor Ave | Yellow | $260 | **$195** | $130 | $143 | $208 | $150 | $22 | $110 | $330 | $800 | $975 | $1,150 | 2.7060% |
| 29 | Marvin Gardens | Yellow | $280 | **$210** | $140 | $154 | $224 | $150 | $24 | $120 | $360 | $850 | $1,025 | $1,200 | 2.6880% |
| 31 | Pacific Ave | Green | $300 | **$225** | $150 | $165 | $240 | $200 | $26 | $130 | $390 | $900 | $1,100 | $1,275 | 2.6783% |
| 32 | North Carolina Ave | Green | $300 | **$225** | $150 | $165 | $240 | $200 | $26 | $130 | $390 | $900 | $1,100 | $1,275 | 2.6051% |
| 34 | Pennsylvania Ave | Green | $320 | **$240** | $160 | $176 | $256 | $200 | $28 | $150 | $450 | $1,000 | $1,200 | $1,400 | 2.4567% |
| 37 | Park Place | Dk Blue | $350 | **$262** | $175 | $192 | $280 | $200 | $35 | $175 | $500 | $1,100 | $1,300 | $1,500 | **2.1887%** |
| 39 | Boardwalk | Dk Blue | $400 | **$300** | $200 | $220 | $320 | $200 | $50 | $200 | $600 | $1,400 | $1,700 | $2,000 | 2.2553% |
| 5 | Reading Railroad | RR | $200 | **$150** | $100 | $110 | $160 | — | *see below* | | | | | | 2.2749% |
| 15 | Pennsylvania RR | RR | $200 | **$150** | $100 | $110 | $160 | — | *see below* | | | | | | 2.6163% |
| 25 | B&O Railroad | RR | $200 | **$150** | $100 | $110 | $160 | — | *see below* | | | | | | 2.7020% |
| 35 | Short Line | RR | $200 | **$150** | $100 | $110 | $160 | — | *see below* | | | | | | 2.3752% |
| 12 | Electric Company | Util | $150 | **$112** | $75 | $82 | $120 | — | *see below* | | | | | | 2.3639% |
| 28 | Water Works | Util | $150 | **$112** | $75 | $82 | $120 | — | *see below* | | | | | | 2.6963% |

**Railroads** — rent by number owned: **1 → $25, 2 → $50, 3 → $100, 4 → $200.**

**Utilities** — **one owned: 4× the dice roll. Both owned: 10× the dice roll.** Average roll is 7,
so one utility averages $28 per hit and two average $70.

**Buildings** — cost, credit contribution and sell-back:

| Group | House cost | Credit per house | Hotel cost | Credit per hotel | House sells back | Hotel sells back |
|---|---|---|---|---|---|---|
| Brown, Light Blue | $50 | $25 | $250 | $125 | $25 | $125 |
| Pink, Orange | $100 | $50 | $500 | $250 | $50 | $250 |
| Red, Yellow | $150 | $75 | $750 | $375 | $75 | $375 |
| Green, Dark Blue | $200 | $100 | $1,000 | $500 | $100 | $500 |

*Hotel cost is the cumulative cost of five houses, which is what counts toward your borrowing
base and what you get half of on sell-back.*

## 5.3 The futures table

**The single most useful table in the paper edition.** It is what replaces the app's pricing model.

**H** is expected hits per round: the property's landing probability × 3.57. The 3 is the three
players who can owe you rent — never the owner. The 1.19 is the extra rolls doubles generate.

```
VALUE OF A RENT FUTURE  =  rent at current development  ×  H  ×  rounds in window
```

The **8-round columns** are that arithmetic already done for a full-length window. For a shorter
window, take the 8-round figure and multiply by `rounds ÷ 8`, or use H directly.

**P(0)** is the chance the property is landed on **zero times** across a full 8-round window. Read
it before you buy. Roughly half of all rent futures pay nothing at all.

### Colour properties

| Property | **H** | **P(0)** | 8-round value at each development ⟶ |
|---|---|---|---|
| | per round | over 8 rds | **undev** / **dbl** / **1H** / **2H** / **3H** / **4H** / **hotel** |
| Mediterranean Ave | 0.082 | 52% | $1 / $2 / $6 / $19 / $58 / $104 / **$163** |
| Baltic Ave | 0.083 | 51% | $2 / $5 / $13 / $39 / $119 / $213 / **$299** |
| Oriental Ave | 0.081 | 52% | $3 / $7 / $19 / $58 / $174 / $259 / **$356** |
| Vermont Ave | 0.081 | 52% | $3 / $7 / $19 / $58 / $175 / $259 / **$357** |
| Connecticut Ave | 0.081 | 52% | $5 / $10 / $26 / $65 / $195 / $292 / **$390** |
| St. Charles Place | 0.081 | 52% | $6 / $13 / $32 / $97 / $293 / $407 / **$488** |
| States Ave | 0.087 | 49% | $6 / $13 / $34 / $104 / $313 / $436 / **$523** |
| Virginia Ave | 0.090 | 48% | $8 / $17 / $43 / $129 / $361 / $505 / **$649** |
| St. James Place | 0.097 | 46% | $10 / $21 / $54 / $155 / $426 / $581 / **$736** |
| Tennessee Ave | 0.099 | 45% | $11 / $22 / $55 / $158 / $435 / $594 / **$752** |
| New York Ave | 0.098 | 45% | $12 / $25 / $62 / $172 / $469 / $626 / **$782** |
| Kentucky Ave | 0.096 | 46% | $13 / $27 / $69 / $192 / $538 / $673 / **$807** |
| Indiana Ave | 0.094 | 47% | $13 / $27 / $67 / $188 / $527 / $659 / **$791** |
| Illinois Ave | 0.096 | 46% | $15 / $30 / $76 / $229 / $574 / $708 / **$842** |
| Atlantic Ave | 0.097 | 46% | $17 / $34 / $85 / $255 / $618 / $753 / **$889** |
| Ventnor Ave | 0.097 | 46% | $17 / $34 / $85 / $255 / $618 / $753 / **$888** |
| Marvin Gardens | 0.096 | 46% | $18 / $36 / $92 / $276 / $652 / $786 / **$921** |
| Pacific Ave | 0.096 | 46% | $19 / $39 / $99 / $298 / $688 / $841 / **$975** |
| North Carolina Ave | 0.093 | 47% | $19 / $38 / $96 / $290 / $669 / $818 / **$948** |
| Pennsylvania Ave | 0.088 | 49% | $19 / $39 / $105 / $315 / $701 / $841 / **$982** |
| Park Place | 0.078 | 53% | $21 / $43 / $109 / $312 / $687 / $812 / **$937** |
| Boardwalk | 0.081 | 52% | $32 / $64 / $128 / $386 / $901 / $1,094 / **$1,288** |

### Railroads and utilities

| Property | **H** | **P(0)** | 8-round value by number of railroads owned |
|---|---|---|---|
| | | | **1** / **2** / **3** / **4** |
| Reading Railroad | 0.081 | 52% | $16 / $32 / $64 / **$129** |
| Pennsylvania RR | 0.093 | 47% | $18 / $37 / $74 / **$149** |
| B&O Railroad | 0.097 | 46% | $19 / $38 / $77 / **$154** |
| Short Line | 0.085 | 50% | $16 / $33 / $67 / **$135** |

| Property | **H** | **P(0)** | 8-round value: **one utility** / **both** |
|---|---|---|---|
| Electric Company | 0.084 | 51% | $18 / **$47** |
| Water Works | 0.096 | 46% | $21 / **$53** |

*Utility values assume the average roll of 7.*

### The quick rule, for mental estimates

If you do not want to look anything up, H falls into three bands:

| **H = 0.10** | St. James, Tennessee, New York, Kentucky, Illinois, Atlantic, Ventnor, Marvin Gardens, Pacific, B&O, Water Works |
|---|---|
| **H = 0.09** | States, Virginia, Indiana, North Carolina, Pennsylvania Ave, Pennsylvania RR |
| **H = 0.08** | Mediterranean, Baltic, Oriental, Vermont, Connecticut, St. Charles, Park Place, Boardwalk, Reading, Short Line, Electric |

So: **a property is landed on roughly once every eleven rounds.** Multiply rent by 0.1 and by the
window length and you are within 5% of the table. Use the exact figures when money is on the line.

## 5.4 Credit, interest and distressed debt

### Interest per Settlement

Take your drawn balance, divide by 100, multiply by the figure for the era, **round down**.

| Era | Rate | Per $100 drawn | $500 | $1,000 | $1,500 | $2,000 |
|---|---|---|---|---|---|---|
| I (1–6) | 5% | **$5** | $25 | $50 | $75 | $100 |
| II (7–12) | 6% | **$6** | $30 | $60 | $90 | $120 |
| III (13–18) | 8% | **$8** | $40 | $80 | $120 | $160 |
| IV (19–24) | 12% | **$12** | $60 | $120 | $180 | $240 |

*Example: $1,742 drawn in Era III → 17.42 × $8 = $139.36 → **$139**.*

**Unpaid interest capitalises** into the drawn balance and earns interest thereafter.

### Distressed debt at 15% compounding

Multiply by **1.15** each Settlement and round down. Or read the multiplier:

| Rounds carried | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Multiplier | ×1.15 | ×1.32 | ×1.52 | ×1.75 | ×2.01 | ×2.31 | ×2.66 | ×3.06 |
| $1,000 becomes | $1,150 | $1,322 | $1,520 | $1,749 | $2,011 | $2,313 | $2,660 | $3,059 |

**It doubles in five rounds.** A shortfall taken in round 14 and ignored is worth 4× against you
at scoring. Every $100 repaid immediately is worth $200 at scoring five rounds later.

### Borrowing base worksheet

```
    Sum of the CREDIT column (5.2) for every UNMORTGAGED deed you own   $______
  + 50% of your total building cost   (5.2 building table)              $______
  + any permanent additive uplift from a card (e.g. E1-11)              $______
  = SUBTOTAL                                                            $______
  × any live multiplier from a card (e.g. E2-01 ×1.25)                  $______
  − 30% of every CDS notional you have written                          $______
  ÷ 2  IF you have ever defaulted on a peer loan (once only, permanent) $______
  = BORROWING BASE                                                      $______

    DRAWN BALANCE                                                       $______
    HEADROOM = base − drawn        (negative = margin call)             $______
```

## 5.5 The underworld

| Venture | Cost | Duration | Effect | Heat |
|---|---|---|---|---|
| Escort Service | $300 | 4 rounds | +40% of all rent charged on deeds you own, dirty | +2 |
| Numbers Racket | $150 | 6 rounds | +$60 dirty per round | +2 |
| Chop Shop | $250 | 4 rounds | +$150 dirty per opponent landing on any deed you own | +3 |
| Speakeasy | $250 | one-shot | 2d6 on the payout table, dirty | +2 |
| Bribery | $200 **dirty only** | instant | Re-roll one die roll / cancel a card targeting you alone / delay one of your margin calls a round | +1 |
| Insider trading | $100 clean or dirty | instant | See the top card of the current era deck | +1 |

**Speakeasy** — expected value $294 dirty against a $250 cost:

| Roll | 2 | 3–5 | 6–8 | 9–11 | 12 |
|---|---|---|---|---|---|
| Payout | $0 | $100 | $250 | $500 | $1,200 |
| Chance | 2.8% | 25.0% | 44.4% | 25.0% | 2.8% |

**Heat: audits, fines and laundering**

Read the haircut at your Heat **before** the transaction's own +1.

| Heat | Audit chance (round 13+) | Audit fine | Laundering haircut | $400 dirty becomes |
|---|---|---|---|---|
| 0 | 0% | — | 25% | $300 |
| 1 | 0% | $100 | 25% | $300 |
| 2 | 2.8% | $200 | 25% | $300 |
| 3 | 8.3% | $300 | 25% | $300 |
| 4 | 16.7% | $400 | 30% | $280 |
| 5 | 27.8% | $500 | 35% | $260 |
| 6 | 41.7% | $600 | 40% | $240 |
| 7 | 58.3% | $700 | 45% | $220 |
| 8 | 72.2% | $800 | 50% | $200 |
| 9 | 83.3% | $900 | 55% | $180 |
| 10 | 91.7% | $1,000 | 60% | $160 |
| 11 | 97.2% | $1,100 | 60% | $160 |
| 12+ | 100% | $100 × Heat | 60% | $160 |

An audit seizes **all** dirty cash, charges the fine **in clean cash**, and resets Heat to 0.

## 5.6 Ratings and marks

### The rating multiplier

`MULTIPLIER = (1 − 0.25 × concentration) ÷ (1 + 0.10 × leverage)`, precomputed:

| conc ↓ / lev → | 0 | 0.5 | 1.0 | 1.5 | 2.0 | 2.5 | 3.0 | 3.5 | 4.0 | 4.5 | 5.0 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **0.00** | 1.000 | 0.952 | 0.909 | 0.870 | 0.833 | 0.800 | 0.769 | 0.741 | 0.714 | 0.690 | 0.667 |
| **0.25** | 0.938 | 0.893 | 0.852 | 0.815 | 0.781 | 0.750 | 0.721 | 0.694 | 0.670 | 0.647 | 0.625 |
| **0.40** | 0.900 | 0.857 | 0.818 | 0.783 | 0.750 | 0.720 | 0.692 | 0.667 | 0.643 | 0.621 | 0.600 |
| **0.50** | 0.875 | 0.833 | 0.795 | 0.761 | 0.729 | 0.700 | 0.673 | 0.648 | 0.625 | 0.603 | 0.583 |
| **0.60** | 0.850 | 0.810 | 0.773 | 0.739 | 0.708 | 0.680 | 0.654 | 0.630 | 0.607 | 0.586 | 0.567 |
| **0.75** | 0.812 | 0.774 | 0.739 | 0.707 | 0.677 | 0.650 | 0.625 | 0.602 | 0.580 | 0.560 | 0.542 |
| **1.00** | 0.750 | 0.714 | 0.682 | 0.652 | 0.625 | 0.600 | 0.577 | 0.556 | 0.536 | 0.517 | 0.500 |

Round concentration to the nearest row and leverage to the nearest 0.5.

```
score = (expected pool cashflow ÷ cumulative claim through the tranche) × multiplier
```

| Score | ≥ 2.20 | ≥ 1.50 | ≥ 1.20 | ≥ 1.00 | ≥ 0.80 | ≥ 0.60 | < 0.60 |
|---|---|---|---|---|---|---|---|
| Rating | **AAA** | **AA** | **A** | **BBB** | **BB** | **B** | **CCC** |

Read across the bottom row of the grid: **the worst possible pool in the game still only knocks
half off the coverage ratio.** Coverage is what the rating measures. Everything else is a rounding
error, which is the point. Note also that this multiplier *is* equity's score, since equity's
coverage is always exactly 1.00.

### Marking a loan note at scoring

`principal × multiplier`, where leverage is the borrower's drawn balance ÷ borrowing base:

| Borrower leverage | 0 | 0.5 | 1.0 | 1.5 | 2.0 | 2.5 | 3.0 | 3.5 | 4.0+ |
|---|---|---|---|---|---|---|---|---|---|
| Multiplier | ×1.00 | ×0.93 | ×0.85 | ×0.78 | ×0.70 | ×0.63 | ×0.55 | ×0.48 | ×0.40 |
| $500 note marks at | $500 | $462 | $425 | $387 | $350 | $312 | $275 | $237 | $200 |

## 5.7 Board traffic

**These are not the published Monopoly figures and the published figures are wrong here.** The era
decks contain no movement cards, so all six card squares are ordinary resting squares and square
30 is the only relocating square on the board. Every widely cited table (Illinois 3.19%, Jail 6.2%,
GO 3.10%) assumes the standard decks.

| Group | Squares | Combined | Per square | H per square |
|---|---|---|---|---|
| **Railroads** | 5, 15, 25, 35 | **9.9684%** | 2.4921% | 0.089 |
| **Orange** | 16, 18, 19 | 8.2293% | **2.7431%** | 0.098 |
| Yellow | 26, 27, 29 | 8.1013% | 2.7004% | 0.096 |
| Red | 21, 23, 24 | 8.0150% | 2.6717% | 0.095 |
| Green | 31, 32, 34 | 7.7401% | 2.5800% | 0.092 |
| Pink | 11, 13, 14 | 7.2522% | 2.4174% | 0.086 |
| Light Blue | 6, 8, 9 | 6.8199% | 2.2733% | 0.081 |
| Utilities | 12, 28 | 5.0602% | 2.5301% | 0.090 |
| Brown | 1, 3 | 4.6250% | 2.3125% | 0.083 |
| Dark Blue | 37, 39 | 4.4440% | 2.2220% | 0.079 |

All 28 purchasable squares combined: **70.2556%**. Average per purchasable square: **2.5091%**.

| Square | Name | Landing % |
|---|---|---|
| 10 | Jail / Just Visiting | **5.3305%** |
| 17 | Community Chest 2 | 2.8224% |
| 20 | Free Parking | 2.7156% |
| 22 | Chance 2 | 2.6704% |
| 33 | Community Chest 3 | 2.5317% |
| 2 | Community Chest 1 | 2.3129% |
| 4 | Income Tax | 2.2980% |
| 36 | Chance 3 | 2.2883% |
| 0 | Go | 2.2775% |
| 7 | Chance 1 | 2.2665% |
| 38 | Luxury Tax | 2.2306% |
| 30 | Go To Jail | **0.0000%** |

The six card squares take **14.89% of all rolls between them**, so expect a draw roughly every
seventh roll at the table — about **three draws per round**. Each era deck of 20 cards will be
substantially consumed in its six rounds. If a deck runs out, reshuffle its discards and continue.

**Four facts worth internalising:**

**Orange is the best colour group, and Jail is the entire reason.** At 2.74% per square it leads
all ten groups. Jail is the most-landed square on the board at 5.33%, and orange sits six to nine
squares past it, right in the middle of the 2d6 distribution.

**The railroads lead by count, not by quality.** 9.97% combined is the highest of any set, but at
2.49% per square they sit below the 2.51% board average. They are worth drafting because four
deeds acquired individually form a complete set with no trade and no development required.

**Dark blue is the worst-trafficked group on the board** at 2.22% per square. Boardwalk draws
2.2553% — less often than Mediterranean Avenue. Its rent is the largest in the game and its
frequency is nearly the smallest, so correctly priced rent futures on it sit far below where
instinct puts them.

**Traffic is deliberately flat.** Tennessee (2.77%) beats Park Place (2.19%) by only **1.27×**.
Standard Monopoly's ratio is 1.50×. Deed value is dominated by rent tables and development
potential, not by board position.

---
---

# Part 6 — Worked examples

## Example 1 — Pricing a rent future

You own Boardwalk with a hotel on it. Rent is **$2,000**. Someone offers to buy an 8-round future
on it, rounds 15 through 22. What is it worth?

Look up Boardwalk in 5.3, hotel column: **$1,288.** That is the whole calculation.

The long way, if you want to see it:

```
H for Boardwalk                       0.081 hits per round
Rounds in window                      8
Expected hits                         0.081 × 8   =  0.644
Expected value                        0.644 × $2,000  =  $1,288
```

Now the part that matters. **P(0) for Boardwalk is 52%.**

```
Chance of ZERO hits over the window       52%
Chance of exactly one hit                 34%
Chance of two or more                     14%
```

**Half the time this contract pays absolutely nothing.** Its $1,288 value is the average of a coin
flip between $0 and $2,000, with a modest tail.

Compare New York Avenue, hoteled at $1,000 rent: 5.3 gives **$782**, P(0) 45%. Boardwalk is worth
more, but only 1.6× more despite twice the rent — because it is landed on 18% less often.
Boardwalk draws 2.2553%, which is less often than **Mediterranean Avenue**.

**How to use this.** As the seller you want the buyer anchored on "it's Boardwalk." As the buyer,
pay meaningfully under $1,288 for a contract with a 52% chance of paying nothing, unless variance
is what you are shopping for. And note the encumbrance rules: if the owner mortgages Boardwalk
mid-window you are owed the remaining value immediately, so a mortgage is not the rug-pull it
looks like.

**The edge the table cannot see.** The number prices Boardwalk *as it is now.* Traffic on this
board varies by only 1.27× from busiest square to quietest, so nearly the entire spread between a
worthless contract and a valuable one is **what is built on the property.** If you are the owner
and you sell this future for $1,100 while sitting on four houses, then hotel the property in round
16, you have sold at a four-house price ($1,094) for a hotel-value stream. Nothing stops you.
Equally, if you are the buyer and you know the owner is $56 a round underwater on carrying costs
and about to strip that group to mortgage it, you should be paying far less than $1,288.

## Example 2 — Structuring and rating a CDO

You hold three peer loan notes. All three were made to Dana, who is running at **3.5× leverage**.

| Note | Principal | Rate | Rounds left | Interest | Total expected cashflow |
|---|---|---|---|---|---|
| A | $600 | 8%/round | 5 | $48 × 5 = $240 | **$840** |
| B | $400 | 10%/round | 4 | $40 × 4 = $160 | **$560** |
| C | $500 | 6%/round | 6 | $30 × 6 = $180 | **$680** |
| | | | | | **Pool: $2,080** |

Note A is secured on Vermont Avenue and Connecticut Avenue, $220 of face value between them.

You cut it: **Senior $700, Mezzanine $600, Equity the residual.** Senior + Mezzanine = $1,300,
comfortably under the $2,080 cap.

The inputs: concentration is **1.00** — every dollar comes from Dana. Leverage is **3.5**. From the
grid in 5.6, row 1.00, column 3.5: **multiplier 0.556.**

```
SENIOR      coverage = 2,080 ÷   700 = 2.971
            score    = 2.971 × 0.556 = 1.652   →  AA

MEZZANINE   coverage = 2,080 ÷ 1,300 = 1.600
            score    = 1.600 × 0.556 = 0.890   →  BB

EQUITY      coverage = 2,080 ÷ 2,080 = 1.000   (always, by definition)
            score    = 1.000 × 0.556 = 0.556   →  CCC
```

**Your senior slice is rated AA and every dollar behind it depends on one over-levered player.**
The rating is correct arithmetic. It is also useless, and the facilitator says so in the same
breath: *"AA — concentration 1.00, weighted leverage 3.5."* Sell to whoever hears the letter and
not the rest of the sentence.

**What the same structure looks like diversified.** Identical cashflows, three different
borrowers, concentration 0.40, leverage 1.0 — multiplier **0.818**:

| Tranche | Coverage | Concentrated pool | Diversified pool |
|---|---|---|---|
| Senior $700 | 2.971 | 1.652 → **AA** | 2.430 → **AAA** |
| Mezzanine $600 | 1.600 | 0.890 → **BB** | 1.309 → **A** |
| Equity | 1.000 | 0.556 → **CCC** | 0.818 → **BB** |

One rating notch on the senior, two on the mezzanine, two on the equity. **Diversification is
worth less here than it should be.** That is deliberate.

**Now run the waterfall.** Dana pays interest for three Settlements — $48 + $40 + $30 = **$118 per
round** — then defaults in the fourth.

```
Round 1   pool collects $118          →  Senior.  Senior remaining face: $582
Round 2   pool collects $118          →  Senior.  Senior remaining face: $464
Round 3   pool collects $118          →  Senior.  Senior remaining face: $346
Round 4   Dana defaults on all three notes at once.
          Note A's collateral (Vermont + Connecticut, $220 face) is sold to the
          bank at 80% = $176, and that cash enters the pool.
          pool collects $176          →  Senior.  Senior remaining face: $170
          Remaining balances written off. Dana's base is halved, permanently.

FINAL     Senior received $530 of $700.   Mezzanine: $0.   Equity: $0.
```

Collateral never arrives as deeds. A waterfall can only distribute money, so the facilitator
converts the deeds at the standard 80% floor and pays the cash down the priority ladder.

At the end of round 24 the pool terminates with the Senior still $170 short of its face. **That is
a credit event.** Any CDS written on this Senior tranche now pays its notional — capped at $700 —
from seller to buyer. The seller had to post 30% of that notional, $210, against their borrowing
base from the day they wrote it; that collateral does not cover the loss.

Whoever bought your AA senior tranche for something near $620 has recovered $530. Whoever bought
protection on it for $40 a Settlement has done rather better.

## Example 3 — Does a venture pay off?

You are Riley. You own St. James, Tennessee and New York Avenue (the full orange group, **all
hoteled**) and **all four railroads**. Seven deeds — the strongest rent position available on this
board. It is round 9.

Your expected rent charged per roll:

| Deed | Rent | Landing % | Expected rent per roll |
|---|---|---|---|
| St. James (hotel) | $950 | 2.7146% | $25.79 |
| Tennessee (hotel) | $950 | 2.7743% | $26.36 |
| New York (hotel) | $1,000 | 2.7405% | $27.41 |
| 4 railroads | $200 each | 9.9684% combined | $19.94 |
| | | | **$99.49 per roll** |

Multiply by the 3.57 rolls per round that can owe you rent: **$355 of rent charged per round.**

**Escort Service — $300, 4 rounds, +40% of rent charged, +2 Heat**

```
Rent charged over 4 rounds      $355 × 4         = $1,421
Escort pays 40%                                  =   $568 dirty
Launder at Heat 0 (25% haircut)                  =   $426 clean
Cost                                             =  −$300
NET                                              =  +$126 clean
```

Note the Heat. You launch in round 9 for +2. Rounds 10, 11 and 12 involve no *deliberate* dirty
action — the payouts are automatic and do not block decay — so you are back to **Heat 0** by the
time you launder, and you take the base 25% haircut.

Note also that this is 40% of rent *charged*, not received. If you have sold rent futures on the
oranges, you still collect the full Escort bonus.

**Numbers Racket — $150, 6 rounds, $60/round, +2 Heat**

```
$60 × 6 rounds                                   =   $360 dirty
Launder at Heat 0                                =   $270 clean
Cost                                             =  −$150
NET                                              =  +$120 clean
```

**Chop Shop — $250, 4 rounds, $150 per opponent landing, +3 Heat**

Riley's total traffic across all seven deeds is 8.2293% + 9.9684% = **18.20% per roll.**

```
Expected landings   0.1820 × 3.57 × 4 rounds     =   2.60
Payout              2.60 × $150                  =   $390 dirty
Launder at Heat 0                                =   $292 clean
Cost                                             =  −$250
NET                                              =   +$42 clean
```

**Speakeasy — $250 one-shot, +2 Heat**

```
Expected payout    $294 dirty
Laundered at 25%   $221 clean   against a $250 cost   →  −$29 expected
```

And 27.8% of the time you roll 5 or under and take $100 or nothing.

**What this tells you.** Escort Service, run on the single best rent position in the game, nets
**$126** over four rounds. Numbers Racket, available to a player who owns nothing at all, nets
**$120** over six. The position-sensitive venture beats the position-blind one by six dollars at
the very top of its range, and Chop Shop and Speakeasy do not meaningfully clear their cost.

So do not launch a venture for the clean money. Launch it because **bribery can only be paid in
dirty cash**, because dirty cash is invisible to every opponent reading your net worth, and
because Heat decays for free while a venture runs. The usual correct play is to start something in
Era II, launder once at low Heat, and be cold by round 13.

## Example 4 — Reading a margin call

Round 14, Era III, rate 8%. Riley from example 3 still holds the oranges and all four railroads.

| Holding | Face / cost |
|---|---|
| St. James, Tennessee, New York (orange, hoteled) | $560 face |
| Four railroads | $800 face |
| **Total deed face** | **$1,360** |
| 3 hotels on Pink/Orange group at $500 each | $1,500 building cost |

Summing the **Credit** column in 5.2: $135 + $135 + $150 + $150 + $150 + $150 + $150 = **$1,020**.
Plus 50% of $1,500 building cost = **$750**.

```
BORROWING BASE  =  $1,020  +  $750  =  $1,770
DRAWN                                  $1,700
HEADROOM                                  $70
```

Every Settlement now costs **$56** carrying cost on seven deeds plus **$136** interest at 8% on
$1,700. **That is $192 a round before you do anything at all.** You have $150 in clean cash.

**Settlement, round 14.** Step 3 takes the $56 carrying cost, leaving you $94. Step 4 wants $136;
your $94 covers part and the remaining **$42 capitalises**.

```
Drawn: $1,700 → $1,742      Base $1,770      Headroom $28
```

No call yet. But nothing has been fixed either.

**Settlement, round 15.** You have no clean cash. The $56 carrying cost becomes distressed debt on
the spot — carrying costs are not a margin event. Interest of 8% on $1,742 is $139, and all of it
capitalises.

```
Drawn: $1,742 → $1,881      Base $1,770

MARGIN CALL.  Short by $111.
```

You did nothing wrong in round 15. **Interest alone did this.**

**Curing it.** You have until the end of the next Open phase.

| Option | Effect |
|---|---|
| **Sell a rent future** on Tennessee — hoteled, 8-round window, table value **$752**. Sell it for $600 and repay the line. | Drawn → $1,281 against an unchanged base of $1,770. **Cured, with $489 of headroom.** You gave up expected rent, not borrowing base. This is the cleanest cure in the game. |
| **Take a peer loan.** Borrow $200 from Ben at 5%/round and repay the line. | Drawn → $1,681 ≤ $1,770. **Cured**, and you swapped 8% bank debt for 5% peer debt. Peer loans do not touch your borrowing base. Mind the collateral. |
| **Sell a railroad** to a player for $190. | Raises $190 but removes $150 of base. Net improvement only **$40** — the shortfall goes $111 → $71. Not enough on its own. |
| **Bribe**, $200 in dirty cash. | Delays the call one round. Solves nothing, buys a round. |
| **Mortgage New York Avenue.** | See below. Do not. |

**Why mortgaging is the trap.** New York Avenue has a hotel on it, and you cannot mortgage a
developed property. You must sell the buildings back first, and sell-back is even across the group
— so mortgaging one orange deed means **stripping all three hotels.** That is +$750 in cash but
−$750 of base, then −$150 more when the mortgage lands. Your base falls from $1,770 to $870.
Worse, your orange rents fall from $950 / $950 / $1,000 to $14 / $14 / nothing, with no
full-group doubling because New York is mortgaged. You would trade the best rent position on the
board for $850 and still be margin-called.

**If you do not cure it.** You are marked at Settlement step 10 and liquidated at the start of the
following Open phase, in a facilitator-run auction.

First the hotels are stripped: $750 back from the bank against the debt, and $750 off the base.

```
Drawn: $1,881 → $1,131      Base: $1,770 → $1,020      Shortfall still $111
```

Stripping is exactly shortfall-neutral, which is why it happens first and why it is never a cure.
Then the deeds go, in descending face order, each at the 80% floor if nobody bids higher:

| Deed | Face | Raises (80%) | Base lost (75%) | Shortfall closes by |
|---|---|---|---|---|
| New York Ave | $200 | $160 | $150 | $10 |
| 4 railroads | $200 each | $160 each | $150 each | $10 each |
| St. James, Tennessee | $180 each | $144 each | $135 each | $9 each |
| | | | **Total** | **$68** |

> **Liquidation converges — but at 5% of face per sale, which is nowhere near fast enough.** All
> seven deeds close only **$68** of a **$111** shortfall. You end the auction owning nothing, still
> $43 short, and that $43 becomes distressed debt compounding at 15%.
>
> This is the whole argument for curing it yourself. **Selling one rent future you chose, at a
> price you negotiated, fixes in a single move what the auction cannot fix by taking everything
> you own.** The floor is set at 80% against a 75% advance rate so that liquidation terminates
> rather than spiralling — not so that it rescues you.

## Example 5 — When you cannot pay

Round 17. You land on an opponent's hoteled Boardwalk. **Rent: $2,000.**

You hold seven undeveloped deeds — the pink group (St. Charles $140, States $140, Virginia $160),
Short Line $200, Oriental $100, Baltic $60, Mediterranean $60 — for **$860 of face value**. No
buildings. Summing the Credit column: $105 + $105 + $120 + $150 + $75 + $45 + $45 = **$645.** You
have drawn $525. You have **$180** in clean cash, and $56 a round going out in carrying costs.

An unpayable rent bill is **not** a margin call, so there is no auction and no liquidation. Follow
the obligation path:

```
Clean cash                                                   $180
Draw remaining credit  ($645 base − $525 drawn)             +$120  →   $300

STILL OWED                                                          $1,700
                                                    →  DISTRESSED DEBT
```

Nobody comes to take your deeds. You keep all seven. What you have instead is $1,700 compounding
at 15% a round:

| End of round | 18 | 19 | 20 | 21 | 22 | 23 | **24** |
|---|---|---|---|---|---|---|---|
| Distressed debt | $1,955 | $2,248 | $2,585 | $2,973 | $3,419 | $3,932 | **$4,522** |

A $1,700 shortfall in round 17 subtracts **$4,522** from your final net worth if you ignore it.
Every $100 you repay in round 18 is worth **$266** at scoring.

**And there is a second problem you just created.** You drew your credit line to exactly your
borrowing base, so your headroom is zero. Next Settlement the $56 carrying cost has nowhere to come
from and becomes more distressed debt, and 8% interest on $645 — $51 — capitalises into a drawn
balance already at the ceiling.

```
Drawn: $645 → $696      Base $645      MARGIN CALL, short $51
```

*That* one is a margin call, and it does trigger the auction if you leave it uncured. **This is the
shape of the spiral:** the rent bill does not take your deeds, but the debt it leaves behind
arranges for the credit line to take them a round later.

**What you should have done in the Open phase before this.** Everything on this list beats both
the 15% coupon and the auction that follows it:

- **sell rent futures on your deeds while you still own them** — a future raises cash without
  touching your borrowing base at all
- sell a deed to another player at a negotiated price
- borrow from a player at any rate under 15% per round, which is every rate a sane lender would
  offer
- mortgage a deed nobody lands on and bank the $8 a round as well as the cash

**And the thing nobody thinks of until round 22:** if you are the opponent who owns that hoteled
Boardwalk, a player who cannot pay you is a player whose loan note now marks at 40% of principal in
*your* net worth. Bankrupting the table is not obviously good for you.

---
---

# Part 7 — Printable forms

## Draft slip — print 28 (7 per player)

```
┌─────────────────────────────────────────────────────┐
│  LEVERAGE — DRAFT SLIP        Player: ____________  │
│                               Draft round:  ___/7   │
│                                                     │
│   1st choice  ____________________  face $ _______  │
│   2nd choice  ____________________  face $ _______  │
│   3rd choice  ____________________  face $ _______  │
│                                                     │
│   MAX BID on 1st choice        $ ________           │
│     (≥ its face value, ≤ your remaining budget)     │
│                                                     │
│   Remaining budget before this round  $ ________    │
│                                                     │
│   You pay YOUR OWN BID if contested.                │
│   2nd and 3rd choices cost face value only.         │
└─────────────────────────────────────────────────────┘
```

## Player sheet — print 4, use pencil

```
╔═══════════════════════════════════════════════════════════════════════════╗
║ LEVERAGE — PLAYER SHEET          NAME ______________  TURN ORDER  ___/4   ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ DEEDS (tick M when mortgaged; write H = houses, X = hotel)                ║
║                                                                           ║
║  Deed ____________________  face $_____ credit $_____  M☐  bldg _____     ║
║  Deed ____________________  face $_____ credit $_____  M☐  bldg _____     ║
║  Deed ____________________  face $_____ credit $_____  M☐  bldg _____     ║
║  Deed ____________________  face $_____ credit $_____  M☐  bldg _____     ║
║  Deed ____________________  face $_____ credit $_____  M☐  bldg _____     ║
║  Deed ____________________  face $_____ credit $_____  M☐  bldg _____     ║
║  Deed ____________________  face $_____ credit $_____  M☐  bldg _____     ║
║                                                                           ║
║  UNMORTGAGED DEED COUNT ____  ×  $8  =  CARRYING COST $_____ / round      ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ CREDIT                                                                    ║
║   sum of credit column (unmortgaged only)   $__________                   ║
║ + 50% of total building cost                $__________                   ║
║ + card uplift (additive)                    $__________                   ║
║ × card multiplier                           $__________                   ║
║ − 30% of CDS notional written               $__________                   ║
║ ÷ 2 if peer-loan default (permanent) ☐      $__________                   ║
║ = BORROWING BASE                            $__________                   ║
║   DRAWN BALANCE                             $__________                   ║
║   HEADROOM  (negative = MARGIN CALL)        $__________                   ║
║   FLAGGED THIS ROUND ☐    MARKED FOR LIQUIDATION ☐                        ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ DISTRESSED DEBT   $__________     (×1.15 every Settlement, round down)    ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ UNDERWORLD                                                                ║
║   DIRTY CASH  $__________         HEAT  ▢▢▢▢▢▢▢▢▢▢▢▢  (0–12)             ║
║   Ventures running:                                                       ║
║     ______________________  rounds left ____                              ║
║     ______________________  rounds left ____                              ║
║   Laundered this Open phase ☐    Bribed this round ☐                      ║
║   Deliberate dirty action this round ☐  (if unticked at Settlement: −1)   ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ CONTRACTS I HOLD (cards in front of me)                                   ║
║   ______________________________________________________________          ║
║   ______________________________________________________________          ║
║   ______________________________________________________________          ║
║ CONTRACTS AGAINST ME (I owe / my deeds are encumbered)                    ║
║   ______________________________________________________________          ║
║   ______________________________________________________________          ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

## Facilitator's register

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ LEVERAGE — FACILITATOR'S REGISTER                                            ║
║ Turn order:  1.__________ 2.__________ 3.__________ 4.__________             ║
║ Round ____ / 24     Era ____     Rate ____%     TREASURY  $__________         ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ RENT FUTURES                                                                 ║
║ #F-__  property __________  owner ______  holder ______  rounds ____–____     ║
║ #F-__  property __________  owner ______  holder ______  rounds ____–____     ║
║ #F-__  property __________  owner ______  holder ______  rounds ____–____     ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ PEER LOANS                     STEP 5 — read these aloud every Settlement    ║
║ #L-__  ______ pays ______  $____ /rd   term ____–____  collat ____________   ║
║ #L-__  ______ pays ______  $____ /rd   term ____–____  collat ____________   ║
║ #L-__  ______ pays ______  $____ /rd   term ____–____  collat ____________   ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ DEED OPTIONS                   deed is LOCKED against sale/trade/mortgage    ║
║ #O-__  deed __________ writer ______ holder ______ strike $____ exp rd ____  ║
║ #O-__  deed __________ writer ______ holder ______ strike $____ exp rd ____  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ CDO POOLS                      STEP 6 — waterfall                            ║
║ #P-__  orig ______  expected cashflow $______  underlying ________________   ║
║        SR face $_____ rem $_____ held ______                                 ║
║        MZ face $_____ rem $_____ held ______                                 ║
║        EQ residual              held ______                                  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ CDS                            STEP 7 — premiums                             ║
║ #S-__  ref __________  buyer ______ seller ______ notional $____ prem $____  ║
║ #S-__  ref __________  buyer ______ seller ______ notional $____ prem $____  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ LIVE CARD EFFECTS — announce these every Market phase                        ║
║ ____________________________________________  expires round ____             ║
║ ____________________________________________  expires round ____             ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ FLAGS                                                                        ║
║ Margin-flagged this round: ______________________________                    ║
║ MARKED FOR LIQUIDATION next Open phase: __________________                   ║
║ Peer-loan default halving already applied to: ____________                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

## Scoring worksheet — print 4, fill in after round 24

```
╔══════════════════════════════════════════════════════════════════╗
║ LEVERAGE — FINAL SCORING                  NAME _______________   ║
╠══════════════════════════════════════════════════════════════════╣
║   Clean cash                                       + $_________  ║
║   Deed face value, unmortgaged                     + $_________  ║
║   Deed face value, mortgaged  (count at 50%)       + $_________  ║
║   Building cost  (what you paid)                   + $_________  ║
║                                                                  ║
║   INSTRUMENTS HELD                                               ║
║     Rent futures    rent × H × rounds left         + $_________  ║
║     CDO tranches    remaining cashflow to you      + $_________  ║
║     Loan notes      principal × leverage mult (5.6)+ $_________  ║
║     Deed options    max(0, face − strike)          + $_________  ║
║     CDS bought, untriggered                        +      $0     ║
║     CDS written, untriggered                       +      $0     ║
║                                                                  ║
║   Drawn credit balance                             − $_________  ║
║   Peer loan balances owed                          − $_________  ║
║   Distressed debt                                  − $_________  ║
║   CDS notional written AND triggered               − $_________  ║
║                                                                  ║
║   Dirty cash   $_______  ×  0                      +      $0     ║
║                                                                  ║
║                              NET WORTH             = $_________  ║
╚══════════════════════════════════════════════════════════════════╝
```

---
---

# Part 8 — Notes

## 8.1 Deviations from the app spec

This edition is faithful to `docs/superpowers/specs/2026-08-03-leverage-design.md` except where
listed. Every deviation exists because a human cannot do what an engine can, and each one is
stated so it can be reversed if the app is ever built.

| # | The spec says | This edition says | Why |
|---|---|---|---|
| 1 | Rent futures are valued by a Markov chain conditioned on **current token positions** | Valued from the **steady-state** landing probability, precomputed in 5.3 | Conditioning on live positions is a matrix computation per query. The steady-state figure is what the spec's own examples use, and over an 8-round window the difference is small. |
| 2 | Ratings use **cashflow-weighted mean** borrower leverage | Uses the **plain average** of the obligors' leverage, rounded to the nearest 0.5 | Cashflow weighting needs per-obligor cashflow shares. Plain averaging costs one rating notch at most, and the grid in 5.6 is coarse enough to absorb it. |
| 3 | The spec does not say how a **mortgaged deed** scores | Mortgaged deeds count at **50% of face** | Conserves value: you already received 50% in cash, so 50% cash + 50% deed = 100% of face. Charging the 5% redemption premium instead would be defensible but does not conserve. |
| 4 | The engine tracks **percentile outcomes** for every future | 5.3 gives **P(0)** — the chance of zero hits — only | P(0) carries the whole lesson: about half of all rent futures pay nothing. The 10th/90th percentiles are noise around that. |
| 5 | Spec §19.4 says pooled collateral sells at **70%**; §5 says the liquidation floor is **80%** | **80% everywhere** | The spec's own §5 proves the floor must exceed the 75% advance rate or liquidation diverges, and asserts it at startup. The 70% in §19.4 is a leftover from before that fix. Use one number. |
| 6 | Era decks are drawn from a **recorded shuffle** | Physical shuffle; reshuffle discards if a deck runs out | There is no replay to preserve. Three draws per round × six rounds will exhaust a 20-card deck. |
| 7 | The app displays an **assist panel** with warnings | The facilitator answers valuation questions on request (4.3) | Same information, pulled rather than pushed. Tell players in setup that they can ask for any number at any time. |

**Corrections to the era-card text.** Four cards in `docs/reference/era-decks.md` still carry
numbers from before the money supply and borrowing base were retuned. The versions in
`leverage-tabletop-cards.md` are corrected and each correction is flagged there:

| Card | Was | Now | Reason |
|---|---|---|---|
| E1-20 Wage Indexation | "GO pays $300 instead of $200" | **$450 instead of $350** | GO pays $350 in this game, not $200. Same +$100 delta. |
| E2-15 Payroll Tax Holiday | "GO pays $400 instead of $200" | **$550 instead of $350** | Same. Same +$200 delta. |
| E3-06 Credit Line Review | "40% of face plus 25% of building cost, instead of 50%" | **60% of face plus 40% of building cost, instead of 75% and 50%** | Written against the rejected 50%/25% base. Preserves the intent: a roughly one-fifth tightening. |
| E4-06 Collateral Haircut | "buildings contribute 10% instead of 25%" | **buildings contribute 20% instead of 50%** | Same cause, same fix. |
| E4-01 Covenant Breach | "the 70%-of-face floor" | **the 80%-of-face floor** | Matches deviation 5 above. |

## 8.2 Variants and trims

### If you are short on time — the 16-round game

Four eras of four rounds each. Everything else is unchanged.

| Era | Rounds | Rate | Stimulus / audits |
|---|---|---|---|
| I | 1–4 | 5% | — |
| II | 5–8 | 6% | $300 loan at start of round 5 |
| III | 9–12 | 8% | Audits begin round 9 |
| IV | 13–16 | 12% | — |

Rent future windows still cap at 8 rounds and must end by round 16. Lands near **2 hours**.

**What this changes.** Less total carrying-cost drain means players finish richer and less
levered, so credit is used less and the Era III securitization layer gets four rounds instead of
six to matter. This is the safe direction to shorten in — the 24-round configuration is already
near the maximum this rate curve supports, and the simulation showed a 36-round game reaching 82%
player bankruptcy. Shortening reduces pressure; it does not create a new failure mode. It has not
been simulated.

### If the table is new to economic games — the trim list

Drop from the top. Each line is self-contained and removes nothing that the lines below it depend
on.

1. **Drop CDS.** Removes the 30%-posting rule and the round-24 credit-event cascade. Costs the
   game its most dramatic ending and roughly 20 minutes.
2. **Drop CDOs and tranches.** With CDS already gone this removes the entire securitization layer
   and the ratings table. Peer loan notes stay sellable outright.
3. **Drop deed options.** Trading absorbs most of their function, and monopolies get harder to
   assemble.

**Do not drop rent futures, peer loans or the carrying cost.** Futures are the centrepiece; peer
loans are the cleanest margin-call cure in the game; and the carrying cost is the only thing
making anybody borrow. Remove it and the whole financial layer becomes decorative.

If you drop 1 and 2, replace the Era III unlock with "audits begin, deed options, insider trading"
and tell the table that Era III's new content is thinner than the others.

### If you want a target score instead of a fixed end

Set a net-worth target at setup — **$3,500** is roughly the top-quartile finish under the standard
configuration. First player to reach it wins, checked at each Settlement. Announce all four net
worths every third Settlement so the race is visible.

The fixed-24-round ending is the default because it makes the last six rounds about surviving
leverage rather than about a scramble. A target changes what Era IV is for. Both work; they are
different games.
</content>
