# LEVERAGE — Era Decks

**Date:** 2026-08-03
**Status:** Content draft, authored against `docs/superpowers/specs/2026-08-03-leverage-design.md`

Four decks of exactly 20 cards. Drawn by the app when a token rests on square 7, 22 or 36
(Chance) or square 2, 17 or 33 (Community Chest). The physical cards are not used. Shuffle
order is recorded as an event at era start, so games stay exactly replayable.

Card IDs are stable and are the identifiers the engine should key on. `E1-07` is the seventh
card of the Era I deck as authored here, not its position after shuffling.

---

## 0. Reading conventions

These conventions apply to every card in every deck. They exist so that no individual card
has to restate them, and so that the engine has one place to implement them.

### Timing vocabulary

Cards are drawn during the **Movement** phase, mid-turn, as part of resolving a landing.

| Phrase | Means |
|---|---|
| **immediately** | Resolves at the instant of the draw, before the drawer's turn continues |
| **this round** | From the draw until the end of the current round's Settlement |
| **the next round** | The entirety of round N+1, all four phases |
| **the next Open phase** | The Open phase of round N+1 |
| **the next Settlement** | The Settlement of the current round N (Settlement has not yet run when the card is drawn) |
| **for the remainder of the era** | Until the Settlement of the era's final round completes (round 6, 12, 18, 24) |
| **for the remainder of the game** | Until scoring |

### Money and shortfalls

- All amounts are **clean cash** unless a card says "dirty cash".
- All percentage results **round down to the nearest $1**.
- **No card may reduce a player below $0 clean cash.** Where a card requires a payment the
  player cannot meet, the engine follows the standard obligation path in spec section 5:
  exhaust clean cash, then credit line, then liquidation, and any residual shortfall becomes
  **Distressed Debt** at 15% per round. No card eliminates a player.
- Money paid "to the Treasury" and collected "from the Treasury" moves against the Treasury
  balance, which may run a deficit. Money conservation is preserved because the Treasury is
  inside the accounting boundary.
- Where a card forgives debt, the Treasury absorbs the loss: the player's liability falls and
  the Treasury balance falls by the same amount.

### Dynamic targeting and tie-breaks

Every card that selects a player dynamically states its own tie-break chain. Where a chain
does not fully resolve, the **final tie-break in every case is earlier position in turn
order**, which is fixed at setup and therefore always total. Cards state this explicitly
rather than relying on the convention.

Selection is evaluated at the **moment of the draw**, against state as it stands then.

Where a card's dynamic condition matches nobody — no CDO pools exist, no player holds dirty
cash — the card states an explicit fallback. There are no dead cards.

### Bribery interaction

Per spec section 10, bribery can cancel an era card effect that targets the briber
specifically, and cannot cancel a card that targets all players. The rule is derivable from
the Targets column and needs no separate flag:

> A card is **bribery-cancellable** if and only if its Targets column resolves to exactly one
> player. Cards targeting all players, or a set of two or more players, are not cancellable.

Cards whose Targets column reads "all players" but which only bite a subset (for example
E4-08, which audits every player at Heat 4 or more) are **not** cancellable, because the card
as written targets everyone.

### Era gating

No card references an instrument before its era unlocks. Era I references only deeds,
building, mortgages, trading and the bank credit line. Era II adds peer loans, rent futures,
ventures, laundering and bribery. Era III adds CDO pools, tranches, CDS, deed options and
insider trading, and is the first era in which a card may trigger an audit.

---

## 1. Era I — Recovery (rounds 1-6, prevailing rate 5%)

Quiet, small, mostly beneficial. Amounts $50-$200. Nothing in this deck can cripple a player
in the opening six rounds. The deck's job is to teach the draw mechanic, seed the first
building decisions, and make the credit line feel safe enough to use.

