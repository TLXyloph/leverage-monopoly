# LEVERAGE — Era Cards

**Eighty cards, twenty per era. Print, cut along the rules, keep in four separate face-down
piles.** Companion to [`leverage-tabletop-rulebook.md`](leverage-tabletop-rulebook.md).

The physical Chance and Community Chest cards are **not used**. A token resting on square 7, 22 or
36 (Chance) or 2, 17 or 33 (Community Chest) causes the facilitator to draw the top card of the
**current era's** deck and read it aloud. **No card in any deck moves any token.**

Expect roughly **three draws per round** — the six card squares take 14.89% of all rolls between
them. A 20-card deck will be largely consumed in its six rounds. **If a deck runs out, shuffle its
discards and continue.**

Each card below has:

- a **title and quote** — read both aloud, they carry the era's mood
- an **Effect** — the mechanical result
- a **Targets** line — who it hits, which also determines bribery-cancellability
- a **FAC** line where the facilitator needs tie-breaks, fallbacks or a lookup

Cut so that the FAC line stays on the card. It is for the facilitator's eyes, but hiding it costs
more time than it saves.

---

## Standing conventions

These apply to every card and are not restated on individual cards.

### Timing

| Phrase | Means |
|---|---|
| **immediately** | At the instant of the draw, before the drawer's turn continues |
| **this round** | From the draw until the end of this round's Settlement |
| **the next round** | The whole of round N+1, all four phases |
| **the next Open phase** | The Open phase of round N+1 |
| **the next Settlement** | The Settlement of the **current** round — it has not run yet when the card is drawn |
| **for the remainder of the era** | Until the Settlement of round 6 / 12 / 18 / 24 completes |
| **for the remainder of the game** | Until scoring |

### Money

- All amounts are **clean cash** unless the card says "dirty cash".
- **All percentage results round down to the nearest $1.**
- **No card may take a player below $0 clean cash.** Where a card demands a payment the player
  cannot meet, follow the standard obligation path: clean cash, then credit-line headroom, then
  the remainder becomes **distressed debt at 15% per round**. Card penalties are **not** margin
  events and never trigger a liquidation auction by themselves.
- "To the Treasury" and "from the Treasury" move against the Treasury balance, which may go
  negative.
- Where a card forgives debt, **the Treasury absorbs the loss** — the player's liability falls and
  the Treasury falls by the same amount.

### Targeting and tie-breaks

Selection is evaluated **at the moment of the draw**, against state as it stands then. Every card
that picks a player dynamically states its own tie-break chain, and **the final tie-break in every
case is earlier position in turn order**, which is fixed at setup and therefore always resolves.

Where a card's condition matches nobody, the card states an explicit fallback. **There are no dead
cards.**

### Bribery

> A card is **bribery-cancellable if and only if its Targets line resolves to exactly one
> player.** Cards targeting all players, or a set of two or more, are not cancellable — even if
> only one player is actually bitten.

Bribery costs $200 in dirty cash, +1 Heat, once per round per player. It cannot be used during
Settlement once an audit has already resolved.

### Era gating

No card references an instrument before its era unlocks. Era I references only deeds, building,
mortgages, trading and the bank credit line. Era II adds peer loans, rent futures, ventures,
laundering and bribery. Era III adds pools, tranches, CDS, deed options and insider trading, and
is the first era in which a card may trigger an audit.

### Stacking

Two live rent modifiers **compose multiplicatively against base rent**, applied in the order the
cards were drawn, with a single round-down at the end. For borrowing base: compute from the
current formula, apply additive terms, then multipliers, then subtract CDS postings.

---
---

# ERA I — RECOVERY
### rounds 1–6 · prevailing rate 5%

*Quiet, small, mostly beneficial. Amounts $50–$200. Nothing in this deck can cripple a player in
the opening six rounds. Its job is to teach the draw mechanic, seed the first building decisions,
and make the credit line feel safe enough to use.*

---

### E1-01 · ZONING VARIANCE APPROVED
> *"The board has approved your variance. Build while the ink is wet."*

**Effect.** You receive a one-time half-price house voucher. The next single house you purchase
during this or the next Open phase costs **50% of the standard house price** for that colour
group. Full-group, unmortgaged and even-build rules still apply.

**Targets:** Drawer.
**FAC:** Expires unused at the end of the next Open phase. Not transferable. Note it on the
register.

---

### E1-02 · RECONSTRUCTION GRANT
> *"Federal reconstruction funds are directed to under-improved parcels."*

**Effect.** The player with the **fewest buildings** collects **$150** from the Treasury.

**Targets:** One player.
**FAC:** Building count = houses + (5 × hotels). Tie-break: lower total deed face value; then
earlier turn order.

---

### E1-03 · VICTORY BOND COUPON
> *"A wartime issue matures. Modest, and on time."*

**Effect.** **Every player** collects **$75** from the Treasury.

**Targets:** All players.

---

### E1-04 · TITLE SEARCH FEE
> *"Counsel has traced the encumbrances. Counsel bills for it."*

**Effect.** Pay the Treasury **$50 for each mortgaged deed you hold**, to a maximum of $200.

**Targets:** Drawer.
**FAC:** No mortgaged deeds means no payment and no compensation.

---

### E1-05 · FREIGHT HAULAGE CONTRACT
> *"Rolling stock is scarce. The rails quote accordingly."*

**Effect.** The player owning the **most railroads** collects **$50 per railroad they own** from
the Treasury.

**Targets:** One player.
**FAC:** Only one player collects. Tie-break: lower total deed face value; then earlier turn
order.

---

### E1-06 · PRIME RATE CONCESSION
> *"The discount window opens a crack."*

