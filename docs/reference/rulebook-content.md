# LEVERAGE — Player Rulebook

> **Unresolved money-supply figures.** Three numbers are not final. They appear in this
> document as tokens. Substitute the values shown in the app.
>
> | Token | What it is |
> |---|---|
> | `{{STARTING_CASH}}` | Each player's single unified budget at setup. The draft spends from it; the remainder is your operating cash. |
> | `{{GO_SALARY}}` | Paid by the Treasury each time you pass or land on GO. |
> | `{{PROPERTY_TAX}}` | A recurring holding cost charged at Settlement. Whether this exists at all is still being decided. If the app shows no property tax line, it does not exist in your game. |
>
> Every other number in this rulebook is final.

---

## 1. The thirty-second version

You are playing Monopoly with the luck taken out of acquisition and put into a bond market.

Before anyone rolls, all 28 deeds are handed out in a seven-round sealed-bid draft. You end with exactly seven. Nobody starts with a monopoly; almost nobody finishes with one either, so you trade.

The game runs exactly 24 rounds, then stops. Nobody goes bankrupt and nobody is eliminated. If you cannot pay, the shortfall becomes debt that compounds against you at 15% a round, and you keep playing.

Across those 24 rounds you gain access to credit, loans to the other players, contracts on future rent, pooled securities backed by those contracts, insurance on the securities, and a small vice economy.

At the end, the app totals everyone's net worth. Highest number wins.

The app owns every number. The board and the dice stay physical.

---

## 2. Setup and the draft

### Setup, in order

1. Everyone opens their player URL. You have `{{STARTING_CASH}}`.
2. One die roll sets turn order for the entire game. It matters less than you think — no property is acquired by landing, so turn order only sets the order of movement within a round.
3. The draft runs. Seven rounds, all simultaneous, no dice.

### What you submit each draft round

Two things, privately, at the same time as everyone else:

- **A ranked list of three properties.** First, second, third.
- **A maximum bid for your first choice only.** At least that property's face value, at most your remaining budget.

Your second and third choices carry no bid. They are only ever acquired at face value.

The app rejects a submission that nominates an already-allocated property or bids above your remaining budget.

### How it resolves

The app applies these steps in order and shows everyone the result:

| Step | Rule |
|---|---|
| 1 | A property nominated first by exactly one player goes to that player at **face value**. |
| 2 | A property nominated first by two or more players goes to the **highest maximum bid**, who pays **their own bid** — first-price, not second-price. |
| 3 | Bid ties break to whoever has acquired **less total face value** so far; then to whoever is earlier in turn order. |
| 4 | Losers of a contest cascade to their second choice, then their third, acquiring at **face value** if it is still free. |
| 5 | Two cascading players landing on the same property: the one with **less total face value acquired** so far takes it. |
| 6 | All three of your choices gone? You get the **cheapest remaining property** at face value. |
| 7 | Your remaining budget cannot cover any remaining property? You **skip the round and receive $150**. |

After every round, all allocations are revealed to everyone. What you learn in rounds 1 through 6 is what makes round 7 skillful.

### A worked draft round

Round 1. Ana, Ben, Cass and Dev each hold `{{STARTING_CASH}}`.

| Player | 1st choice | 2nd | 3rd | Max bid |
|---|---|---|---|---|
| Ana | Reading Railroad ($200) | B&O Railroad ($200) | Illinois Ave ($240) | **$340** |
| Ben | Reading Railroad ($200) | New York Ave ($200) | Tennessee Ave ($180) | **$290** |
| Cass | Illinois Ave ($240) | Kentucky Ave ($220) | Indiana Ave ($220) | **$240** |
| Dev | Boardwalk ($400) | Park Place ($350) | Marvin Gardens ($280) | **$400** |

Resolution:

- **Reading Railroad** is contested. Ana's $340 beats Ben's $290. **Ana pays $340** for a deed with a $200 face value.
- **Illinois Avenue** — Cass alone. **Cass pays $240**, the face value. Her max bid never came into it.
- **Boardwalk** — Dev alone. **Dev pays $400**, the face value. His $400 bid was irrelevant.
- **Ben** lost his contest and cascades. New York Avenue is unclaimed. **Ben pays $200**.

Everyone ends round 1 with one deed. Ana paid a $140 premium; the other three paid face.

**The lesson that costs people the most money:** you pay your own bid. Ana would have won Reading Railroad for $291. She wrote $340 because she was thinking about her ceiling instead of her price. Write down what the deed is worth to you, not what you can afford.

### What a good first-round submission looks like

**Nominate a railroad.** The four railroads take 11.38% of all landings, more than any colour group on the board. They need no even-build development, no full-set trade, and no negotiation — a railroad is worth owning the moment you own it, and the fourth one quadruples the rent of the first. Expect them to be the most contested deeds in the draft. That is by design.

**Rank three properties that are not near-substitutes.** If your three choices are Boardwalk, Park Place and Marvin Gardens, and a rival takes Boardwalk, your cascade lands you exactly where two other players are also cascading. Spread your ranks across price bands so at least one choice survives the round.

**Bid above face only where the premium buys traffic.** A $140 premium on a railroad buys you 2.96% of every roll for 24 rounds. The same $140 on Park Place buys you 2.19%, and Park Place is useless without Boardwalk.

**Watch what you are not buying.** Twenty-eight deeds split 7/7/7/7 across ten colour groups means completing a group costs two or three of your seven picks while three opponents actively work to stop you. Monopolies are rare here on purpose. It is entirely reasonable to draft for traffic and cash and to buy your monopoly later from someone who needs the money.

---

## 3. A round, step by step

Twenty-four rounds. Four phases each. There is no enforced timer; the facilitator advances the phases.

### Phase 1 — Market (~15 seconds)

The app posts the round number, the era, the prevailing interest rate and any card effects still running. **You read.** That is the whole phase.

### Phase 2 — Open (45–90 seconds, everyone at once)