| # | Title | Effect text | Mechanical effect | Targets |
|---|---|---|---|---|
| E1-01 | Zoning Variance Approved | "The board has approved your variance. Build while the ink is wet." | Drawer receives a one-time half-price house voucher. The next single house the drawer purchases during the current or next Open phase costs 50% of the standard house price for that colour group. Normal full-group, unmortgaged and even-build rules still apply. The voucher expires unused at the end of the next Open phase. Not transferable. | Drawer |
| E1-02 | Reconstruction Grant | "Federal reconstruction funds are directed to under-improved parcels." | The player with the fewest buildings on the board collects $150 from the Treasury. Building count = houses + (5 x hotels). Tie-break: lower total deed face value; then earlier turn order. | The least-developed player |
| E1-03 | Victory Bond Coupon | "A wartime issue matures. Modest, and on time." | Every player collects $75 from the Treasury. | All players |
| E1-04 | Title Search Fee | "Counsel has traced the encumbrances. Counsel bills for it." | Drawer pays the Treasury $50 for each mortgaged deed they hold, to a maximum of $200. If the drawer holds no mortgaged deeds, no payment is made and no compensation is given. | Drawer |
| E1-05 | Freight Haulage Contract | "Rolling stock is scarce. The rails quote accordingly." | The player owning the most railroads collects $50 per railroad they own from the Treasury. Tie-break: lower total deed face value; then earlier turn order. Only one player collects. | The largest railroad holder |
| E1-06 | Prime Rate Concession | "The discount window opens a crack." | The drawer pays no credit line interest at the next Settlement; the Treasury forgoes it. If the drawer's drawn balance is $0 at the next Settlement, the drawer instead collects $100 from the Treasury at that Settlement. | Drawer |
| E1-07 | Lumber Shortage | "Framing timber is rationed. Everyone pays for the privilege of having built." | Every player pays the Treasury $25 for each house they own and $125 for each hotel, capped at $100 per player. Players with no buildings pay nothing. | All players |
| E1-08 | Streetcar Line Extended | "The new line runs through the cheap end of town." | For the whole of the next round, rent collected on Brown and Light Blue properties is increased by 50%. Applies to the rent actually paid by the landing player. Reverts automatically at the end of the next round. | All players; benefits Brown and Light Blue owners |
| E1-09 | Assessor's Reappraisal | "The rolls are revised. Some frontage is now worth more than its owner claimed." | The player with the highest total unmortgaged deed face value pays $150 to the Treasury. The player with the lowest total unmortgaged deed face value collects $100 from the Treasury. If the same player would be both, they pay $50 net. Tie-break for highest: more buildings; then earlier turn order. Tie-break for lowest: fewer buildings; then earlier turn order. | Two dynamically selected players |
| E1-10 | Utility Franchise Renewed | "The municipality renews both franchises without argument." | Every player who owns at least one utility collects $100 from the Treasury per utility owned. Mortgaged utilities count. If neither utility is owned by a player, the drawer collects $100. | All utility owners |
| E1-11 | Credit Committee Sits | "Your file is approved without discussion. Note the date." | The drawer's borrowing base is permanently increased by a flat $150 for the remainder of the game. This is an additive term applied after the standard base calculation and is not affected by mortgaging. | Drawer |
| E1-12 | Back Taxes Refunded | "An arithmetic error in the county's favour, corrected." | Every player collects $25 from the Treasury for each unmortgaged deed they hold, capped at $150 per player. | All players |
| E1-13 | Contractor Extends Credit | "The builder wants the whole block and will discount to get it." | The player holding the most complete unmortgaged colour groups receives a $200 building credit, applied automatically against their next house and hotel purchases until exhausted. Expires at the end of round 6 if unused. Tie-break: fewer total buildings; then lower total deed face value; then earlier turn order. If no player holds a complete unmortgaged colour group, every player instead collects $75 from the Treasury. | The player with the most complete groups, or all players on fallback |
| E1-14 | Bank Examiner Calls | "The examiner would like to see the balance reduced. This week." | The player with the largest drawn credit balance immediately repays $150 of it from clean cash. If they hold less than $150 clean cash, they repay all clean cash they hold and no more; this never creates distressed debt. Tie-break: higher drawn-to-base ratio; then earlier turn order. If no player has a drawn balance, the drawer collects $100 from the Treasury. | The most indebted player |
| E1-15 | Insurance Settlement | "The claim is paid without a fight. Enjoy the novelty." | Drawer collects $200 from the Treasury. | Drawer |
| E1-16 | Chimney Fire | "Sparks in the flue. The inspector is unsympathetic." | Drawer pays the Treasury $25 per house and $100 per hotel they own, capped at $200. If the drawer owns no buildings, no payment. | Drawer |
| E1-17 | Rent Control Board Convenes | "The board finds current increases 'not justified by circumstance'." | For the whole of the next round, rent collected on any property carrying 3 or more houses (a hotel counts as 5 houses) is reduced by 25%. Applies to the rent actually paid by the landing player. Reverts at the end of the next round. | All players; bites the most-developed |
| E1-18 | Tenants' Petition | "Signatures gathered on the busiest street, delivered to the quietest." | The player who has collected the most rent so far this era pays $100 to the player who has collected the least rent so far this era. Rent collected is measured from the start of round 1. Tie-break for most: higher total deed face value; then earlier turn order. Tie-break for least: lower total deed face value; then earlier turn order. If the same player is both, no effect. | Two dynamically selected players |
| E1-19 | Mortgage Amnesty | "The lender will take face value to clear the file." | The player holding the most mortgaged deeds may, during the next Open phase, unmortgage one deed of their choice at 50% of face value instead of the standard 55%. The right expires at the end of the next Open phase and is not transferable. Tie-break: higher total mortgaged face value; then earlier turn order. If no player holds a mortgaged deed, the drawer collects $100 from the Treasury. | The player with the most mortgaged deeds |
| E1-20 | Wage Indexation | "Pay packets are adjusted upward. Briefly." | For the whole of the next round, GO pays $300 instead of $200 on passing or landing. Reverts at the end of the next round. | All players |

**Era I balance note.** Eleven cards are net positive to their target, four are net negative,
five are redistributive or conditional. Largest single loss possible is $200 (E1-16 at full
development, which is unreachable in Era I). Deck expected value is mildly positive, which is
correct for an era whose purpose is to establish that drawing a card is not frightening.

---

## 2. Era II — Expansion (rounds 7-12, prevailing rate 6%)

The boom. Cheap credit, favourable terms, rent upside, and vice that looks free because audits
do not begin until round 13. Amounts $100-$400. Every temptation in this deck is a bill
arriving in Era III or IV.

