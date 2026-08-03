# v3 - development subsidy and venture inflation

Monte Carlo, **3,000 trials per configuration**, same engine as v1/v2 with three corrections described below.  Money conservation, player-pool reconciliation and (new) dirty-cash conservation pass in every trial of every configuration.

---

## Headline

**Item 1 - the development problem is roughly a third the size I reported, because two of my modelling assumptions were wrong.** Correcting them moves the baseline from 15.2 houses to **17.0**, against a levy-free control of **19.6** - a **13% suppression, not 22%**.  A subsidy is still worth applying, but a small one: house costs **-10% game-wide** reaches 18.7 houses and closes about 65% of the remaining gap with no measurable cost to credit pressure.

**Item 2 - the underworld is not inflationary and not a tax on non-participation.  It is a knowledge trap.**  Played correctly it is worth **+75** in net worth against abstainers; played naively it costs **$-1,215**.  The spread between those two is the whole story, and it comes from three of the four ventures being dead or actively bad.

---

## 1. Three corrections to the model

### 1a. The builder is now levy-aware (as you asked)

It now (i) sizes its cash buffer to recurring burn - carrying cost plus interest - rather than a flat $700, and (ii) applies a payback test, developing a colour group only if the remaining rent uplift over the rounds left exceeds the cash cost.  Rent uplift is computed from **per-square landing probabilities measured from this engine over 1,000,000 turns**, so the builder correctly prefers the oranges (p=0.032-0.034 per opponent turn) over the dark blues (p=0.024-0.030).

### 1b. I had the bankruptcy rule wrong, and it mattered

v1 and v2 modelled insolvency as elimination.  **Spec section 5 says there is no elimination**: the shortfall becomes Distressed Debt at 15% per round, subtracted from net worth, and the player continues to act normally.  Forced liquidation also sells deeds at **70% of face**, not a 50% mortgage.  Both changes make insolvency far less catastrophic, which in turn makes building far less risky.  All v3 figures use the spec rule; "P(distress)" below is the fraction of games in which at least one player takes on any Distressed Debt - it is *not* elimination.

### 1c. Building aggression is not a free parameter - it is an equilibrium

How much cash a player keeps back before building drives the whole development answer, so I stopped assuming it and measured it.  Two players at one policy against two at another, same table, same dice:

| cash-buffer offset A vs B | mean net worth A | mean net worth B | win rate A | win rate B | winner |
|---|---|---|---|---|---|
| 0.0 vs 0.25 | $1,645 | $1,828 | 45% | 55% | more aggressive |
| 0.25 vs 0.5 | $1,492 | $1,656 | 46% | 54% | more aggressive |
| 0.5 vs 0.75 | $1,435 | $1,525 | 48% | 52% | more aggressive |
| 0.75 vs 1.0 | $1,419 | $1,483 | 49% | 51% | more aggressive |

Aggressive building wins at every step, with the advantage flattening out around 0.75.  Under the spec's own scoring rule this is unsurprising: net worth counts buildings at **full cost**, so building converts cash into an asset scored at par *and* earns rent.  Players will therefore build aggressively, and the honest baseline is the equilibrium, not a cautious heuristic.

| buffer offset | houses | rent | peak debt | P(credit) | P(distress) | per-player | mean distressed bal | money supply | median floor |
|---|---|---|---|---|---|---|---|---|---|
| 0.0 | 9.4 | $2,192 | $1,935 | 91% | 2% | 1% | $536 | -19% | $661 |
| 0.25 | 13.7 | $2,800 | $2,556 | 96% | 8% | 2% | $804 | -24% | $609 |
| 0.5 | 16.2 | $3,262 | $2,915 | 97% | 16% | 5% | $952 | -29% | $555 |
| 0.75 | 17.0 | $3,385 | $3,012 | 97% | 18% | 5% | $939 | -30% | $546 |
| 1.0 | 17.4 | $3,449 | $3,057 | 97% | 20% | 6% | $950 | -30% | $539 |