**Effect.** You pay **no credit line interest** at the next Settlement; the Treasury forgoes it.

**Targets:** Drawer.
**FAC:** If the drawer's drawn balance is $0 at that Settlement, they collect **$100** from the
Treasury instead.

---

### E1-07 · LUMBER SHORTAGE
> *"Framing timber is rationed. Everyone pays for the privilege of having built."*

**Effect.** **Every player** pays the Treasury **$25 per house and $125 per hotel** they own,
capped at **$100 per player**.

**Targets:** All players.
**FAC:** Players with no buildings pay nothing.

---

### E1-08 · STREETCAR LINE EXTENDED
> *"The new line runs through the cheap end of town."*

**Effect.** For the whole of the **next round**, rent collected on **Brown and Light Blue**
properties is increased by **50%**.

**Targets:** All players; benefits Brown and Light Blue owners.
**FAC:** Applies to the rent the landing player actually pays. Reverts automatically at the end of
the next round — put it on the register's live-effects line.

---

### E1-09 · ASSESSOR'S REAPPRAISAL
> *"The rolls are revised. Some frontage is now worth more than its owner claimed."*

**Effect.** The player with the **highest** total unmortgaged deed face value pays **$150** to the
Treasury. The player with the **lowest** collects **$100** from the Treasury.

**Targets:** Two players.
**FAC:** If the same player would be both, they pay **$50 net**. Tie-break for highest: more
buildings; then earlier turn order. For lowest: fewer buildings; then earlier turn order.

---

### E1-10 · UTILITY FRANCHISE RENEWED
> *"The municipality renews both franchises without argument."*

**Effect.** Every player owning at least one utility collects **$100 per utility owned** from the
Treasury. **Mortgaged utilities count.**

**Targets:** All utility owners.
**FAC:** If neither utility is owned, the drawer collects $100.

---

### E1-11 · CREDIT COMMITTEE SITS
> *"Your file is approved without discussion. Note the date."*

**Effect.** Your borrowing base is **permanently increased by a flat $150** for the remainder of
the game.

**Targets:** Drawer.
**FAC:** This is an **additive** term applied after the standard base calculation and is not
affected by mortgaging. Write it on the player's sheet in the "card uplift" line.

---

### E1-12 · BACK TAXES REFUNDED
> *"An arithmetic error in the county's favour, corrected."*

**Effect.** **Every player** collects **$25 from the Treasury for each unmortgaged deed** they
hold, capped at **$150 per player**.

**Targets:** All players.

---

### E1-13 · CONTRACTOR EXTENDS CREDIT
> *"The builder wants the whole block and will discount to get it."*

**Effect.** The player holding the **most complete unmortgaged colour groups** receives a **$200
building credit**, applied automatically against their next house and hotel purchases until
exhausted.

**Targets:** One player.
**FAC:** Expires at the end of round 6 if unused. Tie-break: fewer total buildings; then lower
total deed face value; then earlier turn order. **If no player holds a complete unmortgaged colour
group, every player instead collects $75 from the Treasury.**

---

### E1-14 · BANK EXAMINER CALLS
> *"The examiner would like to see the balance reduced. This week."*

**Effect.** The player with the **largest drawn credit balance** immediately repays **$150** of it
from clean cash.

**Targets:** One player.
**FAC:** If they hold less than $150 clean cash, they repay all the clean cash they hold and no
more. **This never creates distressed debt.** Tie-break: higher drawn-to-base ratio; then earlier
turn order. If nobody has a drawn balance, the drawer collects $100 from the Treasury.

---

### E1-15 · INSURANCE SETTLEMENT
> *"The claim is paid without a fight. Enjoy the novelty."*

**Effect.** Collect **$200** from the Treasury.

**Targets:** Drawer.

---

### E1-16 · CHIMNEY FIRE
> *"Sparks in the flue. The inspector is unsympathetic."*

**Effect.** Pay the Treasury **$25 per house and $100 per hotel** you own, capped at **$200**.

**Targets:** Drawer.
**FAC:** No buildings, no payment.

---

### E1-17 · RENT CONTROL BOARD CONVENES
> *"The board finds current increases 'not justified by circumstance'."*

**Effect.** For the whole of the **next round**, rent collected on any property carrying **3 or
more houses** (a hotel counts as 5) is **reduced by 25%**.

**Targets:** All players; bites the most-developed.
**FAC:** Applies to the rent the landing player actually pays. A rent future over such a property
receives the reduced amount — **this is not a make-whole event and no compensation is owed.**
Reverts at the end of the next round.

---

### E1-18 · TENANTS' PETITION
> *"Signatures gathered on the busiest street, delivered to the quietest."*

**Effect.** The player who has **collected the most rent so far this era** pays **$100** to the
player who has collected the **least**.

**Targets:** Two players.
**FAC:** Measured from the start of round 1. **Rent counts toward whoever actually received the
cash** — if a rent future is outstanding, the holder is the collector, not the deed owner.
Tie-break for most: higher total deed face value; then earlier turn order. For least: lower total
deed face value; then earlier turn order. If the same player is both, no effect.

---

### E1-19 · MORTGAGE AMNESTY
> *"The lender will take face value to clear the file."*

**Effect.** The player holding the **most mortgaged deeds** may, during the next Open phase,
unmortgage **one** deed of their choice at **50% of face** instead of the standard 55%.

**Targets:** One player.
**FAC:** Expires at the end of the next Open phase. Not transferable. Tie-break: higher total
mortgaged face value; then earlier turn order. If no player holds a mortgaged deed, the drawer
collects $100 from the Treasury.

---