The only phase in which you take financial actions, and everyone takes them simultaneously in their own view. Depending on the era, this is where you:

- draw on or repay your bank credit line
- build houses and hotels, mortgage and unmortgage
- trade deeds and cash with other players
- make or take peer loans; originate, buy, sell or resell rent futures
- launch a venture, launder dirty cash, pay a bribe, buy insider information
- build a CDO, sell tranches, write or buy a CDS, write or exercise a deed option
- **cure a margin call** before it force-liquidates you

Negotiate out loud. Enter the deal in your own view. The facilitator is not a bottleneck — routing every action through one person would turn a 90-second phase into a ten-minute one.

### Phase 3 — Movement (~15 seconds each, in turn order)

Roll the physical dice. The facilitator enters the result. The app resolves the landing: rent, tax, a card draw, GO, Jail.

Rolling doubles gives you another roll. Three consecutive doubles sends you to Jail without moving. If you are in Jail, you pay $50 and leave on your next turn — this is mandatory, not optional, and you do not roll to escape.

### Phase 4 — Settlement (~10 seconds, automatic)

The app does all of this without asking you:

- charges interest on every drawn credit balance at the era rate
- collects interest due on peer loans
- runs every CDO waterfall
- matures contracts whose windows have ended
- ticks down venture timers and pays out venture income
- charges `{{PROPERTY_TAX}}`, if your game has one
- flags margin calls
- rolls audit checks (from round 13 onward)
- accrues distressed debt at 15%

Read what happened to you. Anything flagged must be dealt with in the next Open phase.

---

## 4. Era I — Recovery (rounds 1–6)

**What's new:** everything is new. This is the Monopoly part. Rent, building, mortgages, trading, and one credit line.

**Prevailing rate: 5% per round.**

### Rent

You collect rent when an opponent's token comes to rest on a deed you own and is unmortgaged. You collect nothing when you land on your own property, and nothing on a property you have mortgaged.

- **Undeveloped property:** base rent. **If you own the entire colour group and none of it is developed, the base rent doubles.**
- **Developed property:** the rent for its current number of houses, from the tables in section 8.
- **Railroads:** $25, $50, $100 or $200 depending on how many of the four you own.
- **Utilities:** 4× the dice roll if you own one, 10× the dice roll if you own both.

Rent is not automatic in the sense of arriving on a schedule. It arrives when someone lands. That is roughly a one-in-thirty-five event per property per opponent turn, which is why the rest of this game exists.

### Building

You may build only on a colour group you own **entirely and unmortgaged**, and you must build **evenly** — no property in the group may be more than one house ahead of another. Five houses is a hotel.

House supply is capped at **32 houses and 12 hotels for the whole table**. Buying up the houses so nobody else can build is a legitimate strategy and the app will let you do it.

### Mortgaging

Mortgage a deed for **50% of face value**. Unmortgage it for **55%**. A mortgaged property collects no rent and contributes nothing to your borrowing base.

### Trading

Deeds and cash, in any combination, with any player, in any Open phase. Enter the deal in the app; both sides confirm. Encumbered deeds carry their encumbrances to the new owner (this becomes relevant from Era II — see section 5).

### The bank credit line

A revolving line. Draw and repay freely in any Open phase.

```
BORROWING BASE = 50% of your unmortgaged deed face value
               + 25% of your building cost
```

Interest is charged every Settlement on your **drawn balance** at the era rate — 5% this era — and is paid to the Treasury. If you cannot pay it from clean cash, the interest **capitalises into the drawn balance** and starts earning interest itself.

### Margin calls

If your drawn balance exceeds your borrowing base at Settlement — usually because you mortgaged, sold or lost a deed — the position is flagged.

**You have until the end of the next Open phase to cure it**, by repaying cash or by raising your base (unmortgage something, buy something, build).

If you do not cure it, the app force-liquidates. Your deeds are offered to the other three players in descending face-value order. Each goes to the highest bid **at or above 70% of face value**; if nobody bids, the bank takes it at exactly 70%. The deed leaves play — it is not re-drafted. Proceeds pay down your drawn balance until the position is cured, then liquidation stops.

### Fixed board payments

| Square | What happens |
|---|---|
| GO (0) | Treasury pays you `{{GO_SALARY}}` on passing or landing |
| Income Tax (4) | You pay $200 to the Treasury. There is no percentage option. |
| Luxury Tax (38) | You pay $100 to the Treasury |
| Free Parking (20) | Nothing. There is no pot. |
| Go To Jail (30) | Straight to Jail, no `{{GO_SALARY}}` |
| Jail (10) | Pay $50 on your next turn and leave. Mandatory. |
| Chance (7, 22, 36) and Community Chest (2, 17, 33) | The facilitator taps draw and the app deals from the **Era I deck**. The physical cards are not used. |

### If you cannot pay

Nobody is eliminated, ever. After you have exhausted your credit line and whatever you are willing to liquidate, the shortfall becomes **Distressed Debt**, which accrues at **15% per round** and is subtracted from your net worth at scoring. You keep acting normally in every phase. See worked example 5.

---

## 5. Era II — Expansion (rounds 7–12)

**What's new:** peer loans, rent futures, ventures, laundering and bribery. The Treasury pays every player a **$300 stimulus at the start of round 7**.

**Prevailing rate: 6% per round.** Your credit line, borrowing base, margin calls, building, mortgaging, trading and rent all work exactly as in Era I; only the rate has moved.

Card draws now come from the **Era II deck**.

### Rent futures

The centrepiece. A contract that transfers **all rent collected on one specified property** over **a specified window of rounds** to whoever holds the contract.

**The rules:**

- Only the property's **owner** may originate a contract on it.
- The window is at most **8 rounds**, starts no earlier than the round after origination, and ends at or before round 24.
- A **mortgaged property cannot originate** a contract. It collects no rent.
- **One active contract per property.** No stacking.
- The **price is whatever the two of you agree**. The app enforces the contract, not the price.
- During the window, rent on that property routes to the holder automatically.
- The holder may **resell** the contract to any player at any price.

