# Settlement order

Run every round, in exactly this order. Step 9 can trigger step 10 in the same pass:
an audit fine that capitalises onto the credit line can push a player over their
borrowing base and be flagged in the same Settlement.

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

On round 24 only, three more steps follow: all pools terminate, every tranche short
of face triggers its referencing CDS, then scoring runs.