| # | Title | Effect text | Mechanical effect | Targets |
|---|---|---|---|---|
| E2-01 | Syndicated Facility Arranged | "Three banks want the paper. Take the bigger number." | The drawer's borrowing base is multiplied by 1.25 for the remainder of Era II, reverting at the completion of the round 12 Settlement. The multiplier applies after the standard base calculation and after any additive term from E1-11. Any margin call arising from the reversion at round 12 is flagged normally with the standard cure window. | Drawer |
| E2-02 | Boom-Time Rents | "Asking rents are up across every class of property." | For the whole of the next round, all rent collected on any landing is increased by 25%. Rent futures capture the increase. Reverts at the end of the next round. | All players |
| E2-03 | Speculative Frenzy | "Buyers are queuing for anything with a roof on it." | The owner of the most-developed complete colour group collects $300 from the Treasury. "Most-developed" = the complete unmortgaged colour group carrying the greatest building count, where a hotel counts as 5 houses. Tie-break: higher combined deed face value of that group; then earlier turn order. If no player holds a complete unmortgaged colour group, every player collects $100. | The most-developed group owner |
| E2-04 | New Money Enters the Market | "Capital arrives from somewhere and asks few questions." | Every player collects $150 from the Treasury. | All players |
| E2-05 | Vice Squad Reshuffle | "The precinct is reorganised. Files are misplaced." | Every player reduces Heat by 2, to a minimum of 0. | All players |
| E2-06 | A Friend in the Precinct | "An envelope is left for you. It is not from the bank." | Drawer receives $200 dirty cash and gains +1 Heat. Dirty cash is worth $0 at scoring and is fully seizable in an audit from round 13 onward. | Drawer |
| E2-07 | Numbers Runner Recruited | "The book is expanding. It expands toward money." | The player currently holding the most dirty cash receives an additional $150 dirty cash and gains +1 Heat. Tie-break: higher current Heat; then earlier turn order. If no player holds dirty cash, the drawer instead receives $150 dirty cash and +1 Heat. | The dirtiest player |
| E2-08 | Correspondent Bank Writes Down | "A rival institution takes the loss to keep the relationship." | The player with the largest drawn credit balance has $250 of that balance forgiven by the Treasury. The Treasury balance falls by $250. Tie-break: higher drawn-to-base ratio; then earlier turn order. If no player has a drawn balance, every player collects $100 from the Treasury. | The most indebted player |
| E2-09 | Treasury Bids for Paper | "The Treasury is buying contracts to steady the market. Above the model." | The holder of the outstanding rent future with the highest engine-computed remaining expected value may, during the next Open phase, sell that contract to the Treasury for 120% of that value. If sold, the contract terminates immediately and rent reverts to the deed owner for the remaining window. The right is optional and expires at the end of the next Open phase. Tie-break: higher remaining expected value; then earlier turn order. If no rent futures are outstanding, the drawer collects $200 from the Treasury. | The holder of the most valuable rent future |
| E2-10 | Construction Boom | "Every yard in the city is pouring foundations." | For the whole of the next round, house and hotel purchase prices are reduced by 25% for all players. Even-build and supply limits are unchanged. Reverts at the end of the next round. | All players |
| E2-11 | Discreet Introduction | "You are given a name and a time. Nothing is written down." | The drawer may launch any one venture during the current or next Open phase at 50% of its stated cost. Heat is charged in full at the normal rate for that venture. The discount expires at the end of the next Open phase and applies to one venture only. | Drawer |
| E2-12 | Loan Syndication Fee | "Arranging other people's debt is the safest business in town." | The player who has lent the most total outstanding peer loan principal collects $200 from the Treasury. Tie-break: greater number of outstanding notes held; then earlier turn order. If no peer loans are outstanding, every player collects $100. | The largest peer lender |
| E2-13 | Warehouse Line Opened | "They will fund the position first and document it later." | The most leveraged player receives a temporary borrowing base uplift of $400, expiring at the completion of the round 12 Settlement. "Most leveraged" = highest drawn balance divided by borrowing base, considering only players with a drawn balance above $0. Any margin call arising from the expiry at round 12 is flagged normally with the standard cure window. Tie-break: larger drawn balance; then earlier turn order. If no player has a drawn balance, the drawer receives the uplift instead. | The most leveraged player |
| E2-14 | Waterfront Redevelopment | "The plan is announced with a model and a ribbon." | For the whole of the next round, rent collected on Dark Blue and Green properties is doubled. A rent future over such a property captures the doubling. Reverts at the end of the next round. | All players; benefits Dark Blue and Green owners |
| E2-15 | Payroll Tax Holiday | "A relief measure, and an election coming." | For the whole of the next round, GO pays $400 instead of $200 on passing or landing. Reverts at the end of the next round. | All players |
| E2-16 | Excise Inspection | "The inspector counts the premises, not the takings." | Every player pays the Treasury $100 for each venture they currently have active. Speakeasy, being one-shot, is never active and is never counted. Players with no active ventures pay nothing. | All players; bites venture operators |
| E2-17 | Distress Financing Available | "Someone is always willing to lend to the desperate." | The player holding the least clean cash collects $250 from the Treasury. Tie-break: lower net worth; then earlier turn order. | The cash-poorest player |
| E2-18 | Building Permit Backlog | "The department is overwhelmed, and charges for the inconvenience." | The player with the highest building count pays the Treasury $25 per house and $150 per hotel they own, capped at $400. Building count = houses + (5 x hotels). Tie-break: higher total deed face value; then earlier turn order. If no player owns a building, no effect. | The most-developed player |
| E2-19 | An Accommodating Cashier | "He does not look at the notes. He looks at the clock." | The drawer may perform one laundering transaction during the current or next Open phase at a flat 10% haircut instead of the standard schedule, and that transaction costs 0 Heat. It still counts against the once-per-Open-phase laundering limit. Expires at the end of the next Open phase. | Drawer |
| E2-20 | Rate Dip | "The prevailing rate softens for a month. Nobody expects it to last." | At the next Settlement only, credit line interest is charged to all players at 4% instead of 6%. Peer loan rates are unaffected, being privately negotiated. | All players |