**All v3 results below use offset 0.75**, the equilibrium.  Note what this does to the v2 numbers: peak table debt at equilibrium is **3,012**, not the $2,142 v2 predicted, and credit is drawn in **97%** of games.  Your $2,100 debt target is comfortably exceeded and the $2,000-$5,000 band is met on the mean, not just the p90.

## 2. The corrected development baseline

| builder model | houses built | rent over game | peak debt | P(distress) |
|---|---|---|---|---|
| simple (v1/v2 heuristic) | 15.3 | $2,316 | $2,142 | 2% |
| aware, conservative (0.0) | 9.4 | $2,192 | $1,935 | 2% |
| aware, at equilibrium (0.75) | 17.0 | $3,385 | $3,012 | 18% |

So the suppression figure moves as follows.  Against a levy-free control run at the same salary and the same builder (19.6 houses):

| model | houses (levy vs no levy) | suppression |
|---|---|---|
| v2 reported (simple builder, mismatched control) | 15.2 vs 19.5 | -22% |
| levy-aware but conservative buffer | 9.4 vs 19.6 | -52% |
| **levy-aware at equilibrium (correct)** | **17.0 vs 19.6** | **-13%** |

Your instinct that my builder understated the effect was right in direction for the *cautious* builder - it drops development to 9.4 houses.  But that policy is dominated: a player following it loses.  Once players build the way the scoring rule rewards, most of the suppression disappears.

## 3. Remedies

| remedy | houses | rent | peak debt | P(credit) | P(distress) | money supply | median floor | top-draft win% | early-mono win% | late-mono win% | early-mono net worth edge |
|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline (no remedy) | 17.0 | $3,385 | $3,012 | 97% | 18% | -30% | $546 | 29% | 32% | 22% | +13% |
| control: levy removed | 19.6 | $3,890 | $794 | 48% | 4% | +85% | $859 | 35% | 38% | 22% | +15% |
| (a) houses -10% | 18.7 | $3,503 | $2,976 | 97% | 19% | -27% | $558 | 30% | 34% | 22% | +20% |
| (a) houses -20% | 20.4 | $3,610 | $2,920 | 97% | 19% | -24% | $577 | 31% | 35% | 22% | +26% |
| (a) houses -30% | 21.5 | $3,703 | $2,826 | 97% | 19% | -21% | $600 | 32% | 37% | 23% | +31% |
| (b) -20%, Eras I-II only | 18.6 | $3,502 | $2,953 | 97% | 18% | -27% | $560 | 31% | 35% | 21% | +29% |
| (c) first house half price | 18.3 | $3,489 | $2,953 | 97% | 18% | -27% | $560 | 30% | 34% | 22% | +18% |
| (d) buildings 75% of base | 17.5 | $3,498 | $3,230 | 97% | 20% | -29% | $558 | 30% | 32% | 22% | +14% |
| (e) -10% + first-house-half | 19.5 | $3,578 | $2,903 | 97% | 18% | -25% | $576 | 31% | 35% | 22% | +24% |
| (e) -20% + buildings 75% | 20.8 | $3,691 | $3,112 | 97% | 20% | -24% | $590 | 31% | 35% | 22% | +27% |

Reading it:

- **(a) price cuts work, roughly linearly**: about **+1.5 houses per 10% cut**.  -10% reaches 18.7, -20% reaches 20.4, -30% reaches 21.5.
- **(b) restricting the discount to Eras I-II is strictly worse than (a) at the same rate** (18.6 vs 20.4 houses) for more rules complexity.  Not worth it.
- **(c) first-house-half is a clean, cheap lever**: 18.3 houses, close to a flat -10%, and it targets the hard step - starting a group - rather than cheapening the whole build-out.
- **(d) buildings at 75% of the borrowing base barely touches development** (17.5 vs 17.0).  It is not a development lever.  It *is* a debt lever - peak debt rises to 3,230 - so keep it in your pocket for the securitization layer, not for this problem.

### The exchange rate you asked for

**Development is cheap in credit-pressure terms and expensive in fairness terms.**  Across the whole subsidy range, credit usage stays at 97%, peak debt moves less than 10%, and distress barely moves.  What does move is who wins:

