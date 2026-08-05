# Securitization

Pool three or more instruments you own — peer loan notes, rent futures, deed options —
and carve them into senior, mezzanine and equity tranches. Senior and mezzanine take
a stated face; equity is the residual.

## Waterfall

Cash the pool collects each round pays senior in full, then mezzanine, then equity.

## Ratings

    score = coverage x (1 - 0.25 x concentration)
                     / (1 + 0.1 x leverage)

Leverage is capped at 5 before it enters the weighted mean.

Bands: AAA at 2.2, AA at 1.5, A at 1.2, BBB at 1, BB at 0.8, B at 0.6, otherwise CCC.

## Credit default swaps

A buyer pays a per-round premium; the seller pays the notional if the reference
defaults. The seller posts 30% of notional against
their borrowing base for as long as the swap is live. Notional may not exceed the
face of what it references — no naked over-insurance.