**Era II balance note.** Deck expected value is mildly positive. The deck is deliberately
loaded with instruments that raise a player's leverage ceiling (E2-01, E2-08, E2-13) or make
vice cheap (E2-06, E2-07, E2-11, E2-19). Nothing in this deck can trigger an audit, because
audit checks do not begin until round 13. The Heat accumulated here is the Era III bill.

---

## 3. Era III — Financialization (rounds 13-18, prevailing rate 8%)

Volatile and two-sided. Ratings actions, tranche revaluations, credit line adjustments, the
first audit pressure, and insider information. Winners and losers in the same deck. Amounts
$200-$600.

| # | Title | Effect text | Mechanical effect | Targets |
|---|---|---|---|---|
| E3-01 | Ratings Downgrade | "The agency revises its assumptions. It does not revise its fees." | For every outstanding CDO pool, the mezzanine tranche's remaining face amount is reduced by 30%. Cash already distributed is unaffected. The reduction increases the residual available to equity in all subsequent waterfalls. Displayed ratings recompute automatically. If a pool has no mezzanine face remaining, it is skipped. If no CDO pools exist, every player collects $200 from the Treasury. | All mezzanine holders; benefits all equity holders |
| E3-02 | Liquidity Backstop | "The window is opened for the worst paper in the market, which is the point." | The holder of the outstanding tranche with the lowest displayed rating score collects $400 from the Treasury. Tie-break: lower rating score; then lower remaining face amount; then earlier turn order. If no tranches are outstanding, every player collects $200. | The holder of the worst-rated tranche |
| E3-03 | Early Audit Sweep | "Selected files are pulled ahead of schedule." | Every player whose current Heat is 5 or more is audited immediately, resolving exactly as a successful audit check: all their dirty cash is seized, they pay a fine of $100 x Heat in clean cash, and their Heat resets to 0. This does not replace or consume the normal audit check at the coming Settlement. If no player is at Heat 5 or more, no effect. | All players; bites Heat 5+ |
| E3-04 | Compliance Consultant Retained | "He is expensive, and he is worth it, and you should have hired him sooner." | The drawer may pay $300 clean cash to reduce their Heat by 3, to a minimum of 0. If the drawer declines, or holds less than $300 clean cash, their Heat instead reduces by 1, to a minimum of 0, at no cost. The choice is made immediately at the draw. | Drawer |
| E3-05 | Material Non-Public Information | "You are told three things before they happen. You are told not to say who told you." | The drawer privately views the top three cards of the current era deck and returns them in any order they choose. The engine emits a DeckReordered event recording the chosen order, preserving replayability. Drawer gains +1 Heat. The three cards are not revealed to any other player or to the table view. | Drawer |
| E3-06 | Credit Line Review | "The lending base is recalculated on a stricter formula. Effective immediately." | For the remainder of Era III, every player's borrowing base is computed as 40% of unmortgaged deed face value plus 25% of building cost, instead of 50%. Reverts at the completion of the round 18 Settlement. Any margin call arising from the recalculation is flagged at the next Settlement with the standard one-Open-phase cure window. | All players |
| E3-07 | Covenant Waiver Negotiated | "The lender agrees to look away once. Once." | The most leveraged player receives one waiver token. The next time that player is flagged for a margin call, their cure deadline is extended by one full round instead of ending at the next Open phase, and the token is consumed. The token expires unused at the completion of the round 18 Settlement and is not transferable. "Most leveraged" = highest drawn balance divided by borrowing base, considering only players with a drawn balance above $0. Tie-break: larger drawn balance; then earlier turn order. If no player has a drawn balance, the drawer receives the token. | The most leveraged player |
| E3-08 | Refinancing Window | "Balances retire at a discount for one week only." | During the next Open phase, every player may retire drawn credit balance at a 10% discount: each $100 of clean cash applied retires $110 of drawn balance, up to a maximum of $600 of balance retired per player. The Treasury absorbs the difference. Unused capacity expires at the end of the next Open phase. | All players |
| E3-09 | Junior Capital Call | "The equity is asked to support its own structure." | The holder of the equity tranche of the pool with the largest expected cashflow pays $300 into that pool immediately. The cash is added to the pool's collected balance and distributed through the standard waterfall at the next Settlement, meaning senior and mezzanine are paid first. Tie-break: larger senior face amount; then earlier turn order. If no CDO pools exist, every player collects $200 from the Treasury. | The equity holder of the largest pool |
| E3-10 | Counterparty Doubt | "Protection sellers are asked to show they can pay." | Every player who has written at least one outstanding CDS must post an additional 15% of each written notional against their borrowing base, for the remainder of the game, bringing the total posting to 45% of notional. Any margin call arising is flagged at the next Settlement with the standard cure window. If no CDS are outstanding, every player collects $200 from the Treasury. | All CDS writers |
| E3-11 | Option Repricing | "A drafting error in the standard form is discovered and, unusually, honoured." | Every outstanding deed option's strike price is reduced by $100, to a minimum of $0. Expiry rounds and premiums already paid are unchanged. If no deed options are outstanding, the drawer collects $300 from the Treasury. | All option holders; harms all option writers |
| E3-12 | Traffic Study Published | "The busiest corners of the city are, it emerges, the busiest corners of the city." | For the whole of the next round, rent collected on Orange and Red properties is doubled. Rent futures over those properties capture the doubling. Reverts at the end of the next round. | All players; benefits Orange and Red owners |
| E3-13 | Regulatory Fine | "The source of the deposit could not be satisfactorily explained." | The player holding the most dirty cash pays a fine of $300 in clean cash and gains +1 Heat. Dirty cash is not seized by this card. Tie-break: higher current Heat; then earlier turn order. If no player holds dirty cash, the drawer collects $200 from the Treasury. | The dirtiest player |
| E3-14 | Voluntary Disclosure Programme | "Come forward now and the penalty is merely arithmetic." | During the next Open phase, every player may convert up to $400 of dirty cash to clean cash at a flat 40% haircut, at 0 Heat cost, and reduces Heat by 1 if they do so. This conversion does not count against the once-per-Open-phase laundering limit. The offer expires at the end of the next Open phase. | All players |
| E3-15 | The Agency Is Called to Testify | "The rating was arithmetically correct. That was the difficulty." | The originator of the outstanding tranche with the highest displayed rating score pays $400 to the Treasury. Tie-break: higher remaining face amount across that pool's tranches; then earlier turn order. If no tranches are outstanding, every player collects $200 from the Treasury. | The originator of the best-rated tranche |
| E3-16 | Servicer Demands Cure | "One additional payment, in advance, as a demonstration of good faith." | The peer loan borrower with the largest total outstanding principal immediately pays one round's interest on that principal, in addition to the payment due at the coming Settlement. Payment is to the note holder. **This payment is explicitly not a peer loan interest obligation for default purposes:** failure to pay does not constitute default, does not transfer collateral, and does not halve the borrowing base. Any shortfall becomes distressed debt. Tie-break: larger outstanding principal; then higher per-round rate; then earlier turn order. If no peer loans are outstanding, no effect. | The largest peer borrower |
| E3-17 | Windfall Profits Levy | "A one-off measure, as these always are." | The player with the highest current net worth pays the Treasury 5% of that net worth, capped at $600. Net worth is computed per spec section 12 at the moment of the draw. Tie-break: higher clean cash; then earlier turn order. | The leading player |
| E3-18 | Distressed Fund Takes a Position | "Someone is buying the worst assets in the city, cheaply." | The player with the lowest current net worth collects $400 from the Treasury. If that player carries distressed debt, the $400 is applied to reduce the distressed debt balance instead of paying cash; any excess above the balance is paid as clean cash. Tie-break: lower clean cash; then earlier turn order. | The trailing player |
| E3-19 | Wiretap Transcripts Released | "The transcripts name the frequent callers. They also name the abstainers, favourably." | The player who has taken the most dirty actions this game gains +2 Heat. The player who has taken the fewest reduces Heat by 2, to a minimum of 0. Dirty actions = ventures launched + laundering transactions + briberies + insider trades, counted cumulatively across the whole game. Tie-break for most: higher current Heat; then earlier turn order. Tie-break for fewest: lower current Heat; then earlier turn order. If the same player is both, no effect. | Two dynamically selected players |
| E3-20 | Origination Fee Recognised | "The structure is complete, and the fee is booked before the first payment is due." | The originator of the CDO pool with the largest expected cashflow collects $300 from the Treasury. Tie-break: larger total senior plus mezzanine face; then earlier turn order. If no CDO pools exist, every player collects $200. | The largest pool's originator |