### E1-20 · WAGE INDEXATION
> *"Pay packets are adjusted upward. Briefly."*

**Effect.** For the whole of the **next round**, GO pays **$450** instead of $350 on passing or
landing.

**Targets:** All players.
**FAC:** Reverts at the end of the next round. *(Corrected: the source deck said "$300 instead of
$200", written before GO was set to $350. The +$100 delta is preserved.)*

---

> **Era I balance note.** Eleven cards are net positive to their target, four net negative, five
> redistributive or conditional. The largest single loss possible is $200 (E1-16 at full
> development, which is unreachable in Era I). Deck expected value is mildly positive, which is
> correct for an era whose purpose is to establish that drawing a card is not frightening.

---
---

# ERA II — EXPANSION
### rounds 7–12 · prevailing rate 6%

*The boom. Cheap credit, favourable terms, rent upside, and vice that looks free because audits do
not begin until round 13. Amounts $100–$400. Every temptation in this deck is a bill arriving in
Era III or IV.*

---

### E2-01 · SYNDICATED FACILITY ARRANGED
> *"Three banks want the paper. Take the bigger number."*

**Effect.** Your borrowing base is **multiplied by 1.25** for the remainder of Era II.

**Targets:** Drawer.
**FAC:** Applies after the standard base calculation and after any additive term from E1-11.
Reverts at the completion of the round 12 Settlement. Any margin call arising from the reversion
is flagged normally with the standard cure window.

---

### E2-02 · BOOM-TIME RENTS
> *"Asking rents are up across every class of property."*

**Effect.** For the whole of the **next round**, all rent collected on any landing is increased by
**25%**.

**Targets:** All players.
**FAC:** Rent futures capture the increase. Reverts at the end of the next round.

---

### E2-03 · SPECULATIVE FRENZY
> *"Buyers are queuing for anything with a roof on it."*

**Effect.** The owner of the **most-developed complete colour group** collects **$300** from the
Treasury.

**Targets:** One player.
**FAC:** "Most-developed" = the complete **unmortgaged** colour group carrying the greatest
building count, hotel = 5 houses. Tie-break: higher combined deed face value of that group; then
earlier turn order. **If no player holds a complete unmortgaged colour group, every player collects
$100.**

---

### E2-04 · NEW MONEY ENTERS THE MARKET
> *"Capital arrives from somewhere and asks few questions."*

**Effect.** **Every player** collects **$150** from the Treasury.

**Targets:** All players.

---

### E2-05 · VICE SQUAD RESHUFFLE
> *"The precinct is reorganised. Files are misplaced."*

**Effect.** **Every player reduces Heat by 2**, to a minimum of 0.

**Targets:** All players.

---

### E2-06 · A FRIEND IN THE PRECINCT
> *"An envelope is left for you. It is not from the bank."*

**Effect.** Receive **$200 dirty cash** and **+1 Heat**.

**Targets:** Drawer.
**FAC:** Dirty cash is worth $0 at scoring and is fully seizable in an audit from round 13.

---

### E2-07 · NUMBERS RUNNER RECRUITED
> *"The book is expanding. It expands toward money."*

**Effect.** The player currently holding the **most dirty cash** receives **$150 dirty cash** and
**+1 Heat**.

**Targets:** One player.
**FAC:** Tie-break: higher current Heat; then earlier turn order. If no player holds dirty cash,
the drawer receives $150 dirty and +1 Heat instead.

---

### E2-08 · CORRESPONDENT BANK WRITES DOWN
> *"A rival institution takes the loss to keep the relationship."*

**Effect.** The player with the **largest drawn credit balance** has **$250** of it forgiven by the
Treasury.

**Targets:** One player.
**FAC:** The Treasury balance falls by $250. Tie-break: higher drawn-to-base ratio; then earlier
turn order. If no player has a drawn balance, every player collects $100.

---

### E2-09 · TREASURY BIDS FOR PAPER
> *"The Treasury is buying contracts to steady the market. Above the model."*

**Effect.** The holder of the outstanding **rent future with the highest remaining value** may,
during the next Open phase, sell that contract to the **Treasury for 120% of that value**.

**Targets:** One player.
**FAC:** Value = `rent at current development × H × rounds left in window`, from rulebook table
5.3. Optional; expires at the end of the next Open phase. If sold, the contract terminates
immediately and rent reverts to the deed owner for the remaining window. Tie-break: higher
remaining value; then earlier turn order. If no rent futures are outstanding, the drawer collects
$200 from the Treasury.

---

### E2-10 · CONSTRUCTION BOOM
> *"Every yard in the city is pouring foundations."*

**Effect.** For the whole of the **next round**, house and hotel purchase prices are **reduced by
25%** for all players.

**Targets:** All players.
**FAC:** Even-build and supply limits unchanged. Reverts at the end of the next round.

---

### E2-11 · DISCREET INTRODUCTION
> *"You are given a name and a time. Nothing is written down."*

**Effect.** You may launch **any one venture** during this or the next Open phase at **50% of its
stated cost**.

**Targets:** Drawer.
**FAC:** **Heat is charged in full** at the normal rate for that venture. One venture only;
expires at the end of the next Open phase.

---

### E2-12 · LOAN SYNDICATION FEE
> *"Arranging other people's debt is the safest business in town."*

**Effect.** The player who has lent the **most total outstanding peer loan principal** collects
**$200** from the Treasury.

**Targets:** One player.
**FAC:** Tie-break: greater number of outstanding notes held; then earlier turn order. If no peer
loans are outstanding, every player collects $100.

---

### E2-13 · WAREHOUSE LINE OPENED
> *"They will fund the position first and document it later."*

**Effect.** The **most leveraged player** receives a temporary borrowing base uplift of **$400**,
expiring at the completion of the round 12 Settlement.

**Targets:** One player.
**FAC:** "Most leveraged" = highest drawn ÷ base, considering only players with a drawn balance
above $0. Tie-break: larger drawn balance; then earlier turn order. If no player has a drawn
balance, the drawer receives the uplift. Any margin call arising from the expiry at round 12 is
flagged normally.

---

### E2-14 · WATERFRONT REDEVELOPMENT
> *"The plan is announced with a model and a ribbon."*

**Effect.** For the whole of the **next round**, rent collected on **Dark Blue and Green**
properties is **doubled**.

**Targets:** All players; benefits Dark Blue and Green owners.
**FAC:** A rent future over such a property captures the doubling. Reverts at the end of the next
round.

---

### E2-15 · PAYROLL TAX HOLIDAY
> *"A relief measure, and an election coming."*

**Effect.** For the whole of the **next round**, GO pays **$550** instead of $350 on passing or
landing.

**Targets:** All players.
**FAC:** Reverts at the end of the next round. *(Corrected: the source deck said "$400 instead of
$200". The +$200 delta is preserved.)*

---

### E2-16 · EXCISE INSPECTION
> *"The inspector counts the premises, not the takings."*

**Effect.** **Every player** pays the Treasury **$100 for each venture they currently have
active**.

**Targets:** All players; bites venture operators.
**FAC:** Speakeasy, being one-shot, is never active and is never counted. No active ventures, no
payment.

---

### E2-17 · DISTRESS FINANCING AVAILABLE
> *"Someone is always willing to lend to the desperate."*

**Effect.** The player holding the **least clean cash** collects **$250** from the Treasury.

**Targets:** One player.
**FAC:** Tie-break: lower net worth; then earlier turn order.

---

### E2-18 · BUILDING PERMIT BACKLOG
> *"The department is overwhelmed, and charges for the inconvenience."*

**Effect.** The player with the **highest building count** pays the Treasury **$25 per house and
$150 per hotel** they own, capped at **$400**.

**Targets:** One player.
**FAC:** Building count = houses + (5 × hotels). Tie-break: higher total deed face value; then
earlier turn order. If no player owns a building, no effect.

---

### E2-19 · AN ACCOMMODATING CASHIER
> *"He does not look at the notes. He looks at the clock."*

**Effect.** You may perform **one laundering transaction** during this or the next Open phase at a
flat **10% haircut** instead of the standard schedule, and that transaction costs **0 Heat**.

**Targets:** Drawer.
**FAC:** It still counts against the once-per-Open-phase laundering limit. Expires at the end of
the next Open phase.

---

### E2-20 · RATE DIP
> *"The prevailing rate softens for a month. Nobody expects it to last."*

**Effect.** At the **next Settlement only**, credit line interest is charged to all players at
**4%** instead of 6%.

**Targets:** All players.
**FAC:** $4 per $100 drawn. Peer loan rates are unaffected, being privately negotiated.

---

> **Era II balance note.** Deck expected value is mildly positive. The deck is deliberately loaded
> with cards that raise a player's leverage ceiling (E2-01, E2-08, E2-13) or make vice cheap
> (E2-06, E2-07, E2-11, E2-19). Nothing here can trigger an audit, because audit checks do not
> begin until round 13. **The Heat accumulated here is the Era III bill.**

---
---

# ERA III — FINANCIALIZATION
### rounds 13–18 · prevailing rate 8%

*Volatile and two-sided. Ratings actions, tranche revaluations, credit line adjustments, the first
audit pressure, and insider information. Winners and losers in the same deck. Amounts $200–$600.*

---

### E3-01 · RATINGS DOWNGRADE
> *"The agency revises its assumptions. It does not revise its fees."*

**Effect.** For **every outstanding CDO pool**, the mezzanine tranche's **remaining face** is
reduced by **30%**.

**Targets:** All mezzanine holders; benefits all equity holders.
**FAC:** Cash already distributed is unaffected. The reduction increases the residual available to
equity in all subsequent waterfalls. Recompute ratings on request. Skip any pool with no mezzanine
face remaining. **If no pools exist, every player collects $200 from the Treasury.**
*Note the perversity and say it out loud: reducing a tranche's face makes it easier to be paid in
full, so a downgrade card protects whoever wrote CDS on it.*

---

### E3-02 · LIQUIDITY BACKSTOP
> *"The window is opened for the worst paper in the market, which is the point."*

**Effect.** The holder of the outstanding tranche with the **lowest rating score** collects **$400**
from the Treasury.

**Targets:** One player.
**FAC:** Compute scores per rulebook 5.6. Tie-break: lower score; then lower remaining face; then
earlier turn order. If no tranches are outstanding, every player collects $200.

---

### E3-03 · EARLY AUDIT SWEEP
> *"Selected files are pulled ahead of schedule."*

**Effect.** **Every player at Heat 5 or more is audited immediately** — all dirty cash seized, fine
of **$100 × Heat** in clean cash, Heat resets to 0.

**Targets:** All players; bites Heat 5+.
**FAC:** This does **not** replace or consume the normal audit check at the coming Settlement. If
nobody is at Heat 5+, no effect. Not bribery-cancellable.

---

### E3-04 · COMPLIANCE CONSULTANT RETAINED
> *"He is expensive, and he is worth it, and you should have hired him sooner."*

**Effect.** You may pay **$300 clean cash to reduce your Heat by 3**, to a minimum of 0. If you
decline, or hold less than $300, your Heat instead reduces by **1** at no cost.

**Targets:** Drawer.
**FAC:** The choice is made immediately at the draw.

---

### E3-05 · MATERIAL NON-PUBLIC INFORMATION
> *"You are told three things before they happen. You are told not to say who told you."*

**Effect.** You privately view the **top three cards** of the current era deck and return them in
**any order you choose**. **+1 Heat.**

**Targets:** Drawer.
**FAC:** Take the player away from the table. Do not reveal the cards to anyone else, and do not
react to them. Strictly stronger than insider trading, which reveals only the top card — that is
intentional.

---

### E3-06 · CREDIT LINE REVIEW
> *"The lending base is recalculated on a stricter formula. Effective immediately."*

**Effect.** For the remainder of Era III, **every player's borrowing base is 60% of unmortgaged
deed face value plus 40% of building cost**, instead of the standard 75% and 50%.

**Targets:** All players.
**FAC:** Reverts at the completion of the round 18 Settlement. Any margin call arising is flagged
at the next Settlement with the standard one-Open-phase cure window. *(Corrected: the source deck
said "40% plus 25%, instead of 50%", written against a rejected 50%/25% base. The intent — a
roughly one-fifth tightening — is preserved.)*

---

### E3-07 · COVENANT WAIVER NEGOTIATED
> *"The lender agrees to look away once. Once."*

**Effect.** The **most leveraged player** receives one **waiver token**. The next time that player
is flagged for a margin call, their cure deadline is extended by **one full round** instead of
ending at the next Open phase, and the token is consumed.

**Targets:** One player.
**FAC:** "Most leveraged" = highest drawn ÷ base, considering only players with a drawn balance
above $0. Tie-break: larger drawn balance; then earlier turn order. If no player has a drawn
balance, the drawer receives it. Expires unused at the completion of the round 18 Settlement. Not
transferable. **Write it on the register.**

---

### E3-08 · REFINANCING WINDOW
> *"Balances retire at a discount for one week only."*

**Effect.** During the next Open phase, **every player** may retire drawn credit balance at a
**10% discount**: each **$100 of clean cash retires $110 of drawn balance**, up to a maximum of
**$600 of balance retired per player**.

**Targets:** All players.
**FAC:** The Treasury absorbs the difference. Unused capacity expires at the end of the next Open
phase.

---

### E3-09 · JUNIOR CAPITAL CALL
> *"The equity is asked to support its own structure."*

**Effect.** The holder of the **equity tranche of the pool with the largest expected cashflow**
pays **$300 into that pool immediately**.

**Targets:** One player.
**FAC:** The cash is added to the pool's collected balance and distributed through the standard
waterfall at the next Settlement — **meaning senior and mezzanine are paid first**. It does not
count toward the pool's expected cashflow for ratings. Tie-break: larger senior face; then earlier
turn order. If no pools exist, every player collects $200 from the Treasury.

---

### E3-10 · COUNTERPARTY DOUBT
> *"Protection sellers are asked to show they can pay."*

**Effect.** Every player who has written at least one outstanding CDS must post an **additional 15%
of each written notional** against their borrowing base **for the remainder of the game**, bringing
the total posting to **45% of notional**.

**Targets:** All CDS writers.
**FAC:** Any margin call arising is flagged at the next Settlement with the standard cure window.
If no CDS are outstanding, every player collects $200 from the Treasury.

---

### E3-11 · OPTION REPRICING
> *"A drafting error in the standard form is discovered and, unusually, honoured."*

**Effect.** **Every outstanding deed option's strike price is reduced by $100**, to a minimum of
$0.

**Targets:** All option holders; harms all option writers.
**FAC:** Expiry rounds and premiums already paid are unchanged. Rewrite the strike on each option
card. If no deed options are outstanding, the drawer collects $300 from the Treasury.

---

### E3-12 · TRAFFIC STUDY PUBLISHED
> *"The busiest corners of the city are, it emerges, the busiest corners of the city."*

**Effect.** For the whole of the **next round**, rent collected on **Orange and Red** properties is
**doubled**.

**Targets:** All players; benefits Orange and Red owners.
**FAC:** Rent futures over those properties capture the doubling. Reverts at the end of the next
round.

---

### E3-13 · REGULATORY FINE
> *"The source of the deposit could not be satisfactorily explained."*

**Effect.** The player holding the **most dirty cash** pays a fine of **$300 in clean cash** and
gains **+1 Heat**.

**Targets:** One player.
**FAC:** **Dirty cash is not seized by this card.** Tie-break: higher current Heat; then earlier
turn order. If no player holds dirty cash, the drawer collects $200 from the Treasury.

---

### E3-14 · VOLUNTARY DISCLOSURE PROGRAMME
> *"Come forward now and the penalty is merely arithmetic."*

**Effect.** During the next Open phase, **every player** may convert up to **$400 of dirty cash to
clean at a flat 40% haircut**, at **0 Heat cost**, and **reduces Heat by 1** if they do so.

**Targets:** All players.
**FAC:** This conversion does **not** count against the once-per-Open-phase laundering limit. The
offer expires at the end of the next Open phase.

---

### E3-15 · THE AGENCY IS CALLED TO TESTIFY
> *"The rating was arithmetically correct. That was the difficulty."*

**Effect.** The **originator** of the outstanding tranche with the **highest rating score** pays
**$400** to the Treasury.

**Targets:** One player.
**FAC:** Compute scores per rulebook 5.6. Tie-break: higher remaining face across that pool's
tranches; then earlier turn order. If no tranches are outstanding, every player collects $200.

---

### E3-16 · SERVICER DEMANDS CURE
> *"One additional payment, in advance, as a demonstration of good faith."*

**Effect.** The peer loan borrower with the **largest total outstanding principal** immediately
pays **one round's interest** on that principal, to the note holder, **in addition** to the payment
due at the coming Settlement.

**Targets:** One player.
**FAC:** **This payment is explicitly NOT a peer loan interest obligation for default purposes.**
Failure to pay does not constitute default, does not transfer collateral, and does not halve the
borrowing base. Any shortfall becomes distressed debt. Tie-break: larger outstanding principal;
then higher per-round rate; then earlier turn order. If no peer loans are outstanding, no effect.

---

### E3-17 · WINDFALL PROFITS LEVY
> *"A one-off measure, as these always are."*

**Effect.** The player with the **highest current net worth** pays the Treasury **5% of that net
worth**, capped at **$600**.

**Targets:** One player.
**FAC:** Run the scoring worksheet quickly; ignore instrument marks under $50. Tie-break: higher
clean cash; then earlier turn order.

---

### E3-18 · DISTRESSED FUND TAKES A POSITION
> *"Someone is buying the worst assets in the city, cheaply."*

**Effect.** The player with the **lowest current net worth** collects **$400** from the Treasury.

**Targets:** One player.
**FAC:** **If that player carries distressed debt, the $400 reduces the distressed debt balance
instead of being paid as cash**; any excess above the balance is paid as clean cash. Tie-break:
lower clean cash; then earlier turn order.

---

### E3-19 · WIRETAP TRANSCRIPTS RELEASED
> *"The transcripts name the frequent callers. They also name the abstainers, favourably."*

**Effect.** The player who has taken the **most dirty actions this game** gains **+2 Heat**. The
player who has taken the **fewest** reduces Heat by **2**, to a minimum of 0.

**Targets:** Two players.
**FAC:** Dirty actions = ventures launched + laundering transactions + briberies + insider trades,
counted cumulatively across the whole game. Keep a running tally on the register from round 7.
Tie-break for most: higher current Heat; then earlier turn order. For fewest: lower current Heat;
then earlier turn order. If the same player is both, no effect.

---

### E3-20 · ORIGINATION FEE RECOGNISED
> *"The structure is complete, and the fee is booked before the first payment is due."*

**Effect.** The **originator** of the CDO pool with the **largest expected cashflow** collects
**$300** from the Treasury.

**Targets:** One player.
**FAC:** Tie-break: larger total senior plus mezzanine face; then earlier turn order. If no pools
exist, every player collects $200.

---

> **Era III balance note.** Seven cards are clearly positive to their target, eight clearly
> negative, five two-sided or redistributive. Deck expected value is approximately neutral with
> wide variance, which is the point: **this is the era where the table stops being able to predict
> what a draw does.** Three cards (E3-06, E3-08, E3-10) can cause margin calls; all route through
> the standard flag-and-cure path rather than immediate liquidation.

---
---

# ERA IV — RECKONING
### rounds 19–24 · prevailing rate 12%

*Punitive and targeted. Downgrades, covenant breaches, forced deleveraging, audit sweeps and margin
call triggers. Amounts $300–$900. A player who deleveraged and cooled off during Era III finds this
deck survivable and occasionally profitable. A player who did not finds it relentless.*

---

### E4-01 · COVENANT BREACH
> *"A technical default. The technicality is that you promised not to."*

**Effect.** The **most leveraged player is flagged for a margin call immediately**, whether or not
their drawn balance currently exceeds their borrowing base. To cure, they must reduce drawn balance
to **at most 80% of borrowing base** by the end of the next Open phase.

**Targets:** One player.
**FAC:** Failing which, the standard force-liquidation procedure runs at the **80%-of-face floor**
(rulebook 4.2). "Most leveraged" = highest drawn ÷ base, considering only players with a drawn
balance above $0. Tie-break: larger drawn balance; then earlier turn order. If no player has a
drawn balance, no effect. *(Corrected: the source deck said "70%-of-face floor".)*

---

### E4-02 · AUDIT SWEEP
> *"The accounts are examined. Forty per cent is not returned."*

**Effect.** The player holding the **most dirty cash forfeits 40% of it**. Heat is unchanged.

**Targets:** One player.
**FAC:** This does **not** consume the round's normal audit check. Tie-break: higher current Heat;
then earlier turn order. **If no player holds dirty cash**, the player with the highest Heat pays
$300 clean to the Treasury instead — tie-broken by lower net worth, then earlier turn order. If all
players are at Heat 0, no effect.

---

### E4-03 · DOWNGRADE CASCADE
> *"Every structure in the market is remarked at once, which is how it always happens."*

**Effect.** For **every outstanding CDO pool**, the senior tranche's **remaining face** is reduced
by **15%** and the mezzanine tranche's **remaining face** by **40%**.

**Targets:** All senior and mezzanine holders; benefits all equity holders.
**FAC:** Cash already distributed is unaffected. Both reductions increase the residual available to
equity in subsequent waterfalls. **If no pools exist, every player pays $300 to the Treasury.**

---

### E4-04 · FORCED DELEVERAGING
> *"The facility is repriced to a ratio nobody was running at."*

**Effect.** At the next Settlement, **every player whose drawn balance exceeds 60% of their
borrowing base** is flagged for a margin call and must reduce drawn balance to **at most 60% of
base** by the end of the following Open phase.

**Targets:** All players; bites the levered.
**FAC:** Failing which, the standard force-liquidation procedure runs. Players at or below 60% are
unaffected. **This is the only card that can flag all four players at once** — if it does, resolve
liquidations one player at a time in turn order, fully finishing each before starting the next,
with all other three players eligible to bid every time regardless of their own flag status.

---

### E4-05 · RATE SHOCK
> *"The rate moves six points in an afternoon."*

**Effect.** At the **next Settlement only**, credit line interest is charged to all players at
**18%** instead of 12%.

**Targets:** All players.
**FAC:** $18 per $100 drawn. Where a player cannot pay from clean cash, the interest capitalises as
normal. Peer loan rates are unaffected.

---

### E4-06 · COLLATERAL HAIRCUT
> *"Improvements are no longer considered good security."*

**Effect.** For the remainder of the game, **buildings contribute 20% of building cost** to the
borrowing base instead of 50%. Deed contribution is unchanged at 75% of unmortgaged face.

**Targets:** All players.
**FAC:** Any margin call arising is flagged at the next Settlement with the standard cure window.
*(Corrected: the source deck said "10% instead of 25%", written against a rejected base formula.
The intent — a 60% cut to the building contribution — is preserved.)*

---

### E4-07 · DEBT RESTRUCTURING AGREED
> *"The creditors accept that some of it was never coming back."*

**Effect.** The player with the **largest distressed debt balance** has **$400 of it forgiven** by
the Treasury.

**Targets:** One player.
**FAC:** Tie-break: lower net worth; then earlier turn order. **If no player carries distressed
debt**, the player with the lowest net worth collects $400 from the Treasury instead — tie-broken
by lower clean cash, then earlier turn order.

---

### E4-08 · FRAUD CHARGES FILED
> *"The charges are filed jointly, which is efficient for everyone but the accused."*

**Effect.** **Every player at Heat 4 or more is audited immediately** — all dirty cash seized, fine
of **$100 × Heat** in clean cash, Heat resets to 0. Each such player **additionally pays a $300
penalty** to the Treasury.

**Targets:** All players; bites Heat 4+.
**FAC:** Does not consume the round's normal audit check. If nobody is at Heat 4+, no effect. Not
bribery-cancellable.

---

### E4-09 · PROTECTION SELLERS CALLED
> *"Everyone who wrote protection is asked to prove they can honour it."*

**Effect.** Every player who has written at least one outstanding CDS must **post an additional 20%
of each written notional** against their borrowing base immediately, for the remainder of the game.

**Targets:** All CDS writers.
**FAC:** **Stacks with E3-10** — a writer hit by both posts 65% of notional. Any margin call
arising is flagged at the next Settlement with the standard cure window. If no CDS are outstanding,
every player pays $300 to the Treasury.

---

### E4-10 · RENT COLLAPSE
> *"Tenants are leaving. The ones who stay are renegotiating."*

**Effect.** For the whole of the **next round**, all rent collected on any landing is **reduced by
50%**.

**Targets:** All players; bites landlords and rent future holders.
**FAC:** A rent future over any property receives only the reduced amount. **This is not a
make-whole event and no compensation is owed to the holder.** Reverts at the end of the next round.

---

### E4-11 · TENANT DEFAULTS
> *"The best collections in the city turn out to have been the most concentrated."*

**Effect.** The player who has **collected the most rent this era** pays **$500** to the Treasury.

**Targets:** One player.
**FAC:** **Rent received through a rent future counts toward the receiving player, not the deed
owner.** Tie-break: higher total deed face value; then earlier turn order. If no rent has been
collected this era, no effect.

---

### E4-12 · FIRE SALE
> *"The lender's patience and the borrower's options expire on the same afternoon."*

**Effect.** The player with the **largest drawn credit balance** must **immediately mortgage their
highest-face-value unmortgaged deed**, receiving 50% of face in clean cash, applied first to reduce
their drawn balance.

**Targets:** One player.
**FAC:** Sequence: select eligible deed → mortgage → pay any rent-future make-whole → apply
proceeds to drawn balance → re-evaluate margin status at the next Settlement, not immediately.
**An optioned deed may not be mortgaged** — skip to the next-highest eligible deed. **A developed
deed must be stripped first**, even-build across its group, at 50% sell-back. If the player holds
no eligible unmortgaged deed, no effect. Tie-break: higher drawn-to-base ratio; then earlier turn
order.

---

### E4-13 · OPTIONS ACCELERATED
> *"All outstanding rights are brought forward to Friday."*

**Effect.** **Every outstanding deed option's expiry is brought forward to the end of the next Open
phase.** Holders exercise by paying the strike as normal, or the option lapses worthless.

**Targets:** All option holders and writers.
**FAC:** Premiums are not refunded. Rewrite the expiry on each option card. If no deed options are
outstanding, every player pays $300 to the Treasury.

---

### E4-14 · POOL WOUND DOWN
> *"The trustee terminates the weakest structure rather than fund it further."*

**Effect.** The outstanding CDO pool with the **lowest coverage ratio terminates at the end of the
next Settlement**. Its waterfall runs one final time on cash collected to date and no further; the
underlying assets return to their owners unencumbered.

**Targets:** The weakest pool's tranche holders and its CDS counterparties.
**FAC:** **Any tranche of that pool short of its remaining face at termination is a credit event
and triggers every CDS referencing it.** Equity receives only what remains after senior and
mezzanine, which will typically be nothing. Coverage ratio = expected pool cashflow ÷ senior +
mezzanine face. Tie-break: lower coverage; then larger senior face; then earlier turn order. If no
pools exist, every player pays $300 to the Treasury.

---

### E4-15 · ANTI-CORRUPTION DRIVE
> *"The going rate has gone up. So has the risk of paying it."*

**Effect.** For the remainder of the game, **bribery costs $400 in dirty cash** instead of $200 and
confers **+2 Heat** instead of +1.

**Targets:** All players.
**FAC:** All other bribery rules unchanged, including the once-per-round limit and the three
permitted effects.

---

### E4-16 · PUNITIVE SPREAD
> *"Two names in the market are quoted separately, and worse."*

**Effect.** At the next Settlement, the **two players with the largest drawn credit balances** are
charged credit line interest at **24%** instead of 12%.

**Targets:** Two players.
**FAC:** $24 per $100 drawn. All other players pay the prevailing rate. Tie-break for inclusion:
higher drawn-to-base ratio; then earlier turn order. If fewer than two players have a drawn
balance, only those with a balance are charged the punitive rate.

---

### E4-17 · CLAWBACK
> *"The transactions were reviewed retrospectively. All of them."*

**Effect.** **Every player** pays the Treasury **$200 in clean cash for each laundering transaction
they have performed at any point in the game**, capped at **$800 per player**.

**Targets:** All players; bites launderers.
**FAC:** Players who never laundered pay nothing. Keep a laundering tally on the register from
round 7 — you will need it here and for E3-19.

---

### E4-18 · EMERGENCY LIQUIDITY FACILITY
> *"The facility is open to institutions that do not appear to need it."*

**Effect.** Every player with a drawn credit balance of **$0 and no distressed debt** collects
**$600** from the Treasury. **Every other player collects $300.**

**Targets:** All players; rewards the deleveraged.
**FAC:** Evaluated at the moment of the draw.

---

### E4-19 · WEALTH LEVY
> *"An emergency measure, assessed on the largest balance sheet in the room."*

**Effect.** The player with the **highest current net worth** pays the Treasury **8% of that net
worth**, capped at **$900**.

**Targets:** One player.
**FAC:** Run the scoring worksheet quickly; ignore instrument marks under $50. Tie-break: higher
total deed face value; then earlier turn order.

---

### E4-20 · SYSTEMICALLY IMPORTANT
> *"The designation is an honour. The capital requirement is not."*

**Effect.** The player with the **greatest total obligations** pays **$500** to the Treasury and has
their **borrowing base reduced by 20% for the remainder of the game**.

**Targets:** One player.
**FAC:** Total obligations = drawn credit balance + peer loan principal owed as borrower + CDS
notional written and outstanding + distressed debt. Any margin call arising from the base reduction
is flagged at the next Settlement with the standard cure window. Tie-break: larger drawn balance;
then earlier turn order. If every player's total obligations are $0, every player collects $300
from the Treasury.

---

> **Era IV balance note.** Fourteen cards are negative to their target, two clearly positive
> (E4-07, E4-18), four two-sided. Deck expected value is mildly negative, as specified.
>
> **The survivability guarantee is structural, not card-by-card.** A player entering round 19 with
> zero drawn balance, no written CDS, no dirty cash and Heat 0 is untouched by E4-01, E4-02,
> E4-03, E4-04, E4-05, E4-06, E4-08, E4-09, E4-12, E4-13, E4-14, E4-16, E4-17 and E4-20, collects
> $600 from E4-18, and is exposed only to E4-10, E4-11, E4-15 and E4-19. **That is the deck telling
> the table, six rounds in advance, exactly what it rewards.**

---
---

## Cross-deck summary

| | Era I | Era II | Era III | Era IV |
|---|---|---|---|---|
| Cards | 20 | 20 | 20 | 20 |
| Amount band | $50–$200 | $100–$400 | $200–$600 | $300–$900 |
| Dynamically targeted | 9 | 9 | 12 | 11 |
| Drawer-only | 6 | 4 | 3 | 0 |
| All-players | 5 | 7 | 5 | 9 |
| Net deck EV | Mildly positive | Mildly positive | ~Neutral | Mildly negative |
| Can trigger an audit | No | No | Yes (E3-03) | Yes (E4-08) |
| Can trigger a margin call | No | No | Yes (E3-06, E3-08, E3-10) | Yes (E4-01, E4-04, E4-06, E4-09, E4-12, E4-20) |
| Can cause forced liquidation | No | No | No | Yes (E4-01, E4-04) |
| **Movement cards** | **0** | **0** | **0** | **0** |

**Movement cards are zero on purpose.** The landing-probability model that prices every rent
future in this game assumes all six card squares are ordinary resting squares. Adding a single
movement card silently invalidates every figure in rulebook table 5.3. If you write your own
cards, do not move anyone.

## Cards that need a lookup rather than a payment

Keep the rulebook open at these sections when these cards come up:

| Card | Look at |
|---|---|
| E2-09 Treasury Bids for Paper | Rulebook 5.3 — rent future value |
| E3-02, E3-15 | Rulebook 5.6 — rating score |
| E3-09, E3-20, E4-14 | The pool card — expected cashflow, written at creation |
| E3-17, E3-18, E4-07, E4-18, E4-19 | Part 7 — scoring worksheet, run fast |
| E3-19, E4-17 | The register's dirty-action and laundering tallies |

## Corrections applied to the source deck

Five cards in `docs/reference/era-decks.md` carry numbers written before the money supply and
borrowing base were retuned. The versions above are corrected, and each correction is noted on its
card.

| Card | Was | Now |
|---|---|---|
| E1-20 | GO $300 instead of $200 | **GO $450 instead of $350** |
| E2-15 | GO $400 instead of $200 | **GO $550 instead of $350** |
| E3-06 | base 40% + 25%, "instead of 50%" | **base 60% + 40%, instead of 75% and 50%** |
| E4-06 | buildings 10% instead of 25% | **buildings 20% instead of 50%** |
| E4-01 | 70%-of-face liquidation floor | **80%-of-face floor** |
</content>
