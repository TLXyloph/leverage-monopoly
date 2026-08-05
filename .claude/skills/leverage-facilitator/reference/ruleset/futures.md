# Rent futures

The owner of a deed sells the right to collect its rent for a window of rounds.
Windows may not exceed 8 rounds.

Valuation is a Markov landing model, not a guess:

    expected hits per round = landing probability x 3 obligors x 1.19 for the extra rolls doubles generate

Every valuation carries a 10%/90% outcome band beside the expected value.

## Encumbrance

A live future follows the deed. Mortgaging an encumbered deed owes the holder the
contract's remaining expected value (a make-whole) and terminates it. Forced
liquidation extinguishes the contract and adds the make-whole to the shortfall — so a
distressed player cannot become judgment-proof by writing contracts.