**Era III balance note.** Seven cards are clearly positive to their target, eight clearly
negative, five two-sided or redistributive. Deck expected value is approximately neutral with
wide variance, which is the point: this is the era where the table stops being able to predict
what a draw does. Three cards (E3-06, E3-08, E3-10) can cause margin calls; all route through
the standard flag-and-cure path rather than immediate liquidation.

---

## 4. Era IV — Reckoning (rounds 19-24, prevailing rate 12%)

Punitive and targeted. Downgrades, covenant breaches, forced deleveraging, audit sweeps and
margin call triggers. Amounts $300-$900. A player who deleveraged and cooled off during Era III
finds this deck survivable and occasionally profitable. A player who did not finds it
relentless.

| # | Title | Effect text | Mechanical effect | Targets |
|---|---|---|---|---|
| E4-01 | Covenant Breach | "A technical default. The technicality is that you promised not to." | The most leveraged player is flagged for a margin call immediately, whether or not their drawn balance currently exceeds their borrowing base. To cure, they must reduce drawn balance to at most 80% of borrowing base by the end of the next Open phase, failing which the standard force-liquidation procedure runs at the 70%-of-face floor. "Most leveraged" = highest drawn balance divided by borrowing base, considering only players with a drawn balance above $0. Tie-break: larger drawn balance; then earlier turn order. If no player has a drawn balance, no effect. | The most leveraged player |
| E4-02 | Audit Sweep | "The accounts are examined. Forty per cent is not returned." | The player holding the most dirty cash forfeits 40% of it. Heat is unchanged and this does not consume the round's normal audit check. Tie-break: higher current Heat; then earlier turn order. If no player holds dirty cash, the player with the highest Heat pays $300 in clean cash to the Treasury instead, tie-broken by lower net worth, then earlier turn order; if all players are at Heat 0, no effect. | The dirtiest player |
| E4-03 | Downgrade Cascade | "Every structure in the market is remarked at once, which is how it always happens." | For every outstanding CDO pool, the senior tranche's remaining face amount is reduced by 15% and the mezzanine tranche's remaining face amount is reduced by 40%. Cash already distributed is unaffected. Both reductions increase the residual available to equity in subsequent waterfalls. Displayed ratings recompute. If no CDO pools exist, every player pays $300 to the Treasury. | All senior and mezzanine holders; benefits all equity holders |
| E4-04 | Forced Deleveraging | "The facility is repriced to a ratio nobody was running at." | At the next Settlement, every player whose drawn credit balance exceeds 60% of their borrowing base is flagged for a margin call and must reduce drawn balance to at most 60% of borrowing base by the end of the following Open phase, failing which the standard force-liquidation procedure runs. Players at or below 60% are unaffected. | All players; bites the levered |
| E4-05 | Rate Shock | "The rate moves six points in an afternoon." | At the next Settlement only, credit line interest is charged to all players at 18% instead of 12%. Where a player cannot pay from clean cash, the interest capitalises into drawn balance as normal. Peer loan rates are unaffected. | All players |
| E4-06 | Collateral Haircut | "Improvements are no longer considered good security." | For the remainder of the game, buildings contribute 10% of building cost to the borrowing base instead of 25%. Deed contribution is unchanged at 50% of unmortgaged face. Any margin call arising is flagged at the next Settlement with the standard cure window. | All players |
| E4-07 | Debt Restructuring Agreed | "The creditors accept that some of it was never coming back." | The player with the largest distressed debt balance has $400 of it forgiven by the Treasury. Tie-break: lower net worth; then earlier turn order. If no player carries distressed debt, the player with the lowest net worth collects $400 from the Treasury instead, tie-broken by lower clean cash, then earlier turn order. | The most distressed player |
| E4-08 | Fraud Charges Filed | "The charges are filed jointly, which is efficient for everyone but the accused." | Every player whose current Heat is 4 or more is audited immediately, resolving exactly as a successful audit check: all dirty cash seized, fine of $100 x Heat in clean cash, Heat resets to 0. Each such player additionally pays a $300 penalty to the Treasury. This does not consume the round's normal audit check. If no player is at Heat 4 or more, no effect. | All players; bites Heat 4+ |
| E4-09 | Protection Sellers Called | "Everyone who wrote protection is asked to prove they can honour it." | Every player who has written at least one outstanding CDS must post an additional 20% of each written notional against their borrowing base immediately, for the remainder of the game. This stacks with any posting from E3-10. Any margin call arising is flagged at the next Settlement with the standard cure window. If no CDS are outstanding, every player pays $300 to the Treasury. | All CDS writers |
| E4-10 | Rent Collapse | "Tenants are leaving. The ones who stay are renegotiating." | For the whole of the next round, all rent collected on any landing is reduced by 50%. A rent future over any property receives only the reduced amount; this is not a make-whole event and no compensation is owed to the holder. Reverts at the end of the next round. | All players; bites landlords and rent future holders |
| E4-11 | Tenant Defaults | "The best collections in the city turn out to have been the most concentrated." | The player who has collected the most rent this era pays $500 to the Treasury. Rent received through a rent future counts toward the receiving player, not the deed owner. Tie-break: higher total deed face value; then earlier turn order. If no rent has been collected this era, no effect. | The highest rent collector this era |
| E4-12 | Fire Sale | "The lender's patience and the borrower's options expire on the same afternoon." | The player with the largest drawn credit balance must immediately mortgage their highest-face-value unmortgaged deed, receiving 50% of face value in clean cash, which is applied first to reduce their drawn balance. If that deed is encumbered by a rent future, the standard make-whole applies and the contract terminates. If that deed carries an outstanding deed option, the next-highest unencumbered deed is mortgaged instead, since an optioned deed may not be mortgaged. If the player holds no eligible unmortgaged deed, no effect. Tie-break: higher drawn-to-base ratio; then earlier turn order. | The most indebted player |
| E4-13 | Options Accelerated | "All outstanding rights are brought forward to Friday." | Every outstanding deed option's expiry is brought forward to the end of the next Open phase. Holders exercise by paying the strike as normal or the option lapses worthless. Premiums are not refunded. If no deed options are outstanding, every player pays $300 to the Treasury. | All option holders and writers |
| E4-14 | Pool Wound Down | "The trustee terminates the weakest structure rather than fund it further." | The outstanding CDO pool with the lowest coverage ratio terminates at the end of the next Settlement. Its waterfall runs one final time on cash collected to date and no further; the underlying assets return to their owners unencumbered. Any tranche of that pool short of its remaining face at termination is a credit event and triggers every CDS referencing it. Equity of that pool receives only what remains after senior and mezzanine, which will typically be nothing. Tie-break: lower coverage ratio; then larger senior face amount; then earlier turn order. If no CDO pools exist, every player pays $300 to the Treasury. | The weakest pool's tranche holders and its CDS counterparties |
| E4-15 | Anti-Corruption Drive | "The going rate has gone up. So has the risk of paying it." | For the remainder of the game, bribery costs $400 in dirty cash instead of $200 and confers +2 Heat instead of +1. All other bribery rules are unchanged, including the once-per-round limit and the three permitted effects. | All players |
| E4-16 | Punitive Spread | "Two names in the market are quoted separately, and worse." | At the next Settlement, the two players with the largest drawn credit balances are charged credit line interest at 24% instead of 12%. All other players are charged at the prevailing rate. Tie-break for inclusion: higher drawn-to-base ratio; then earlier turn order. If fewer than two players have a drawn balance, only those with a balance are charged the punitive rate. | The two most indebted players |
| E4-17 | Clawback | "The transactions were reviewed retrospectively. All of them." | Every player pays the Treasury $200 in clean cash for each laundering transaction they have performed at any point in the game, capped at $800 per player. Players who never laundered pay nothing. | All players; bites launderers |
| E4-18 | Emergency Liquidity Facility | "The facility is open to institutions that do not appear to need it." | Every player with a drawn credit balance of $0 and no distressed debt collects $600 from the Treasury. Every other player collects $300 from the Treasury. Evaluated at the moment of the draw. | All players; rewards the deleveraged |
| E4-19 | Wealth Levy | "An emergency measure, assessed on the largest balance sheet in the room." | The player with the highest current net worth pays the Treasury 8% of that net worth, capped at $900. Net worth is computed per spec section 12 at the moment of the draw. Tie-break: higher total deed face value; then earlier turn order. | The leading player |
| E4-20 | Systemically Important | "The designation is an honour. The capital requirement is not." | The player with the greatest total obligations pays $500 to the Treasury and has their borrowing base reduced by 20% for the remainder of the game. Total obligations = drawn credit balance + peer loan principal owed as borrower + CDS notional written and outstanding + distressed debt. Any margin call arising from the base reduction is flagged at the next Settlement with the standard cure window. Tie-break: larger drawn balance; then earlier turn order. If every player's total obligations are $0, every player collects $300 from the Treasury. | The most obligated player |

