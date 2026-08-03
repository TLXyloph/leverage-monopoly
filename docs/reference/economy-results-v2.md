# Carrying cost (property tax) - structural test

Monte Carlo, **4,000 trials per configuration**, same validated engine as v1.  All configurations build on the v1 recommendation: **$2,500 start, Era II stimulus as an interest-bearing loan**, with the GO salary varying as noted.

Money conservation and player-pool ledger reconciliation pass in **92,000/92,000** trials - i.e. every trial of every configuration below.

---

## Headline

**A carrying cost is the right instrument, but not in the form proposed.** Charged as a percentage of portfolio value it does create the borrowing demand you want - and it also does both of the things you asked me to watch for.  Two changes fix it:

1. **Levy a flat amount per unmortgaged deed, not a percentage of portfolio value.**  The ad-valorem version inverts the draft; the per-deed version is draft-neutral at identical revenue.
2. **Raise the borrowing base.**  Peak table debt is currently capped by arithmetic, not behaviour: 50% of $5,690 of deed face is $2,845, so the top half of your $2,000-$5,000 target is unreachable no matter how hard you squeeze.

One thing I could not deliver: **the money supply does not stabilise.**  Debt volume and a stable cash stock are in direct opposition here, and the honest answer is that you have to pick a point on that frontier.  Section 6 lays it out.  My recommendation deliberately lands on mild deflation rather than stability, and argues that is the better choice.

---

## 1. The requested sweep: % of (deed face + building cost), from round 1

Baseline is the v1 recommendation with GO salary $150.

| rate | median floor | median r24 | player-rds <$200 | P(credit) | mean peak debt | p90 peak debt | P(bust) | P(liquidation) | Treasury r24 | money supply | houses built | top-draft win% |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0% (v1 baseline) | $792 | $792 | 0.6% | 44% | $799 | $1,505 | 2.8% | 11% | $3,516 | +3% | 19.5 | 28% |
| 1% | $637 | $637 | 0.9% | 69% | $1,196 | $1,942 | 2.3% | 14% | $5,494 | -24% | 14.7 | 22% |
| 2% | $468 | $468 | 2.4% | 96% | $1,863 | $2,571 | 1.9% | 38% | $7,540 | -47% | 10.2 | 19% |
| 3% | $203 | $203 | 7.5% | 100% | $2,508 | $3,019 | 4.5% | 85% | $9,622 | -68% | 7.0 | 18% |
| 4% | $75 | $75 | 16.6% | 100% | $2,819 | $3,037 | 20.4% | 100% | $11,441 | -85% | 4.6 | 16% |

What this says, against your stated targets:

- **1%** is too weak: peak debt $1,196, still well under target.
- **2%** gets credit used in 96% of games at 1.9% bankruptcy, but peak debt is only $1,863.
- **3%** reaches $2,508 peak debt and 100% credit usage at 4.5% bankruptcy - but 85% of games now involve forced liquidation and the median player ends the game on $203.
- **4% breaks the bankruptcy ceiling**: 20.4%, twice your 10% limit, with 100% of games hitting forced liquidation.  Rejected regardless of its debt numbers.

So on the literal sweep, **3% is the only rate that reaches the debt target while staying inside the bankruptcy ceiling** - and it does so with side effects that show up next.

## 2. Both of the things you asked me to watch for do happen

### 2a. Development collapses

| rate | houses built (total) | on board r6 | r12 | r18 | r24 | vs 0% baseline |
|---|---|---|---|---|---|---|
| 0% | 19.5 | 1.1 | 8.2 | 15.1 | 19.1 | +0% |
| 1% | 14.7 | 1.0 | 7.3 | 12.1 | 14.2 | -25% |
| 2% | 10.2 | 0.8 | 6.1 | 8.9 | 9.5 | -48% |
| 3% | 7.0 | 0.6 | 4.7 | 6.2 | 5.1 | -64% |
| 4% | 4.6 | 0.5 | 3.4 | 4.1 | 1.9 | -76% |