**Contracts follow the deed.** Sell or trade an encumbered property and the new owner inherits the obligation. The app shows the encumbrance on the deed so both sides can price it.

**Mortgaging triggers make-whole.** You may mortgage an encumbered property, but you immediately owe the holder the contract's remaining expected value as computed by the app, and the contract terminates. This closes the obvious escape route.

**What the app shows you** for any property, free, to everyone: landing probability, expected hits over the window, current rent at present development, expected value, and the 10th and 90th percentiles of the outcome.

**Why the market is still skillful.** The model prices the property **as it is right now**. You price it as it will be. Selling a future on a property you are about to hotel, or buying one from a player who is one bad roll from a margin call, are both edges the displayed number cannot see. See worked example 1.

### Peer loans

Any two players, freely negotiated. Four terms: **principal, per-round interest rate, term in rounds, and zero or more deeds pledged as collateral.** The app enforces every one of them.

Interest is due each Settlement. The lender holds a **note**, which is an asset — sellable outright, and poolable into a CDO once Era III opens.

**Default** happens on a missed interest payment or on any balance outstanding at term expiry. On default:

1. Collateral deeds transfer to the lender.
2. Any remaining balance is written off.
3. The borrower's **credit line borrowing base is permanently halved** for the rest of the game.

That third clause is the real cost. Read it before you pledge.

### Ventures

Vice. All income is paid in **dirty cash**, and all of it costs Heat.

| Venture | Cost | Duration | Effect | Heat |
|---|---|---|---|---|
| Escort Service | $300 | 4 rounds | +40% of all rent you collect, paid dirty | +2 |
| Numbers Racket | $150 | 6 rounds | +$60 dirty per round, flat | +2 |
| Chop Shop | $250 | 4 rounds | +$150 dirty each time any opponent lands on a deed you own | +3 |
| Speakeasy | $250 | one-shot | Roll 2d6 on the payout table | +2 |

Speakeasy payouts:

| Roll | Payout | Chance |
|---|---|---|
| 2 | $0 | 2.8% |
| 3–5 | $100 | 25.0% |
| 6–8 | $250 | 44.4% |
| 9–11 | $500 | 25.0% |
| 12 | $1,200 | 2.8% |

Expected payout is $294 dirty against a $250 cost. It is a gamble, not an income stream.

Escort Service and Chop Shop reward opposite board positions on purpose. Escort pays a percentage of rent, so it wants hotels on the oranges. Chop Shop pays a flat fee per landing regardless of rent, so it wants many cheap high-traffic squares.

### Dirty cash

Dirty cash is worth **exactly $0 at final scoring** and is **entirely seizable in an audit**. You may spend it on only four things: ventures, bribery, insider trading, and laundering.

**Laundering** converts dirty to clean at a **25% haircut**, worsening by **5 percentage points for every Heat point above 3**, capped at a 60% haircut. Each laundering transaction costs **+1 Heat**, and you may launder **at most once per Open phase**.

| Your Heat | Haircut | $400 dirty becomes |
|---|---|---|
| 0–3 | 25% | $300 |
| 4 | 30% | $280 |
| 5 | 35% | $260 |
| 6 | 40% | $240 |
| 7 | 45% | $220 |
| 8 | 50% | $200 |
| 9 | 55% | $180 |
| 10+ | 60% | $160 |

### Heat

| Action | Heat |
|---|---|
| Launch a venture | +2 |
| Launch a Chop Shop | +3 |
| Each laundering transaction | +1 |
| Bribery | +1 |
| Insider trading | +1 |
| A full round in which you take no dirty action | −1 |

**Nothing happens to your Heat in Era II.** Audit checks do not begin until round 13. This is a six-round window in which vice appears to be free money. It is not free; it is deferred. Heat carries into Era III on your sheet exactly as you accumulated it, and the −1 per clean round is the only way to shed it before the audits start.

### Bribery

**$200, payable only in dirty cash**, once per round per player, +1 Heat. It does exactly one of three things:

- forces a re-roll of any single die roll, including another player's movement
- cancels an era card effect drawn this round that targets you specifically
- delays one of your own margin calls by one round

It cannot cancel a card that targets all players, and it cannot be used during Settlement once an audit has already resolved.

Bribery is the reason dirty cash is not purely a liability. It gives the underworld its own internal currency.

---

## 6. Era III — Financialization (rounds 13–18)

**What's new:** CDO pools and tranches, credit default swaps, deed options, insider trading — and **audit checks begin**.

**Prevailing rate: 8% per round.** Everything from Eras I and II continues unchanged: rent, building, mortgages, trading, the credit line and its margin calls, peer loans, rent futures, ventures, dirty cash, laundering and bribery. Card draws come from the **Era III deck**.

### Audits

**Every Settlement from round 13 onward, the app rolls 2d6 against your Heat. If the roll is less than or equal to your Heat, you are audited.**

| Heat | Audit chance | Heat | Audit chance |
|---|---|---|---|
| 0–1 | 0% | 7 | 58.3% |
| 2 | 2.8% | 8 | 72.2% |
| 3 | 8.3% | 9 | 83.3% |
| 4 | 16.7% | 10 | 91.7% |
| 5 | 27.8% | 11 | 97.2% |
| 6 | 41.7% | 12 | 100% |

**On an audit:** all your dirty cash is seized, you pay a fine of **$100 × your Heat in clean cash**, and your **Heat resets to 0**.

The fine scales with Heat and the seizure scales with how much dirty cash you were sitting on, so the worst possible position is high Heat plus a large unlaundered pile. Launder early and often, or stay clean and let the −1 per round drain you down.

This system self-balances. Escort Service pays a percentage of *your* rent, so it is strongest for the player with the biggest board position — and that player has the most to lose when the audit lands. The instrument is most powerful exactly where it is most dangerous.

### Insider trading

$100 in clean **or** dirty cash. Reveals the top card of the current era deck **to you only**. +1 Heat.