**Era IV balance note.** Fourteen cards are negative to their target, two clearly positive
(E4-07, E4-18), four two-sided. Deck expected value is mildly negative as specified. The
survivability guarantee is structural rather than card-by-card: a player entering round 19 with
zero drawn balance, no written CDS, no dirty cash and Heat 0 is untouched by E4-01, E4-02,
E4-03, E4-04, E4-05, E4-06, E4-08, E4-09, E4-12, E4-13, E4-14, E4-16, E4-17 and E4-20, collects
$600 from E4-18, and is exposed only to E4-10, E4-11, E4-15 and E4-19. That is the deck telling
the table, six rounds in advance, exactly what it rewards.

---

## 5. Cross-deck summary

| | Era I | Era II | Era III | Era IV |
|---|---|---|---|---|
| Cards | 20 | 20 | 20 | 20 |
| Amount band | $50-$200 | $100-$400 | $200-$600 | $300-$900 |
| Dynamically targeted | 9 | 9 | 12 | 11 |
| Drawer-only | 6 | 4 | 3 | 0 |
| All-players | 5 | 7 | 5 | 9 |
| Net deck EV | Mildly positive | Mildly positive | Approximately neutral | Mildly negative |
| Can trigger an audit | No | No | Yes (E3-03) | Yes (E4-08) |
| Can trigger a margin call | No | No | Yes (E3-06, E3-08, E3-10) | Yes (E4-01, E4-04, E4-06, E4-09, E4-12, E4-20) |
| Can cause forced liquidation | No | No | No | Yes (E4-01, E4-04) |
| Movement cards | 0 | 0 | 0 | 0 |

