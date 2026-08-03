# Monopoly Steady-State Landing Probabilities

Exact stationary distribution of a Markov chain over `(square, consecutive_doubles)` (40 x 3 = 120 states). One step = one die roll; the probability is that a roll ends with the token resting on that square.

## Modelling assumptions

- **Jail: "pay to get out immediately".** A player sent to Jail pays the fine (or uses a Get Out of Jail Free card) at once and leaves on the very next turn. Jail is therefore never a multi-turn absorbing delay. Arriving in Jail still ends the turn and resets the consecutive-doubles counter.
- Square 10 aggregates "In Jail" and "Just Visiting".
- Square 30 ("Go To Jail") has probability 0: it is never a resting square.
- Two fair d6, exact 2d6 distribution over 36 ordered outcomes.
- Three consecutive doubles sends the player to Jail without moving.
- Chance: 16 cards, 10 of which move the player. Community Chest: 16 cards, 2 of which move the player. Decks are modelled as drawn with replacement (well-shuffled).
- Card destinations are resolved recursively: "Go Back 3 Spaces" from square 36 lands on Community Chest (33), and a Community Chest card is then drawn.
- Squares merely passed through -- including a Chance / Community Chest square that immediately moves you elsewhere -- are not counted as landings.

## All 40 squares, by probability (descending)

| Rank | Square | Name | Group | Probability | % |
| ---: | ---: | --- | --- | ---: | ---: |
| 1 | 10 | Jail / Just Visiting | - | 0.062195 | 6.2195% |
| 2 | 24 | Illinois Avenue | Red | 0.031858 | 3.1858% |
| 3 | 0 | Go | - | 0.030961 | 3.0961% |
| 4 | 19 | New York Avenue | Orange | 0.030852 | 3.0852% |
| 5 | 25 | B&O Railroad | Railroads | 0.030659 | 3.0659% |
| 6 | 5 | Reading Railroad | Railroads | 0.029631 | 2.9631% |
| 7 | 18 | Tennessee Avenue | Orange | 0.029356 | 2.9356% |
| 8 | 15 | Pennsylvania Railroad | Railroads | 0.029200 | 2.9200% |
| 9 | 20 | Free Parking | - | 0.028836 | 2.8836% |
| 10 | 21 | Kentucky Avenue | Red | 0.028358 | 2.8358% |
| 11 | 28 | Water Works | Utilities | 0.028074 | 2.8074% |
| 12 | 16 | St. James Place | Orange | 0.027924 | 2.7924% |
| 13 | 23 | Indiana Avenue | Red | 0.027357 | 2.7357% |
| 14 | 26 | Atlantic Avenue | Yellow | 0.027072 | 2.7072% |
| 15 | 11 | St. Charles Place | Pink | 0.027017 | 2.7017% |
| 16 | 27 | Ventnor Avenue | Yellow | 0.026789 | 2.6789% |
| 17 | 31 | Pacific Avenue | Green | 0.026774 | 2.6774% |
| 18 | 39 | Boardwalk | Dark Blue | 0.026260 | 2.6260% |
| 19 | 32 | North Carolina Avenue | Green | 0.026252 | 2.6252% |
| 20 | 12 | Electric Company | Utilities | 0.026040 | 2.6040% |
| 21 | 17 | Community Chest 2 | - | 0.025945 | 2.5945% |
| 22 | 29 | Marvin Gardens | Yellow | 0.025860 | 2.5860% |
| 23 | 34 | Pennsylvania Avenue | Green | 0.025006 | 2.5006% |
| 24 | 14 | Virginia Avenue | Pink | 0.024649 | 2.4649% |
| 25 | 35 | Short Line | Railroads | 0.024326 | 2.4326% |
| 26 | 13 | States Avenue | Pink | 0.023721 | 2.3721% |
| 27 | 33 | Community Chest 3 | - | 0.023661 | 2.3661% |
| 28 | 4 | Income Tax | - | 0.023285 | 2.3285% |
| 29 | 8 | Vermont Avenue | Light Blue | 0.023210 | 2.3210% |
| 30 | 9 | Connecticut Avenue | Light Blue | 0.023003 | 2.3003% |
| 31 | 6 | Oriental Avenue | Light Blue | 0.022621 | 2.2621% |
| 32 | 37 | Park Place | Dark Blue | 0.021864 | 2.1864% |
| 33 | 38 | Luxury Tax | - | 0.021799 | 2.1799% |
| 34 | 3 | Baltic Avenue | Brown | 0.021624 | 2.1624% |
| 35 | 1 | Mediterranean Avenue | Brown | 0.021314 | 2.1314% |
| 36 | 2 | Community Chest 1 | - | 0.018849 | 1.8849% |
| 37 | 22 | Chance 2 | - | 0.010480 | 1.0480% |
| 38 | 36 | Chance 3 | - | 0.008669 | 0.8669% |
| 39 | 7 | Chance 1 | - | 0.008650 | 0.8650% |
| 40 | 30 | Go To Jail | - | 0.000000 | 0.0000% |

**Total: 1.000000000000**

## Aggregate probability by color group

| Group | Squares | Total probability | % | Per-square avg % |
| --- | --- | ---: | ---: | ---: |
| Brown | 1, 3 | 0.042938 | 4.2938% | 2.1469% |
| Light Blue | 6, 8, 9 | 0.068834 | 6.8834% | 2.2945% |
| Pink | 11, 13, 14 | 0.075386 | 7.5386% | 2.5129% |
| Orange | 16, 18, 19 | 0.088132 | 8.8132% | 2.9377% |
| Red | 21, 23, 24 | 0.087573 | 8.7573% | 2.9191% |
| Yellow | 26, 27, 29 | 0.079721 | 7.9721% | 2.6574% |
| Green | 31, 32, 34 | 0.078032 | 7.8032% | 2.6011% |
| Dark Blue | 37, 39 | 0.048124 | 4.8124% | 2.4062% |
| Railroads | 5, 15, 25, 35 | 0.113816 | 11.3816% | 2.8454% |
| Utilities | 12, 28 | 0.054115 | 5.4115% | 2.7057% |

All 28 purchasable properties combined: 0.736670 (73.6670%)

Orange is the strongest three-square group, and the four railroads together are the single highest-value set of squares on the board.

## Validation

Where Jail's probability comes from (contributions per die roll, summing to the square-10 total):

| Arrival route | Probability | % |
| --- | ---: | ---: |
| Dice onto square 10 (Just Visiting) | 0.022695 | 2.2695% |
| Square 30 (Go To Jail) | 0.026351 | 2.6351% |
| Chance 'Go directly to Jail' | 0.004724 | 0.4724% |
| Community Chest 'Go directly to Jail' | 0.004799 | 0.4799% |
| Third consecutive double | 0.003626 | 0.3626% |
| **Total** | **0.062195** | **6.2195%** |

Independent confirmations:

- Power iteration and a numpy linear solve of `pi (P - I) = 0` agree to ~5e-16.
- A 40,000,000-roll Monte Carlo simulation of the same rules reproduced every square to within 0.005 percentage points (consistent with sampling noise).
- Every row of the 120x120 transition matrix sums to 1.
- Values match the classic published figures for this model: Illinois Ave 3.19%, Go 3.10%, New York Ave 3.09%, B&O 3.07%, Reading RR 2.96%.