At 3% the board carries 5.1 houses at round 24 against 19.1 with no levy - development is down 64%.  That flattens the rent curve, which is exactly the hollowing-out of the futures market you were worried about.  Note this is the *mechanical* effect only (less cash, so less building).  My build heuristic is not tax-aware; a human player who reasons about carrying cost would under-build even further, so **this understates the problem**.

Excluding building cost from the tax base recovers part of it:

| tax base | houses built | mean peak debt | P(credit) | P(bust) | top-draft win% |
|---|---|---|---|---|---|
| 2% on deeds + buildings | 10.2 | $1,863 | 96% | 1.9% | 19% |
| 2% on deeds only | 10.7 | $1,780 | 95% | 2.5% | 20% |
| 3% on deeds + buildings | 7.0 | $2,508 | 100% | 4.5% | 18% |
| 3% on deeds only | 7.3 | $2,444 | 100% | 4.8% | 19% |

**Recommendation: exclude buildings from the base regardless of which levy form you pick.**  It costs almost nothing in debt volume and removes a direct disincentive to develop.

### 2b. The ad-valorem levy inverts the draft

Measured two ways: the rank correlation between a player's draft portfolio face value and their final net worth, and how often the player who won the most valuable portfolio finishes first.  **With four players the neutral baseline is 25%.**

| rate | rank corr (draft value vs final net worth) | top-draft player wins | bottom-draft player wins | mean net worth, top-draft | mean net worth, bottom-draft |
|---|---|---|---|---|---|
| 0% (no levy) | -0.02 | 28% | 25% | $2,668 | $2,579 |
| 1% | -0.10 | 22% | 30% | $2,078 | $2,181 |
| 2% | -0.15 | 19% | 34% | $1,499 | $1,736 |
| 3% | -0.18 | 18% | 37% | $944 | $1,251 |
| 4% | -0.21 | 16% | 38% | $487 | $787 |

With no levy the best draft portfolio wins 28% of the time - above the 25% baseline, as it should be.  At 3% it wins 18% and at 4% 16%: **winning the draft becomes actively bad.**  Mean net worth of the top-draft player falls below the bottom-draft player at every non-zero rate.

The cause is structural, not a tuning problem.  Because the design keeps monopolies rare, expensive deeds do not earn proportionally more rent - base rents dominate.  A levy proportional to face value therefore charges the most for the assets that earn the least, which makes an expensive portfolio a pure liability.  **No rate fixes this, because the incidence is wrong.**

## 3. Fix: a flat levy per unmortgaged deed

Since the draft gives everyone exactly 7 deeds, a flat per-deed charge is revenue-equivalent but incidence-neutral.  It also keeps a real strategic lever - mortgaging a deed removes it from your bill.

Same-revenue comparison.  Mean portfolio face is ~$1,422, so $8/deed x 7 deeds = $56/round is equivalent to roughly 4% ad valorem.  Both rows below use GO $350 and the raised borrowing base:

| metric (GO $350, raised base) | 4% ad valorem | $8 per deed |
|---|---|---|
| Mean peak table debt | $2,216 | $2,142 |
| P(credit drawn) | 94% | 93% |
| P(bankruptcy) | 4.5% | 4.8% |
| Houses built | 15.0 | 15.2 |
| Rank corr (draft value vs net worth) | -0.17 | -0.06 |
| **Top-draft player wins** | **20%** | **24%** |
| Money supply | -29% | -29% |

Identical pressure, identical debt volume - and the draft inversion essentially disappears (20% -> 24%, against a 25% neutral baseline; a trace remains because mortgaging and trading still move deed counts around).  This is the single most important change in this document.

## 4. The debt ceiling is arithmetic, not behaviour

Your target of $2,000-$5,000 peak table debt cannot be reached in its upper half under the current borrowing-base rule:

```
  max table credit = 50% x $5,690 of deed face  = $2,845
                   + 25% x building cost (small, and shrinks under a levy)
```

That is why the ad-valorem sweep saturates: 3% reaches $2,508 and 4% reaches $2,819 - both pressing against the cap, with 4% buying nothing but bankruptcies.  Mortgaging makes it worse, since mortgaged deeds leave the base.

Raising the base to **75% of unmortgaged deed face + 50% of building cost** unlocks the target range:

| 3% deeds-only levy | base 50%/25% | base 75%/50% |
|---|---|---|
| Mean peak table debt | $2,444 | $3,383 |
| p90 peak table debt | $2,995 | $4,275 |
| P(credit drawn) | 100% | 100% |
| P(forced liquidation) | 81% | 63% |
| P(bankruptcy) | 4.8% | 5.0% |

Raising the base *reduces* forced liquidation and bankruptcy while *increasing* debt volume - players can borrow through a shock instead of being forced to mortgage into a spiral.  For a design whose Era III layer securitizes peer loans, this is close to free.

## 5. Timing: round 1 vs round 7

Tested at the finalist ($8/deed, GO $350, raised base):

| start | median floor | P(credit) | mean peak debt | p90 peak debt | P(bust) | P(liquidation) | money supply | houses | Treasury r24 |
|---|---|---|---|---|---|---|---|---|---|
| from round 1 | $594 | 93% | $2,142 | $3,360 | 4.8% | 32% | -29% | 15.2 | $6,612 |
| from round 4 | $666 | 82% | $1,580 | $2,851 | 4.2% | 20% | -17% | 17.5 | $5,296 |
| from round 7 (Era II) | $740 | 72% | $1,157 | $2,460 | 4.2% | 15% | -4% | 19.7 | $4,125 |

**Round 1 wins, and it is not close on the metric you care about.**  A six-round grace period lets players bank cash that the levy then never catches up with: peak debt falls $2,142 -> $1,157 and credit usage 93% -> 72%.  It also leaves Era I with no pressure at all, which is the half of the game that currently has the most.

**Round 4 is a genuine compromise** if the learning-curve concern is real: it keeps development highest (17.5 houses), holds the money supply at -17%, and still gets credit used in 82% of games - but peak debt of $1,580 falls short of your $2,000 floor.  If you want a grace period, take round 4 and accept slightly thinner loan volume; do not take round 7.

## 6. The frontier: debt volume vs a stable money supply

This is the trade-off I cannot design around, so here it is explicitly.  All rows: $2,500 start, per-deed levy, raised base, stimulus as loan, levy from round 1.  Salary is raised alongside the levy to recycle Treasury revenue back to players.

| configuration | median floor | player-rds <$200 | P(credit) | mean peak debt | p90 peak debt | P(bust) | P(liq) | money supply | houses | top-draft win% |
|---|---|---|---|---|---|---|---|---|---|---|
| $5/deed, GO $250 | $634 | 0.7% | 82% | $1,706 | $2,860 | 2.8% | 15% | -24% | 15.1 | 25% |
| $7/deed, GO $300 | $580 | 1.3% | 93% | $2,140 | $3,309 | 4.2% | 27% | -31% | 14.3 | 24% |
| $7/deed, GO $400 | $738 | 0.8% | 75% | $1,437 | $2,579 | 3.5% | 17% | -4% | 19.0 | 26% |
| **$8/deed, GO $350  (recommended)** | $594 | 1.6% | 93% | $2,142 | $3,360 | 4.8% | 32% | -29% | 15.2 | 24% |
| $9/deed, GO $400 | $607 | 1.8% | 94% | $2,146 | $3,380 | 5.9% | 37% | -26% | 16.1 | 25% |
| $10/deed, GO $450 | $621 | 2.1% | 94% | $2,178 | $3,431 | 7.9% | 42% | -24% | 16.9 | 25% |
| $12/deed, GO $500 | $553 | 3.7% | 98% | $2,600 | $3,849 | 14.8% | 61% | -32% | 16.4 | 25% |