---

## 6. Implementation flags

Cards below are called out because they are materially harder to implement than a cash
transfer, or because they interact with a rule the spec does not fully close. Everything not
listed here should be a straightforward reducer case.

### 6.1 Structural issue: the landing-probability fixture assumes movement cards

This is the highest-priority item in this document and it is not a card problem.

`docs/reference/landing-probabilities.md` and `tests/fixtures/landing-probabilities.json` are
derived from a Markov chain that models **16 Chance cards of which 10 move the player, and 16
Community Chest cards of which 2 move the player**, with recursive destination resolution.
These four era decks contain **zero movement cards**, deliberately, so that the deck content
does not silently invalidate the pricing model.

Both cannot be true. Squares 7, 22, 36, 2, 17 and 33 are now terminal resting squares that
never relocate a token, which redistributes probability mass across the whole board — most
visibly onto the six card squares themselves, off Jail, off Reading Railroad, off Illinois
Avenue and off GO, all of which currently absorb card-driven traffic.

Rent futures are priced off this model, and the model is the centrepiece of the design. One of
two decisions must be made before Wave 1 board work begins:

- **Re-derive.** Update `scripts/landing_probs.py` to treat all six card squares as non-moving,
  regenerate the fixture and the reference table, and accept that the published traffic-by-group
  figures in spec section 19 will shift. The qualitative conclusions (railroads lead, orange
  leads the colour groups, dark blue is traffic-poor) will almost certainly survive, but the
  numbers will not.
- **Add movement cards.** Author a movement subset into each deck matching the standard 10-of-16
  and 2-of-16 distribution. This preserves the fixture exactly but costs 12 of the 80 card slots
  and dilutes the financial character of every deck.

Recommendation is to re-derive. The fixture is cheap to regenerate; the deck slots are not.

### 6.2 Timed and conditional modifiers

A general **timed modifier** system is needed rather than one-off handling. At minimum it must
support: a scope (all players, one player, one colour group, one instrument class), a multiplier
or additive delta, an expiry expressed as a round boundary or phase boundary, and correct
ordering when two modifiers stack.

Cards requiring it: E1-08, E1-11, E1-17, E1-20, E2-01, E2-02, E2-10, E2-13, E2-14, E2-15, E2-20,
E3-06, E3-12, E4-05, E4-06, E4-10, E4-15, E4-16, E4-20.

**Stacking order must be defined explicitly.** E2-02 (+25% rent, all) and E2-14 (rent doubled,
Dark Blue and Green) can both be live in the same round if drawn in consecutive rounds. Author's
intent: rent modifiers compose multiplicatively against base rent, applied in card-draw order,
with a single round-down at the end. The same question applies to borrowing base, where E1-11 is
additive and permanent, E2-01 and E2-13 are temporary, E3-06 changes the formula itself, and
E4-06 and E4-20 change it again. Suggested canonical order: compute base from the current
formula, apply additive terms, then apply multipliers, then subtract CDS postings.