| subsidy | houses | early-monopoly win rate | early-mono net worth edge | money supply | P(credit) |
|---|---|---|---|---|---|
| 0% (baseline) | 17.0 | 32% | +13% | -30% | 97% |
| (a) houses -10% | 18.7 | 34% | +20% | -27% | 97% |
| (a) houses -20% | 20.4 | 35% | +26% | -24% | 97% |
| (a) houses -30% | 21.5 | 37% | +31% | -21% | 97% |

**Per 10% of house-price cut: +1.5 houses, +1.5pp early-monopoly win rate, +3pp money supply, and no measurable change in credit pressure.**  So yes - cheaper houses do reward whoever completes a monopoly first, exactly as you suspected.  The early-monopoly net-worth edge widens from +13% at baseline to +31% at -30%.  That argues for the smallest dose that does the job.

## 4. Item 2 - the underworld

Modelled per spec sections 10 and 12: the four ventures with their costs, durations, Heat and payouts; Escort paying 40% of rent collected and Chop Shop $150 per opponent landing; the Speakeasy 2d6 table; Heat accrual and decay; the 2d6 audit check from round 13; the 25% laundering haircut worsening 5pp per Heat point above 3, capped at 60%; seizure and the $100 x Heat fine; and dirty cash scoring zero.  Venture costs and fines flow to the Treasury.  **Dirty cash is tracked as a second currency with its own conservation law**, verified in every trial.

Two players run ventures, two abstain, at the same table on the same dice - so the comparison is like-for-like.

| player sophistication | net worth, vice players | net worth, abstainers | **edge** | net clean money created | audits/game | fines paid | money supply | venture mix |
|---|---|---|---|---|---|---|---|---|
| naive - ignores the Heat cost | $502 | $1,717 | $-1,215 | $-885 | 2.24 | $1,129 | -41% | numb 51%  chop 49% |
| disciplined but diversifies | $1,102 | $1,631 | $-530 | $-225 | 1.08 | $377 | -32% | numb 54%  chop 46% |
| prices Heat correctly | $1,641 | $1,566 | $+75 | $+332 | 0.25 | $72 | -25% | numb 96%  chop 3% |
| optimal - Numbers Racket only | $1,658 | $1,568 | $+90 | $+353 | 0.21 | $59 | -24% | numb 100% |

### Is it +EV or -EV?

**Both, depending entirely on knowing one thing.**  A player who prices Heat correctly ends $+75 ahead of an abstainer - marginally positive, about +5% of net worth.  A player who does not ends $-1,215 behind.  That is a swing of roughly $1,290 on a typical net worth of ~$1,600.

**It is not a tax on non-participation.**  At best it is worth ~5% of net worth, which is well inside the noise of a single bad landing.  Abstaining entirely is a perfectly viable line.

### Effect on the money supply

**Immaterial, and the sign flips with skill.**  Correct play creates $+332 of net clean money per game - the branch is *mildly inflationary*, moving the money supply from -30% to -25%.  Naive play *destroys* $885 and pushes the supply to -41%.

The mechanism is that ventures cost **clean** cash and pay **dirty**, and dirty is worth at most 75% of face after laundering.  A venture therefore has to return over **133% of its cost in dirty just to break even** before Heat is priced at all.  Only Numbers Racket clears that comfortably ($360 dirty on $150, a 240% return).

### Is Heat/audit too punishing?

**The audit rates are about right; the venture table is not.**  Audits only bite when Heat is allowed to run - a correct player takes 0.25 audits per game and pays $72 in fines, while a naive one takes 2.24 and pays $1,129.  That is Heat doing exactly its job: it punishes volume, not participation.

The real problem is that **three of the four ventures are not worth launching**:

| venture | cost | return | Heat | verdict |
|---|---|---|---|---|
| **Numbers Racket** | $150 | $360 dirty over 6 rounds | +2 | **+$120 laundered. The only clearly good one.** |
| Chop Shop | $250 | ~$366 dirty over 4 rounds | +3 | ~+$24 before Heat. The +3 Heat makes it net-negative - a trap that looks positive. |
| Escort Service | $300 | 40% of rent over 4 rounds | +2 | Needs >$350/round of rent income to beat Numbers. Typical is $35-150. **Never launched in any simulated game.** |
| Speakeasy | $250 | $294 dirty expected | +2 | -$30 laundered, as the spec already notes. |