### Deed options

Three numbers: **premium**, **strike**, **expiry round**.

The deed's owner writes the option and receives the premium. The holder may exercise in **any Open phase up to and including the expiry round**, paying the strike and receiving the deed. Options may be resold by the holder.

While an option is outstanding, the writer **may not sell, trade or mortgage** the underlying deed.

Deed options exist because monopolies are rare here. If you need one specific deed to complete a group and the owner will not sell today, buy the right to make him sell later.

### Securitization: pools and tranches

You may pool **three or more assets you own** — peer loan notes, rent futures, or deed options — into a CDO. The app computes the pool's total expected cashflow.

You then cut it into three tranches:

| Tranche | Face | Paid |
|---|---|---|
| **Senior** | fixed, set by you | first; retires when paid in full |
| **Mezzanine** | fixed, set by you | second; retires when paid in full |
| **Equity** | uncapped residual | everything left over, for the life of the pool |

Senior and Mezzanine faces are set at creation and **together cannot exceed the pool's expected cashflow.** Tranches are sold to other players at freely negotiated prices.

**The waterfall.** Every Settlement, all cash the pool's underlying assets collected is distributed in strict priority: Senior up to its remaining face, then Mezzanine up to its remaining face, then Equity takes whatever is left. The pool terminates when all underlying assets have matured or defaulted — or at the end of round 24, whichever comes first.

### Ratings

Computed by the app. No human judgment is involved.

```
coverage      = expected pool cashflow / cumulative claim through this tranche
concentration = largest share of expected pool cashflow from a single obligor (0..1)
leverage      = cashflow-weighted mean of borrowers' (drawn debt / borrowing base),
                capped at 5

score = coverage x (1 - 0.25 x concentration) / (1 + 0.10 x leverage)
```

| Score | Rating |
|---|---|
| ≥ 2.20 | AAA |
| ≥ 1.50 | AA |
| ≥ 1.20 | A |
| ≥ 1.00 | BBB |
| ≥ 0.80 | BB |
| ≥ 0.60 | B |
| < 0.60 | CCC |

The formula is coverage-dominant and forgiving of concentration. A pool of three loans all made to the same player at 3.8× leverage still rates its senior slice **AA**. That rating is arithmetically correct and analytically worthless. It is both the joke and a genuine strategy.

Alongside the letter, the app **always** displays obligor concentration and weighted borrower leverage as raw numbers. The information is there for anyone who reads it. Read it. See worked example 2.

### Credit default swaps

A CDS references either a **peer loan note** or a **CDO tranche**.

- The buyer pays a negotiated **premium** to the seller every Settlement.
- On a **credit event**, the seller pays the buyer the **notional**, agreed at origination and capped at the face value of the reference obligation.
- **Naked CDS is legal.** You may buy protection on debt you do not own.
- The seller must post **30% of notional** against their borrowing base. This is what prevents unlimited writing, and it can itself trigger a margin call.

**Credit events:**

| Reference | Event |
|---|---|
| Peer loan note | The borrower defaults |
| CDO tranche | The tranche receives less than its full face by pool termination |

Because tranche CDS settle at termination, and because **every pool terminates at the end of round 24**, protection you wrote can all come due in the final Settlement of the game. Plan for that in Era III, not in round 23.

---

## 7. Era IV — Reckoning (rounds 19–24)

**What's new: nothing.** No new instruments. The last six rounds are about surviving the leverage you already took on, not learning anything.

**Prevailing rate: 12% per round.** That is the entire mechanic. Everything you can do, you could already do; it now costs more than twice what it cost in Era I.

Everything continues: rent, building, mortgages, trading, credit lines, margin calls, peer loans, rent futures, ventures, dirty cash, laundering, bribery, audits every Settlement, deed options, CDOs, waterfalls, ratings and CDS. Card draws come from the **Reckoning deck**, which issues downgrades, sweeps and covenant breaches, and reads live game state — a card can name the most leveraged player or the player holding the most dirty cash.

### What 12% actually does

A drawn balance of $1,000 costs you $120 every Settlement. If you cannot pay it from clean cash it capitalises, so round 20's balance is $1,120, round 21's is $1,254, and by round 24 it is $1,574 against a borrowing base that has not moved. Interest alone will margin-call you. Check your headroom in the Market phase of round 19 and decide then whether you are deleveraging or committing.

### The final Settlement of round 24

Everything closes at once, and the order matters to you:

- **All CDO pools terminate**, whether or not their underlying assets have run their course.
- **Any tranche short of its face at that moment triggers its referencing CDS.** If you wrote protection, this is when you pay.
- Distressed debt takes its last 15%.
- The app computes net worth and the game ends.

There is no ambiguity about unresolved positions, and there is no round 25 in which things work out.

### Scoring

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

| Instrument you hold | Marked at |
|---|---|
| Rent future | Remaining expected value from the landing model |
| CDO tranche | Expected remaining cashflow through the waterfall |
| Loan note | `principal x (1 − 0.15 x min(borrowerLeverage, 4))` |
| Deed option | `max(0, deed face value − strike)` |
| CDS bought, untriggered | Zero |
| CDS written, untriggered | Zero — the 30% collateral reduces your borrowing base, not your net worth |

`borrowerLeverage` is that borrower's drawn credit balance divided by their borrowing base. A note against an unlevered player marks at par; a note against a player at 4× or worse marks at 40% of principal. Lending to a wreck destroys the value of your own asset.

**You win by having the highest net worth after round 24.** If the facilitator set a net-worth target at setup instead, the first player to reach it wins, and the app displays everyone's progress toward it.

---

## 8. Reference tables

### Eras

