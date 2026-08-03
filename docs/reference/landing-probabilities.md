# LEVERAGE Landing Probabilities (v2 - no movement cards)

Exact stationary distribution of a Markov chain over `(square, consecutive_doubles)` (40 x 3 = 120 states). One step = one die roll; the probability is that a roll ends with the token resting on that square.

## Why this supersedes v1

v1 modelled the standard physical decks (10 of 16 Chance cards and 2 of 16 Community Chest cards relocate the token). LEVERAGE does not use those cards. The four authored era decks (`docs/reference/era-decks.md`) contain financial and state-referencing effects only; the cross-deck summary records **Movement cards: 0** for every era.

Squares 2, 7, 17, 22, 33 and 36 are therefore **ordinary terminal resting squares**. A player landing there draws an era card that affects money, credit, Heat or instruments, and stays put.

> **The published Monopoly reference tables no longer apply.** Every widely cited landing-probability table (Illinois Ave 3.19%, Jail 6.2%, GO 3.10%) assumes the standard card decks. Those figures are not valid for this board and must not be used to validate this model. Verification below is self-contained.

## Rules modelled

- Two fair d6, exact 2d6 distribution over 36 ordered outcomes.
- Three consecutive doubles sends the player to Jail without moving.
- Square 30 ("Go To Jail") sends the player to Jail and is never a resting square (probability exactly 0). It is the only relocating square left on the board.
- **Jail: pay to leave immediately. This is a mandatory rule of the ruleset, not a modelling assumption.** Rolling for doubles to escape is not offered. A player sent to Jail pays the fine and leaves on their next turn. In v1 this convention was an assumption chosen to match common house rules; here the spec and the model agree by construction rather than by coincidence. Arriving in Jail still ends the turn and resets the consecutive-doubles counter.
- Square 10 aggregates "In Jail" and "Just Visiting".

## All 40 squares, by probability (descending)

| Rank | Square | Name | Group | Probability | % | v1 % | Delta (pp) |
| ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |
| 1 | 10 | Jail / Just Visiting | - | 0.053305 | 5.3305% | 6.2195% | -0.8891 |
| 2 | 17 | Community Chest 2 | - | 0.028224 | 2.8224% | 2.5945% | +0.2279 |
| 3 | 18 | Tennessee Avenue | Orange | 0.027743 | 2.7743% | 2.9356% | -0.1613 |
| 4 | 19 | New York Avenue | Orange | 0.027405 | 2.7405% | 3.0852% | -0.3447 |
| 5 | 20 | Free Parking | - | 0.027156 | 2.7156% | 2.8836% | -0.1680 |
| 6 | 16 | St. James Place | Orange | 0.027146 | 2.7146% | 2.7924% | -0.0779 |
| 7 | 26 | Atlantic Avenue | Yellow | 0.027073 | 2.7073% | 2.7072% | +0.0001 |
| 8 | 27 | Ventnor Avenue | Yellow | 0.027060 | 2.7060% | 2.6789% | +0.0272 |
| 9 | 25 | B&O Railroad | Railroads | 0.027020 | 2.7020% | 3.0659% | -0.3639 |
| 10 | 28 | Water Works | Utilities | 0.026963 | 2.6963% | 2.8074% | -0.1111 |
| 11 | 21 | Kentucky Avenue | Red | 0.026943 | 2.6943% | 2.8358% | -0.1415 |
| 12 | 29 | Marvin Gardens | Yellow | 0.026880 | 2.6880% | 2.5860% | +0.1019 |
| 13 | 24 | Illinois Avenue | Red | 0.026803 | 2.6803% | 3.1858% | -0.5055 |
| 14 | 31 | Pacific Avenue | Green | 0.026783 | 2.6783% | 2.6774% | +0.0010 |
| 15 | 22 | Chance 2 | - | 0.026704 | 2.6704% | 1.0480% | +1.6224 |
| 16 | 23 | Indiana Avenue | Red | 0.026404 | 2.6404% | 2.7357% | -0.0953 |
| 17 | 15 | Pennsylvania Railroad | Railroads | 0.026163 | 2.6163% | 2.9200% | -0.3037 |
| 18 | 32 | North Carolina Avenue | Green | 0.026051 | 2.6051% | 2.6252% | -0.0201 |
| 19 | 33 | Community Chest 3 | - | 0.025317 | 2.5317% | 2.3661% | +0.1657 |
| 20 | 14 | Virginia Avenue | Pink | 0.025282 | 2.5282% | 2.4649% | +0.0633 |
| 21 | 34 | Pennsylvania Avenue | Green | 0.024567 | 2.4567% | 2.5006% | -0.0439 |
| 22 | 13 | States Avenue | Pink | 0.024431 | 2.4431% | 2.3721% | +0.0710 |
| 23 | 35 | Short Line | Railroads | 0.023752 | 2.3752% | 2.4326% | -0.0575 |
| 24 | 12 | Electric Company | Utilities | 0.023639 | 2.3639% | 2.6040% | -0.2401 |
| 25 | 3 | Baltic Avenue | Brown | 0.023339 | 2.3339% | 2.1624% | +0.1715 |
| 26 | 2 | Community Chest 1 | - | 0.023129 | 2.3129% | 1.8849% | +0.4280 |
| 27 | 4 | Income Tax | - | 0.022980 | 2.2980% | 2.3285% | -0.0305 |
| 28 | 1 | Mediterranean Avenue | Brown | 0.022911 | 2.2911% | 2.1314% | +0.1598 |
| 29 | 36 | Chance 3 | - | 0.022883 | 2.2883% | 0.8669% | +1.4214 |
| 30 | 11 | St. Charles Place | Pink | 0.022809 | 2.2809% | 2.7017% | -0.4208 |
| 31 | 0 | Go | - | 0.022775 | 2.2775% | 3.0961% | -0.8186 |
| 32 | 9 | Connecticut Avenue | Light Blue | 0.022774 | 2.2774% | 2.3003% | -0.0229 |
| 33 | 5 | Reading Railroad | Railroads | 0.022749 | 2.2749% | 2.9631% | -0.6882 |
| 34 | 8 | Vermont Avenue | Light Blue | 0.022735 | 2.2735% | 2.3210% | -0.0475 |
| 35 | 6 | Oriental Avenue | Light Blue | 0.022691 | 2.2691% | 2.2621% | +0.0069 |
| 36 | 7 | Chance 1 | - | 0.022665 | 2.2665% | 0.8650% | +1.4014 |
| 37 | 39 | Boardwalk | Dark Blue | 0.022553 | 2.2553% | 2.6260% | -0.3706 |
| 38 | 38 | Luxury Tax | - | 0.022306 | 2.2306% | 2.1799% | +0.0508 |
| 39 | 37 | Park Place | Dark Blue | 0.021887 | 2.1887% | 2.1864% | +0.0023 |
| 40 | 30 | Go To Jail | - | 0.000000 | 0.0000% | 0.0000% | +0.0000 |

