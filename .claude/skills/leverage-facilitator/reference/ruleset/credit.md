# Bank credit

## Borrowing base

    base = 75% x unmortgaged deed face
         + 50% x building cost basis

Halved permanently once a player defaults on a peer loan. A CDS writer posts
30% of notional against the base while the swap is live.

## Interest

Accrues on the drawn balance every Settlement at the era rate: Era 1 5%, Era 2 6%, Era 3 8%, Era 4 12%

## Margin calls

Flagged at Settlement step 10 when the drawn balance exceeds the borrowing base.
The player has through the end of the NEXT round's Open phase to cure. Still
breached at the start of the Open phase after that, deeds are force-liquidated in
descending face-value order at a 80% floor.

The floor (80%) must exceed the advance rate (75%) or every forced sale would WIDEN the shortfall. The engine asserts this at startup.

## Distressed debt

Whatever liquidation cannot clear becomes distressed debt, compounding at 15% a round. Nobody is eliminated; they keep playing and can score negative.