| Era | Rounds | Rate | Unlocks |
|---|---|---|---|
| I — Recovery | 1–6 | **5%** | Deeds, building, mortgage, trading, bank credit line |
| II — Expansion | 7–12 | **6%** | Peer loans, rent futures, ventures, laundering, bribery. $300 stimulus to each player at the start of round 7. |
| III — Financialization | 13–18 | **8%** | CDO pools and tranches, CDS, deed options, insider trading. **Audits begin.** |
| IV — Reckoning | 19–24 | **12%** | Nothing. Rate pressure and the Reckoning deck. |

### Fixed payments

| Item | Amount |
|---|---|
| Starting budget | `{{STARTING_CASH}}` |
| GO, passing or landing | `{{GO_SALARY}}` |
| Recurring property tax, if in play | `{{PROPERTY_TAX}}` |
| Income Tax (square 4) | $200 |
| Luxury Tax (square 38) | $100 |
| Leaving Jail | $50 |
| Era II stimulus, round 7 | $300 per player |
| Draft round you cannot afford | $150 to you |
| Mortgage a deed | you receive 50% of face |
| Unmortgage a deed | you pay 55% of face |
| Forced liquidation floor | 70% of face |
| Distressed debt | 15% per round |

### Properties: price, rent, and traffic

Rent shown is the base. **Double the base rent if you own the full colour group and none of it is developed.** Landing % is the exact steady-state probability that a single roll ends on that square.

| Sq | Property | Group | Price | Mtg | House | Rent | 1H | 2H | 3H | 4H | Hotel | Landing % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Mediterranean Ave | Brown | $60 | $30 | $50 | $2 | $10 | $30 | $90 | $160 | $250 | 2.1314% |
| 3 | Baltic Ave | Brown | $60 | $30 | $50 | $4 | $20 | $60 | $180 | $320 | $450 | 2.1624% |
| 6 | Oriental Ave | Light Blue | $100 | $50 | $50 | $6 | $30 | $90 | $270 | $400 | $550 | 2.2621% |
| 8 | Vermont Ave | Light Blue | $100 | $50 | $50 | $6 | $30 | $90 | $270 | $400 | $550 | 2.3210% |
| 9 | Connecticut Ave | Light Blue | $120 | $60 | $50 | $8 | $40 | $100 | $300 | $450 | $600 | 2.3003% |
| 11 | St. Charles Place | Pink | $140 | $70 | $100 | $10 | $50 | $150 | $450 | $625 | $750 | 2.7017% |
| 13 | States Ave | Pink | $140 | $70 | $100 | $10 | $50 | $150 | $450 | $625 | $750 | 2.3721% |
| 14 | Virginia Ave | Pink | $160 | $80 | $100 | $12 | $60 | $180 | $500 | $700 | $900 | 2.4649% |
| 16 | St. James Place | Orange | $180 | $90 | $100 | $14 | $70 | $200 | $550 | $750 | $950 | 2.7924% |
| 18 | Tennessee Ave | Orange | $180 | $90 | $100 | $14 | $70 | $200 | $550 | $750 | $950 | 2.9356% |
| 19 | New York Ave | Orange | $200 | $100 | $100 | $16 | $80 | $220 | $600 | $800 | $1,000 | 3.0852% |
| 21 | Kentucky Ave | Red | $220 | $110 | $150 | $18 | $90 | $250 | $700 | $875 | $1,050 | 2.8358% |
| 23 | Indiana Ave | Red | $220 | $110 | $150 | $18 | $90 | $250 | $700 | $875 | $1,050 | 2.7357% |
| 24 | Illinois Ave | Red | $240 | $120 | $150 | $20 | $100 | $300 | $750 | $925 | $1,100 | **3.1858%** |
| 26 | Atlantic Ave | Yellow | $260 | $130 | $150 | $22 | $110 | $330 | $800 | $975 | $1,150 | 2.7072% |
| 27 | Ventnor Ave | Yellow | $260 | $130 | $150 | $22 | $110 | $330 | $800 | $975 | $1,150 | 2.6789% |
| 29 | Marvin Gardens | Yellow | $280 | $140 | $150 | $24 | $120 | $360 | $850 | $1,025 | $1,200 | 2.5860% |
| 31 | Pacific Ave | Green | $300 | $150 | $200 | $26 | $130 | $390 | $900 | $1,100 | $1,275 | 2.6774% |
| 32 | North Carolina Ave | Green | $300 | $150 | $200 | $26 | $130 | $390 | $900 | $1,100 | $1,275 | 2.6252% |
| 34 | Pennsylvania Ave | Green | $320 | $160 | $200 | $28 | $150 | $450 | $1,000 | $1,200 | $1,400 | 2.5006% |
| 37 | Park Place | Dark Blue | $350 | $175 | $200 | $35 | $175 | $500 | $1,100 | $1,300 | $1,500 | 2.1864% |
| 39 | Boardwalk | Dark Blue | $400 | $200 | $200 | $50 | $200 | $600 | $1,400 | $1,700 | $2,000 | 2.6260% |
| 5 | Reading Railroad | Railroad | $200 | $100 | — | see below | | | | | | 2.9631% |
| 15 | Pennsylvania RR | Railroad | $200 | $100 | — | see below | | | | | | 2.9200% |
| 25 | B&O Railroad | Railroad | $200 | $100 | — | see below | | | | | | 3.0659% |
| 35 | Short Line | Railroad | $200 | $100 | — | see below | | | | | | 2.4326% |
| 12 | Electric Company | Utility | $150 | $75 | — | see below | | | | | | 2.6040% |
| 28 | Water Works | Utility | $150 | $75 | — | see below | | | | | | 2.8074% |

**Railroads** — rent by number owned: **1 → $25, 2 → $50, 3 → $100, 4 → $200.**

**Utilities** — **one owned: 4× the dice roll. Both owned: 10× the dice roll.** Average roll is 7, so one utility averages $28 and two average $70.

Total face value of all 28 deeds: **$5,690**.

### Landing probability by group

The single most important dataset in the game. Use it to price rent futures and to value deeds in the draft.