**Total: 1.000000000000**

## Aggregate probability by color group

| Group | Squares | Total | % | Per-square avg % | v1 total % | Delta (pp) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Brown | 1, 3 | 0.046250 | 4.6250% | 2.3125% | 4.2938% | +0.3313 |
| Light Blue | 6, 8, 9 | 0.068199 | 6.8199% | 2.2733% | 6.8834% | -0.0635 |
| Pink | 11, 13, 14 | 0.072522 | 7.2522% | 2.4174% | 7.5386% | -0.2865 |
| Orange | 16, 18, 19 | 0.082293 | 8.2293% | 2.7431% | 8.8132% | -0.5838 |
| Red | 21, 23, 24 | 0.080150 | 8.0150% | 2.6717% | 8.7573% | -0.7423 |
| Yellow | 26, 27, 29 | 0.081013 | 8.1013% | 2.7004% | 7.9721% | +0.1292 |
| Green | 31, 32, 34 | 0.077401 | 7.7401% | 2.5800% | 7.8032% | -0.0630 |
| Dark Blue | 37, 39 | 0.044440 | 4.4440% | 2.2220% | 4.8124% | -0.3683 |
| Railroads | 5, 15, 25, 35 | 0.099684 | 9.9684% | 2.4921% | 11.3816% | -1.4132 |
| Utilities | 12, 28 | 0.050602 | 5.0602% | 2.5301% | 5.4115% | -0.3512 |

All 28 purchasable properties combined: 0.702556 (70.2556%)

- Strongest three-square colour group per square: **Orange** at 2.7431% per square.
- Highest-traffic set overall by total: **Railroads** at 9.9684%.

## Traffic spread across purchasable properties

| Metric | v2 | v1 |
| --- | ---: | ---: |
| Highest-traffic property | Tennessee Avenue 2.7743% | Illinois Avenue 3.1858% |
| Lowest-traffic property | Park Place 2.1887% | Mediterranean Avenue 2.1314% |
| Spread (percentage points) | 0.5856 | 1.0544 |
| Ratio highest:lowest | 1.2675x | 1.4947x |

## Shape of the distribution

With card movement removed, the board carries exactly one structure, driven entirely by the two Jail mechanics:

- **Mass source at square 10.** Jail absorbs 5.33% of all rolls, roughly twice the 2.50% uniform baseline.
- **Echo peak at square 17 (Jail + 7).** Everything leaving Jail re-enters the board one modal 2d6 roll later, so square 17 is the busiest non-Jail square at 2.8224%. The echo decays smoothly across the Orange, Red and Yellow ranks.
- **Shadow trough at square 37 (Go To Jail + 7).** Square 30 is never a resting square, so it feeds nobody, and the deficit lands one modal roll later. Square 37 is the quietest square on the board at 2.1887%.

This is why Orange and Red still lead and why Dark Blue is still traffic-poor: those positions are now determined purely by distance from Jail, not by card destinations. Orange's strength was previously attributed to Jail traffic, and that attribution is now the *entire* explanation rather than one contributor among several.

## Validation

Where Jail's probability comes from (contributions per die roll, summing to the square-10 total):

| Arrival route | Probability | % |
| --- | ---: | ---: |
| Dice onto square 10 (Just Visiting) | 0.022840 | 2.2840% |
| Square 30 (Go To Jail) | 0.026783 | 2.6783% |
| Third consecutive double | 0.003681 | 0.3681% |
| **Total** | **0.053305** | **5.3305%** |

Independent confirmations:

- Probabilities sum to 1.000000000000.
- Power iteration and a numpy linear solve of `pi (P - I) = 0` agree to 2.07e-16.
- A 40,000,000-roll Monte Carlo simulation of the same rules reproduced every square to within 0.0057 percentage points (worst: square 22), consistent with sampling noise.
- Every row of the 120x120 transition matrix sums to 1.
- No comparison against published Monopoly tables is made or is valid, since those assume the standard movement decks.