The shape of it: **cash scarcity is what creates borrowing, and cash scarcity is deflation.**  They are the same variable viewed twice.  Recycling revenue through a larger GO salary moves you up and to the left - more stable money, less debt - and pushing the levy harder to compensate runs into the bankruptcy ceiling, because a flat levy is regressive and falls hardest on whoever is already having a bad run ($12/deed: 14.8% bankruptcy).

The money-supply-neutral point is **$7/deed with GO $400** (-4% money supply) - but peak debt there is $1,437 and credit is used in 75% of games, both short of target.

**I recommend against targeting a flat money supply.**  Your original complaint about v1 was +27% inflation, and the real problem with that was not the number - it was that liquidity pressure *decreased* over the game while the interest curve escalated 5% -> 12%.  Mild deflation fixes the direction: pressure builds as rates rise, and Era IV is genuinely the squeeze the rate schedule implies.  What you want to avoid is the -68% of the aggressive ad-valorem settings, where the endgame has no cash at all.

## 7. Recommended configuration

```
  Players                     4
  Rounds                      24
  Starting budget             $2,500   (unified; draft is paid from it)
  Draft                       unchanged - 7 deeds each, 8-12 contested
                              at 25-60% premium, proceeds to Treasury
  GO salary                   $350     (raised from $200 to recycle levy revenue)
  Era II stimulus (round 7)   $300, issued as an interest-bearing LOAN
  Carrying cost               $8 per unmortgaged deed per round,
                              from round 1, buildings NOT taxed,
                              paid to the Treasury
  Credit borrowing base       75% of unmortgaged deed face
                              + 50% of building cost
  Interest (unchanged)        5% / 6% / 8% / 12% by era, to Treasury
```

Against every target you set:

| metric | value | your target | verdict |
|---|---|---|---|
| Mean peak table debt | $2,142 | $2,000-$5,000 | PASS |
| p90 peak table debt | $3,360 | - | - |
| Credit drawn | 93% of games | large majority | PASS |
| Bankruptcy | 4.8% | under 10% | PASS |
| Per-player bankruptcy | 1.3% | - | - |
| Forced liquidation | 32% of games | - | - |
| Median cash floor | $594 | not near zero | PASS |
| Player-rounds under $200 | 1.6% | pressure not grind | PASS |
| Money supply r0 -> r24 | -29% | stabilise | **MISS - see s.6** |
| Houses built | 15.2 vs 19.5 at 0% | board keeps developing | PARTIAL |
| Top-draft player wins | 24% | 25% = neutral | PASS |
| Treasury at r24 | $6,612 | solvent | PASS |

Median player cash and Treasury by round under the recommendation:

| round | cash p10 | cash median | cash p90 | table cash | Treasury | mean table debt | houses on board |
|---|---|---|---|---|---|---|---|
| 0 | $750 | $870 | $1,030 | $3,518 | $6,482 | 0 | 0.0 |
| 2 | $605 | $758 | $973 | $3,074 | $6,886 | 0 | 0.0 |
| 4 | $498 | $708 | $1,032 | $2,925 | $7,013 | 3 | 0.1 |
| 6 | $495 | $786 | $1,086 | $3,176 | $6,667 | 13 | 0.8 |
| 8 | $666 | $921 | $1,127 | $3,654 | $5,644 | 218 | 2.6 |
| 10 | $584 | $843 | $1,131 | $3,407 | $5,625 | 200 | 4.6 |
| 12 | $525 | $786 | $1,116 | $3,215 | $5,618 | 202 | 6.5 |
| 14 | $469 | $725 | $1,109 | $3,021 | $5,674 | 220 | 8.2 |
| 16 | $434 | $693 | $1,099 | $2,934 | $5,706 | 253 | 9.9 |
| 18 | $408 | $669 | $1,083 | $2,822 | $5,817 | 304 | 11.6 |
| 20 | $367 | $642 | $1,077 | $2,708 | $6,001 | 372 | 12.9 |
| 22 | $316 | $620 | $1,090 | $2,612 | $6,279 | 451 | 13.9 |
| 24 | $125 | $594 | $1,123 | $2,503 | $6,612 | 526 | 14.4 |