Escort being dead is the interesting one, because the spec explicitly designs it as the complement to Chop Shop - "they reward opposite board positions".  That intent does not survive contact with the rent curve: with monopolies rare and development modest, **no player ever collects enough rent for 40% of it to beat a flat $60/round**.  Raising it to 80% of rent lifts its share of launches from ~1% to ~10% - better, but still a niche pick.

## 5. Recommendations

### Item 1: **cut house costs 10% game-wide**

One line in the config module: `houseCostMultiplier: 0.90`.

| metric | baseline | **-10% (recommended)** | levy-free control |
|---|---|---|---|
| Houses built | 17.0 | 18.7 | 19.6 |
| Rent over the game | $3,385 | $3,503 | $3,890 |
| Peak table debt | $3,012 | $2,976 | $794 |
| P(credit drawn) | 97% | 97% | 48% |
| P(distress) | 18% | 19% | 4% |
| Money supply | -30% | -27% | +85% |
| Top-draft win rate | 29% | 30% | 35% |
| Early-monopoly win rate | 32% | 34% | 38% |

This lands development at 18.7 houses - just under your 19-20 target and within 0.9 of the levy-free control - while leaving credit pressure, distress and the draft untouched.  **I deliberately stopped short of the target.**  Hitting 19-20 needs -20%, which buys 1.7 more houses at the price of a further +1.5pp of early-monopoly win rate and 3pp less deflation.  Given the corrected baseline is only 13% below control rather than 22%, that extra dose is buying less than it costs.  If playtesting shows the rent curve still too flat, **-20% is the next step, not -30%**.

If you would rather not touch the price of every house, **(c) first-house-half is an equally good single change** (18.3 houses) with a more targeted feel - it subsidises starting a group, not finishing one.

### Item 2: **no change to Heat or audits. Fix the venture table.**

The Heat and audit mechanics are working - they punish volume, scale correctly with exposure, and leave a disciplined player a real but small edge.  Leave them alone.

The one change I would make: **cut Escort Service from $300 to $150 and raise it to 60% of rent collected.**  As specced it is dead content - never launched in any of the simulated games - which collapses the underworld to a single viable venture and removes the Escort/Chop-Shop board-position tension the design is built around.  Re-pricing it is the cheapest way to restore that choice.

Two things I would *not* do, and one to watch:

- **Do not soften Chop Shop's +3 Heat.**  I tested it; making it +2 makes players launch it more and they end up *worse* off, because the venture is thin on margin before Heat is even counted.  If you want Chop Shop to be real, cut its cost, not its Heat.
- **Do not worry about venture inflation.**  It is a rounding error on the money supply either way, and it is not the reason to change anything.
- **Watch the knowledge gap.**  A ~$1,300 swing in net worth between correct and naive underworld play is the largest single skill cliff in the economy.  That may be exactly what you want from an Era III instrument - but the assist panel should probably show the laundered value of a venture's expected payout, not just its dirty payout, or new players will reliably walk into it.

## 6. Caveats

- The building-aggression equilibrium was measured with pairwise tournaments, not solved.  It is a best response within the policy family I tested (cash-buffer offsets), not a proven Nash equilibrium.
- Peer loans, securitization, CDS, deed options, era-deck effects, bribery and insider trading are still not modelled.  Bribery in particular gives dirty cash a use I have not credited, so the underworld's EV is if anything slightly understated.
- The forced-liquidation model sells deeds to the bank at exactly 70% of face.  The spec offers them to players first at or above that price, so real liquidations should recover a little more.
- Venture funding is modelled as clean-cash-only, on the reading that the spec's remark about bribery being dirty-payable is what "stops dirty money from being a pure liability".  I tested dirty-funded ventures as a sensitivity; it moved the result by under $10.