### 6.3 Entitlements — rights granted now, exercised later

These grant a player a durable, non-transferable, expiring right rather than moving money.
They need a first-class entitlement object with an owner, a use count, an expiry and a
validation hook in the relevant action handler.

E1-01 (half-price house), E1-13 (building credit drawn down across multiple purchases), E1-19
(discounted unmortgage), E2-09 (optional sale to Treasury), E2-11 (half-price venture), E2-19
(cheap zero-Heat laundering), E3-07 (margin call waiver token), E3-08 (discounted repayment
capacity, per player), E3-14 (one-off amnesty conversion, per player).

E1-13 is the most awkward of these because the credit is consumed partially across several
purchases and must interact correctly with E2-10's price reduction if both are somehow live.
They cannot both be live in practice — E1-13 expires at round 6, E2-10 cannot be drawn before
round 7 — but the engine should assert that rather than assume it.

### 6.4 Tranche face reduction and CDS interaction

E3-01, E4-03 and E4-14 all reduce or terminate tranche face. Three questions the spec does not
answer:

1. Reductions here are written against **remaining** face, not original face. Confirm this is
   the intended reading, since it makes a partially-paid tranche cheaper to write down.
2. Reducing a tranche's face makes it **easier**, not harder, to be paid in full, and therefore
   makes a CDS referencing it **less** likely to trigger. That is a real and slightly perverse
   consequence: a downgrade card protects protection sellers. It is arguably correct financially
   and definitely surprising at the table. Flag for a design decision. The alternative — treating
   a face reduction as itself a credit event — is more intuitive but makes E4-03 catastrophic.
3. CDS notional is capped at the face value of the reference obligation at origination. If face
   is subsequently reduced, does the cap follow it down? Author's assumption is no: the notional
   agreed at origination stands.

E4-14 additionally needs early-termination semantics the spec only defines for round 24: run the
waterfall on cash collected, return underlying assets unencumbered, evaluate CDS credit events
at that moment.

### 6.5 E3-09 Junior Capital Call — cash injected into a pool

Pools currently only ever receive cash from their underlying assets. This card injects $300 of
external cash directly into the pool's collected balance. Needs a `PoolCashInjected` event and a
decision on whether the injection counts toward "expected pool cashflow" for ratings purposes
(author's assumption: no, it is a one-off and ratings are unchanged).

### 6.6 E3-05 Material Non-Public Information — private reveal and deck reorder

The only card in any deck that reads and rewrites the deck itself. Requirements: reveal three
cards to exactly one player's client and not to `/table` or `/admin` displays; accept an ordering
from that player; emit a `DeckReordered` event so replay is exact. This is also the only card
whose effect is invisible in the event log's cash flows, which makes it the hardest to test.
Suggested E2E assertion: draw E3-05, reorder, then assert the next three draws come out in the
chosen order.

Note the interaction with insider trading (spec section 10), which reveals only the top card.
E3-05 is strictly stronger and also grants reordering. That is intentional.

### 6.7 E3-16 Servicer Demands Cure — a payment that is not a default trigger

Deliberately carved out of the peer loan default rules. The engine must route this obligation
through the generic shortfall path (clean cash, credit, liquidation, distressed debt) and must
**not** invoke the peer loan default handler, which would transfer collateral and permanently
halve the borrower's base. Worth a dedicated unit test asserting the negative.

### 6.8 E4-12 Fire Sale — forced mortgage with cascading consequences

Chains three rules at once: mortgaging triggers rent future make-whole (spec section 6);
mortgaging reduces borrowing base, which may itself trigger a margin call (spec section 5); and
an optioned deed may not be mortgaged at all (spec section 9), which is why the card specifies a
fallback to the next-highest eligible deed. Sequence matters. Suggested order: select eligible
deed, mortgage, pay make-whole if encumbered, apply proceeds to drawn balance, then re-evaluate
margin status at the next Settlement rather than immediately.

### 6.9 E4-04 Forced Deleveraging — mass margin call

The only card that can flag all four players simultaneously. Force-liquidation offers deeds to
"the other three players", which becomes ambiguous when several players are liquidating in the
same window. Suggested resolution: process liquidations in turn order, one player fully resolved
before the next begins, with all other three players eligible to bid each time regardless of
their own flag status.

### 6.10 Net worth evaluated mid-round

E3-17, E3-18, E4-07, E4-18 and E4-19 select on net worth at the moment of the draw, which is
mid-Movement-phase. Marking instruments to model mid-phase is well-defined but not currently
required anywhere else in the engine. Confirm the valuation service can be called outside
Settlement, and that it does so without side effects.

### 6.11 Rent attribution when a rent future is outstanding

E1-18 and E4-11 both reason about "rent collected by a player". The decks adopt one convention
throughout: **rent counts toward whoever actually receives the cash.** If a rent future is
outstanding, the holder is the collector for these purposes and the deed owner is not. Stated
here because the opposite reading is equally natural and the engine must pick one. In Era I the
distinction cannot arise, since rent futures do not unlock until Era II.

Separately, every rent modifier card (E1-08, E1-17, E2-02, E2-14, E3-12, E4-10) adjusts the
amount the landing player actually pays. Where a rent future is outstanding over the affected
property, the holder receives the modified amount, up or down. A downward modifier is **not** a
make-whole event and no compensation is owed to the holder — E4-10 states this explicitly and
the same rule governs E1-17, which is the only other downward modifier. E1-08 and E1-17 can
carry into round 7 if drawn in round 6, which is the only circumstance in which an Era I card
touches a rent future.