The median player runs down from $870 to about $594 and holds there - working capital stays positive and usable all game (only 1.6% of player-rounds under $200), but never comfortable.  Debt builds steadily rather than spiking, which is the profile you want for pooling loans into tranches.

## 8. Does it still work past round 24?

You flagged that the v1 configuration broke around round 35.  I re-ran both configurations at 36 rounds.  **The answer splits: the Treasury is fixed, the players are not.**

| 36-round run | v1 rec (no levy) | v2 rec (with levy) |
|---|---|---|
| Treasury at r24 | $3,516 | $6,612 |
| Treasury at r30 | $3,378 | $7,889 |
| Treasury at r36 | $3,402 | $8,972 |
| Treasury p10 at r36 | $1,741 | $6,269 |
| P(Treasury runs dry) | 0.0% | 0.0% |
| Median cash at r36 | $752 | $170 |
| **P(>=1 bankruptcy) by r36** | **43.2%** | **82.2%** |

**Treasury: solved.**  The carrying cost converts it from a decumulating pot into an accumulating one - under v1 it drains to $3,402 by round 36, under v2 it rises to $8,972.  The round-35 insolvency cliff is gone.

**Player solvency: worse, badly.**  Bankruptcy over a 36-round game is 43% under v1 and 82% under v2.  I flagged this because it changes the answer to your question: the game is *not* extensible past 24 rounds as configured, and the levy makes that worse rather than better.

The cause is the interest schedule, not the levy.  Era IV charges **12% per round**, and the tier is open-ended - a 24-round game spends 6 rounds there, a 36-round game spends 18.  Debt carried into the endgame roughly doubles every six rounds at that rate, and a levy that keeps players permanently borrowed hands the compounding something to work on.  Within 24 rounds this is fine (4.8% bankruptcy); beyond it, it is not.

So: **24 rounds is not an arbitrary length, it is close to the maximum this rate curve supports.**  If you ever want a longer format, the levy is not what needs changing - cap Era IV at 8-10%, or add a restructuring or debt-forgiveness beat, and re-test.  I would also give the Treasury a spending mechanism at that point (an Era IV public-works auction, a dividend, or rebating a share of interest), because past round 24 its accumulating balance *is* the deflation.

## 9. Honest caveats

- **Development still takes a real hit.**  15.2 houses vs 19.5 with no levy, a 22% reduction, even with buildings excluded from the tax base - purely because players hold less cash.  And my builder is not tax-aware, so a thinking player would build less still.  If the futures market depends on rent escalation, consider pairing this with a *building subsidy* or a reduced house price rather than accepting the fall.
- **The flat levy is regressive by construction.**  It is draft-neutral, which is what you asked for, but it falls hardest on whoever is losing. That is why bankruptcy climbs steeply above $9/deed (7.9% at $10, 14.8% at $12).  $8 leaves real headroom under your 10% ceiling; do not drift upward without re-testing.
- **The GO salary jump from $200 to $350 is large** and changes the feel of passing GO.  It is doing real work - recycling levy revenue so the money supply does not collapse - but if $350 is unpalatable, $8/deed with GO $300 also works ($2,140 peak debt at 4.2% bankruptcy) at the cost of deeper deflation.
- **Peak debt is measured on end-of-round snapshots**, after players have repaid.  Intra-round peaks are higher, so loan volume available to securitize is if anything understated.
- Everything else - draft model, rare monopolies, cash-neutral trades, defensive credit heuristic - is unchanged from v1 and carries the same caveats.