| Group | Squares | Combined | Per square |
|---|---|---|---|
| **Railroads** | 5, 15, 25, 35 | **11.3816%** | 2.8454% |
| **Orange** | 16, 18, 19 | **8.8132%** | **2.9377%** |
| Red | 21, 23, 24 | 8.7573% | 2.9191% |
| Yellow | 26, 27, 29 | 7.9721% | 2.6574% |
| Green | 31, 32, 34 | 7.8032% | 2.6011% |
| Pink | 11, 13, 14 | 7.5386% | 2.5129% |
| Light Blue | 6, 8, 9 | 6.8834% | 2.2945% |
| Utilities | 12, 28 | 5.4115% | 2.7057% |
| Dark Blue | 37, 39 | 4.8124% | 2.4062% |
| Brown | 1, 3 | 4.2938% | 2.1469% |

All 28 purchasable squares combined: **73.667%**. The other 26.3% is Jail, GO, taxes, card squares and Free Parking.

**Two facts worth internalising:**

**The railroads are the best set on the board.** 11.38% combined beats every colour group. They need no even-build and no trade — a monopoly nobody has to be negotiated into.

**Dark blue is traffic-poor.** Boardwalk at 2.6260% is landed on less often than Kentucky Avenue at 2.8358%, and the group ranks ninth of ten. Boardwalk's rent is enormous; its frequency is not. Correctly priced rent futures on Boardwalk sit well below where instinct puts them.

Jail (6.2195%) is the most-landed square on the board, which is exactly why orange leads all colour groups per square: it sits six to nine squares past Jail, in the middle of the 2d6 distribution.

### Non-property squares

| Square | Name | Landing % |
|---|---|---|
| 10 | Jail / Just Visiting | 6.2195% |
| 0 | Go | 3.0961% |
| 20 | Free Parking | 2.8836% |
| 17 | Community Chest 2 | 2.5945% |
| 33 | Community Chest 3 | 2.3661% |
| 4 | Income Tax | 2.3285% |
| 38 | Luxury Tax | 2.1799% |
| 2 | Community Chest 1 | 1.8849% |
| 22 | Chance 2 | 1.0480% |
| 36 | Chance 3 | 0.8669% |
| 7 | Chance 1 | 0.8650% |
| 30 | Go To Jail | 0.0000% |

Chance squares have low resting probabilities because ten of the sixteen Chance cards move you somewhere else. You draw the card far more often than you rest on the square.

### Ventures

| Venture | Cost | Duration | Effect | Heat |
|---|---|---|---|---|
| Escort Service | $300 | 4 rounds | +40% of all rent you collect, dirty | +2 |
| Numbers Racket | $150 | 6 rounds | +$60 dirty per round | +2 |
| Chop Shop | $250 | 4 rounds | +$150 dirty per opponent landing on any deed you own | +3 |
| Speakeasy | $250 | one-shot | 2d6 on the table below, dirty | +2 |
| Bribery | $200 **dirty only** | instant | Re-roll any one die roll / cancel a card targeting you / delay one of your margin calls a round | +1 |
| Insider trading | $100 clean or dirty | instant | See the top card of the current era deck | +1 |

### Speakeasy payouts

| Roll | Payout | Probability | Contribution to EV |
|---|---|---|---|
| 2 | $0 | 2.8% | $0.00 |
| 3–5 | $100 | 25.0% | $25.00 |
| 6–8 | $250 | 44.4% | $111.11 |
| 9–11 | $500 | 25.0% | $125.00 |
| 12 | $1,200 | 2.8% | $33.33 |
| | | | **$294.44 dirty** |

### Heat, laundering and audits

| Heat | Audit chance per Settlement (round 13+) | Laundering haircut | Audit fine if it hits |
|---|---|---|---|
| 0 | 0% | 25% | $0 |
| 1 | 0% | 25% | $100 |
| 2 | 2.8% | 25% | $200 |
| 3 | 8.3% | 25% | $300 |
| 4 | 16.7% | 30% | $400 |
| 5 | 27.8% | 35% | $500 |
| 6 | 41.7% | 40% | $600 |
| 7 | 58.3% | 45% | $700 |
| 8 | 72.2% | 50% | $800 |
| 9 | 83.3% | 55% | $900 |
| 10 | 91.7% | 60% | $1,000 |
| 11 | 97.2% | 60% | $1,100 |
| 12+ | 100% | 60% | $100 × Heat |

An audit seizes **all** your dirty cash, charges the fine **in clean cash**, and resets your Heat to 0.

### Ratings

```
coverage      = expected pool cashflow / cumulative claim through this tranche
concentration = largest single-obligor share of expected pool cashflow (0..1)
leverage      = cashflow-weighted mean borrower (drawn / base), capped at 5

score = coverage x (1 - 0.25 x concentration) / (1 + 0.10 x leverage)
```

| Score | Rating | | Score | Rating |
|---|---|---|---|---|
| ≥ 2.20 | AAA | | ≥ 0.80 | BB |
| ≥ 1.50 | AA | | ≥ 0.60 | B |
| ≥ 1.20 | A | | < 0.60 | CCC |
| ≥ 1.00 | BBB | | | |

The multiplier `(1 − 0.25 × concentration) / (1 + 0.10 × leverage)` at a glance:

| Concentration → | 0.00 | 0.50 | 1.00 |
|---|---|---|---|
| **Leverage 0** | 1.000 | 0.875 | 0.750 |
| **Leverage 2** | 0.833 | 0.729 | 0.625 |
| **Leverage 3.8** | 0.725 | 0.634 | 0.543 |
| **Leverage 5 (cap)** | 0.667 | 0.583 | 0.500 |

Read across the bottom row: the worst possible pool in the game still only knocks half off the coverage ratio. Coverage is what the rating measures. Everything else is a rounding error, which is the point.

---

## 9. Worked examples

Throughout, "an opponent turn" means one opponent rolling once. Three opponents move each round, so a window of *n* rounds is roughly **3n opponent turns**. The app's own figure runs about 19% higher than this back-of-envelope, because a turn averages 1.19 rolls once doubles are counted, and because it conditions on where the tokens actually are right now. Use the app's number when you have it; use this when you are arguing.

### Example 1 — Pricing a rent future

You own Boardwalk with a hotel on it. Rent is **$2,000**. Someone offers to buy an 8-round future on it, rounds 15 through 22. What is it worth?

```
Landing probability, Boardwalk          2.6260% per roll
Opponent turns in the window            3 opponents x 8 rounds = 24
Expected hits                           24 x 0.026260  =  0.63
Expected value                          0.63 x $2,000  =  $1,260
```

Now the part that matters:

```
Chance of ZERO hits over the window     (1 - 0.026260)^24  =  53%
Chance of exactly one hit                                     34%
Chance of two or more                                         13%

10th percentile outcome        $0
90th percentile outcome        $4,000
```

**Half the time this contract pays absolutely nothing.** Its $1,260 expected value is the average of a coin flip between $0 and $2,000, with a small tail.

Compare New York Avenue, hoteled at $1,000 rent and 3.0852% traffic, over the same window: expected hits 0.74, expected value **$740**, chance of zero **47%**. Boardwalk is worth more, but only 1.7× more despite twice the rent — because it is landed on 15% less often.

**How to use this.** As the seller you want the buyer anchored on "it's Boardwalk." As the buyer you should pay meaningfully under $1,260 for a contract with a 53% chance of paying nothing, unless the variance itself is what you want. And check the encumbrance rules before you buy: if the owner mortgages Boardwalk mid-window, you are owed the contract's remaining expected value immediately, so a mortgage is not the rug-pull it looks like.

**The edge the model cannot see:** the app prices Boardwalk *as it is now*. If you are the owner and you sell this future for $1,100 while sitting on four houses, then hotel the property in round 16, you have sold at a hotel-free price. Nothing stops you. That is the game.

### Example 2 — Structuring and rating a CDO

You hold three peer loan notes. All three were made to Dana, who is running at **3.8× leverage**.

| Note | Principal | Rate | Rounds left | Interest | Total expected cashflow |
|---|---|---|---|---|---|
| A | $600 | 8%/round | 5 | $48 × 5 = $240 | **$840** |
| B | $400 | 10%/round | 4 | $40 × 4 = $160 | **$560** |
| C | $500 | 6%/round | 6 | $30 × 6 = $180 | **$680** |
| | | | | | **Pool: $2,080** |

You cut it: **Senior $700, Mezzanine $600, Equity the residual.** Senior + Mezzanine = $1,300, comfortably under the $2,080 cap.

The inputs: concentration is **1.00** (every dollar comes from Dana). Leverage is **3.8**. The multiplier is `(1 − 0.25) / (1 + 0.38)` = `0.75 / 1.38` = **0.5435**.

```
SENIOR      coverage = 2,080 / 700   = 2.971
            score    = 2.971 x 0.5435 = 1.615   ->  AA

MEZZANINE   coverage = 2,080 / 1,300 = 1.600
            score    = 1.600 x 0.5435 = 0.870   ->  BB
```

**Your senior slice is rated AA and every dollar behind it depends on one over-levered player.** The rating is correct arithmetic. It is also useless, and the app tells anyone who looks: right next to "AA" it prints *concentration 1.00, weighted leverage 3.8*. Sell to whoever reads the letter and not the line beneath it.

**What the same structure looks like diversified.** Identical cashflows, three different borrowers, concentration 0.40, weighted leverage 1.2 — multiplier `0.90 / 1.12` = 0.804:

| Tranche | Coverage | Concentrated pool | Diversified pool |
|---|---|---|---|
| Senior $700 | 2.971 | 1.615 → **AA** | 2.388 → **AAA** |
| Mezzanine $600 | 1.600 | 0.870 → **BB** | 1.286 → **A** |

One rating notch on the senior, two on the mezzanine. Diversification is worth less here than it should be. That is deliberate.

**Now run the waterfall.** Dana pays interest for three Settlements — $48 + $40 + $30 = **$118 per round** — then defaults in the fourth.

```
Round 1   pool collects $118   ->  Senior.  Senior remaining face: $582
Round 2   pool collects $118   ->  Senior.  Senior remaining face: $464
Round 3   pool collects $118   ->  Senior.  Senior remaining face: $346
Round 4   Dana defaults on all three notes simultaneously.
          Collateral transfers, remaining balances written off.

FINAL     Senior received $354 of $700.   Mezzanine: $0.   Equity: $0.
```

At the end of round 24 the pool terminates with the Senior short of its face. **That is a credit event.** Any CDS written on this Senior tranche now pays its notional — capped at $700 — from the seller to the buyer. The seller had to post 30% of that notional, $210, against their borrowing base from the day they wrote it; that collateral does not cover the loss.

Whoever bought your AA senior tranche for something near $620 has recovered $354. Whoever bought protection on it for $40 a Settlement has done rather better.

### Example 3 — Does a venture pay off?

You are Riley. You own St. James, Tennessee and New York Avenue (the full orange group, **all hoteled**), three railroads, and Water Works. Seven deeds. It is round 9.

Your expected rent per opponent turn:

| Deed | Rent | Landing % | Expected rent per opponent turn |
|---|---|---|---|
| St. James (hotel) | $950 | 2.7924% | $26.53 |
| Tennessee (hotel) | $950 | 2.9356% | $27.89 |
| New York (hotel) | $1,000 | 3.0852% | $30.85 |
| 3 railroads | $100 each | 8.9490% combined | $8.95 |
| Water Works | 4× dice ≈ $28 | 2.8074% | $0.79 |
| | | | **$95.01 per opponent turn** |

Three opponents move each round, so you expect about **$285 of rent per round.**

**Escort Service — $300, 4 rounds, +40% of rent, +2 Heat**

```
Expected rent over 4 rounds     $285 x 4        = $1,140
Escort pays 40%                                 =   $456 dirty
Launder at Heat 2 (25% haircut)                 =   $342 clean
Cost                                            =  -$300
NET                                             =   +$42 clean, and you are at Heat 3
```

Forty-two dollars, and you enter the audit era at Heat 3 for an 8.3% check every Settlement. This is the *good* case: Escort scales with rent, and you have the best rent position at the table. A player without a hoteled monopoly loses money on it outright.

**Numbers Racket — $150, 6 rounds, $60/round, +2 Heat**

```
$60 x 6 rounds                                  =   $360 dirty
Launder at Heat 2                               =   $270 clean
Cost                                            =  -$150
NET                                             =  +$120 clean
```

Three times the return of Escort Service, on a quarter of the position, for a player who owns nothing at all. Numbers Racket does not care what you own. It is the only venture with a reliably positive return, and it is also the boring one.

**Chop Shop — $250, 4 rounds, $150 per opponent landing on any deed you own, +3 Heat**

Riley's total traffic across all seven deeds is 8.8132% + 8.9490% + 2.8074% = **20.57% per opponent turn**.

```
Expected landings, 12 opponent turns   12 x 0.2057   =  2.47
Payout                                 2.47 x $150   =   $370 dirty
Launder at Heat 3                                    =   $278 clean
Cost                                                 =  -$250
NET                                                  =   +$28 clean, at Heat 4
```

**Speakeasy — $250 one-shot, +2 Heat**

```
Expected payout    $294 dirty
Laundered at 25%   $221 clean   against a $250 cost   ->  -$29 expected
```

And 27.8% of the time you roll 5 or under and take $100 or nothing.

**What this tells you.** After the laundering haircut, three of the four ventures roughly clear their own cost. **You do not launch a venture for the clean money.** You launch it because bribery can only be paid in dirty cash, because dirty cash is invisible to every opponent reading your net worth, and — if you are running Escort — because it is a leveraged bet on a board position you already have. The correct venture strategy is often to run Numbers Racket in Era II, launder twice, and be at Heat 0 by round 13.

### Example 4 — Reading a margin call

Round 14, Era III, rate 8%. You hold:

| Holding | Face value |
|---|---|
| St. James, Tennessee, New York (orange, hoteled) | $560 |
| Three railroads | $600 |
| Water Works | $150 |
| **Total deed face** | **$1,310** |
| Building cost: 3 hotels at $500 each | $1,500 |

```
BORROWING BASE = 50% x $1,310  +  25% x $1,500
               =     $655      +      $375        =  $1,030

DRAWN                                                 $950
HEADROOM                                               $80
Interest charged this Settlement:  8% x $950     =     $76
```

You are fine, but only just. You need cash, so in the Open phase you **mortgage New York Avenue** for $100.

```
NEW BASE = 50% x ($1,310 - $200)  +  25% x $1,500
         =        $555            +      $375        =  $930

DRAWN                                                    $950
                                                  MARGIN CALL
                                             short by      $20
```

**You raised $100 and lost $100 of borrowing base, which cost you $20 of headroom you did not have.** You also stopped collecting rent on your highest-traffic deed. The app warns you before you confirm the mortgage. Read the warning.

**Curing it.** You have until the end of the next Open phase. Any of these work:

- repay **$20** of drawn balance
- unmortgage New York Avenue for **$110** (55% of face), which restores $100 of base
- sell or trade anything that raises your base by $20
- pay a **$200 bribe in dirty cash** to delay the call by one round, which solves nothing but buys a round

**Not curing it.** The app force-liquidates. Deeds go in descending face-value order, so a **$200 railroad** goes first, offered to the other three players at a floor of **70% of face = $140**. If nobody bids, the bank takes it at $140.

```
AFTER LIQUIDATION
Drawn        $950 - $140                                        =  $810
New base     50% x ($1,310 - $200 mortgaged - $200 sold) + $375  =  $830

$810 <= $830.  Position cured.  Liquidation stops.
```

You lost a railroad worth 2.96% of every roll for the remaining ten rounds, in order to avoid finding $20. The railroad is gone from the game — it is not re-drafted and nobody else gets to own it, unless one of them bid for it.

### Example 5 — When you cannot pay

Round 17. You land on an opponent's hoteled Boardwalk. **Rent: $2,000.** You have $180 in clean cash.

The app works down the list:

```
Clean cash                                              $180
Draw remaining credit  (base $930, drawn $810)         +$120   ->  $300
Mortgage everything mortgageable  (50% of $910 face)   +$455   ->  $755

STILL OWED                                                        $1,245
```

That $1,245 becomes **Distressed Debt**. Here is what it does over the seven Settlements from round 18 to round 24, at 15% a round:

| End of round | Distressed debt |
|---|---|
| 18 | $1,432 |
| 19 | $1,647 |
| 20 | $1,894 |
| 21 | $2,178 |
| 22 | $2,505 |
| 23 | $2,881 |
| **24** | **$3,312** |

A $1,245 shortfall in round 17 subtracts **$3,312** from your final net worth. Compounding at 15% is not a slap on the wrist; it is roughly the value of a full colour group.

**What does not happen:** you are not eliminated. You do not sit out. You take every phase normally, you collect rent, you trade, you originate contracts, you can still win — the math is just savage. Every clean dollar you can find between now and round 24 is worth 15% a round more than it looks, because it is the highest-interest liability on the board by a wide margin.

**What you should actually do.** Everything on this list beats carrying the debt: sell rent futures on your remaining unmortgaged deeds; sell a deed to another player at a negotiated price rather than at the 70% liquidation floor; borrow from a player at any rate under 15% per round, which is every rate any sane lender would offer; sell a loan note or a tranche you hold. Distressed debt at 15% is the most expensive money in the game. It exists so that going broke is a wound rather than an exit, and it is priced accordingly.

**And the thing nobody thinks of until round 22:** if you are the opponent who owns that hoteled Boardwalk, a player who cannot pay you is a player whose loan note now marks at 40% of principal in your own net worth. Bankrupting the table is not obviously good for you.
