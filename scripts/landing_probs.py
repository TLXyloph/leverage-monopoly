#!/usr/bin/env python3
"""
Exact steady-state landing probabilities for the LEVERAGE board (v2).

Design-validation analysis (not project implementation).

WHAT CHANGED FROM v1
--------------------
v1 modelled the standard physical Chance and Community Chest decks: 16 Chance
cards of which 10 relocate the token, and 16 Community Chest cards of which 2
relocate the token, with recursive destination resolution.

LEVERAGE does not use the physical cards. They are replaced by four app-drawn
era decks of 20 cards each (docs/reference/era-decks.md), which contain
financial and state-referencing effects ONLY. The cross-deck summary in that
document records "Movement cards: 0" for every era, and no card in any of the
80 authored cards relocates a token. (E3-05 privately reveals and reorders the
top of the deck; it moves no player.)

Consequently squares 2, 7, 17, 22, 33 and 36 are now ORDINARY TERMINAL RESTING
SQUARES. A player landing there draws a card that affects money, credit, Heat
or instruments, and stays put.

*** THE PUBLISHED MONOPOLY REFERENCE TABLES NO LONGER APPLY. ***
Every widely cited landing-probability table (Illinois Ave 3.19%, Jail 6.2%,
GO 3.10%, and so on) assumes the standard card decks. Those figures are not
valid for this board and must not be used to validate this model. The
verification here is therefore self-contained: an independent linear solve, an
independent Monte Carlo simulation, and a structural decomposition of Jail.

WHAT IS UNCHANGED FROM v1
-------------------------
* Exact 2d6 distribution over the 36 ordered outcomes.
* Three consecutive doubles sends the player to Jail without moving.
* Square 30 ("Go To Jail") still sends the player to Jail and is still never a
  resting square.
* One step of the chain is ONE DIE ROLL; the reported probability is that a
  roll ends with the token resting on that square.
* State space (square, consecutive_doubles) with 40 x 3 = 120 states.

JAIL RULE
---------
A player sent to Jail pays the fine and leaves on their next turn. Rolling for
doubles to escape is NOT offered by the ruleset. In v1 this was a modelling
assumption chosen to match the common house convention; in v2 it is a
MANDATORY RULE of the game. The spec and the model now agree by construction
rather than by coincidence. Arriving in Jail still ends the turn and resets the
consecutive-doubles counter. Square 10 aggregates "In Jail" and "Just
Visiting".

Outputs: landing_probs_v2.json, landing_probs_v2.md
Usage:   python3 landing_probs_v2.py [--mc N]
"""

import json
import os
import random
import sys
import time

# --------------------------------------------------------------------------
# Board definition
# --------------------------------------------------------------------------

BOARD = [
    (0,  "Go",                     None),
    (1,  "Mediterranean Avenue",   "brown"),
    (2,  "Community Chest 1",      None),
    (3,  "Baltic Avenue",          "brown"),
    (4,  "Income Tax",             None),
    (5,  "Reading Railroad",       "railroad"),
    (6,  "Oriental Avenue",        "light blue"),
    (7,  "Chance 1",               None),
    (8,  "Vermont Avenue",         "light blue"),
    (9,  "Connecticut Avenue",     "light blue"),
    (10, "Jail / Just Visiting",   None),
    (11, "St. Charles Place",      "pink"),
    (12, "Electric Company",       "utility"),
    (13, "States Avenue",          "pink"),
    (14, "Virginia Avenue",        "pink"),
    (15, "Pennsylvania Railroad",  "railroad"),
    (16, "St. James Place",        "orange"),
    (17, "Community Chest 2",      None),
    (18, "Tennessee Avenue",       "orange"),
    (19, "New York Avenue",        "orange"),
    (20, "Free Parking",           None),
    (21, "Kentucky Avenue",        "red"),
    (22, "Chance 2",               None),
    (23, "Indiana Avenue",         "red"),
    (24, "Illinois Avenue",        "red"),
    (25, "B&O Railroad",           "railroad"),
    (26, "Atlantic Avenue",        "yellow"),
    (27, "Ventnor Avenue",         "yellow"),
    (28, "Water Works",            "utility"),
    (29, "Marvin Gardens",         "yellow"),
    (30, "Go To Jail",             None),
    (31, "Pacific Avenue",         "green"),
    (32, "North Carolina Avenue",  "green"),
    (33, "Community Chest 3",      None),
    (34, "Pennsylvania Avenue",    "green"),
    (35, "Short Line",             "railroad"),
    (36, "Chance 3",               None),
    (37, "Park Place",             "dark blue"),
    (38, "Luxury Tax",             None),
    (39, "Boardwalk",              "dark blue"),
]

N = 40
JAIL = 10
GO_TO_JAIL = 30

# Card squares. In v2 these are ordinary resting squares: a card is drawn from
# the current era deck, but the token does not move.
CARD_SQUARES = (2, 7, 17, 22, 33, 36)

COLOR_GROUPS = [
    "brown", "light blue", "pink", "orange",
    "red", "yellow", "green", "dark blue",
    "railroad", "utility",
]
GROUP_LABELS = {
    "brown": "Brown", "light blue": "Light Blue", "pink": "Pink",
    "orange": "Orange", "red": "Red", "yellow": "Yellow",
    "green": "Green", "dark blue": "Dark Blue",
    "railroad": "Railroads", "utility": "Utilities",
}


# --------------------------------------------------------------------------
# Square resolution. The ONLY relocating square left on the board is 30.
# Returns (final_square, jailed_flag). `jailed_flag` distinguishes being SENT
# to Jail (turn over, doubles counter reset) from merely resting on square 10.
# --------------------------------------------------------------------------

def resolve(sq):
    if sq == GO_TO_JAIL:
        return JAIL, True
    return sq, False


# --------------------------------------------------------------------------
# Transition matrix over (square, consecutive_doubles)
# --------------------------------------------------------------------------

NUM_D = 3
NUM_STATES = N * NUM_D


def sidx(sq, d):
    return sq * NUM_D + d


def build_transition():
    """P[i][j] = P(next state j | current state i); one die roll per step."""
    P = [[0.0] * NUM_STATES for _ in range(NUM_STATES)]
    roll_p = 1.0 / 36.0

    for sq in range(N):
        for d in range(NUM_D):
            i = sidx(sq, d)
            for die1 in range(1, 7):
                for die2 in range(1, 7):
                    is_double = die1 == die2

                    # Third consecutive double -> Jail, no movement.
                    if is_double and d == 2:
                        P[i][sidx(JAIL, 0)] += roll_p
                        continue

                    raw = (sq + die1 + die2) % N
                    dest, jailed = resolve(raw)
                    nd = 0 if jailed else (d + 1 if is_double else 0)
                    P[i][sidx(dest, nd)] += roll_p
    return P


# --------------------------------------------------------------------------
# Stationary distribution: two independent solvers
# --------------------------------------------------------------------------

def power_iteration(P, tol=1e-15, max_iter=200000):
    n = len(P)
    pi = [1.0 / n] * n
    for it in range(max_iter):
        nxt = [0.0] * n
        for i, pi_i in enumerate(pi):
            if pi_i == 0.0:
                continue
            row = P[i]
            for j, pij in enumerate(row):
                if pij:
                    nxt[j] += pi_i * pij
        s = sum(nxt)
        nxt = [v / s for v in nxt]
        diff = sum(abs(a - b) for a, b in zip(nxt, pi))
        pi = nxt
        if diff < tol:
            break
    return pi, it + 1


def numpy_solve(P):
    """Exact linear solve of pi (P - I) = 0 subject to sum(pi) = 1."""
    try:
        import numpy as np
    except ImportError:
        return None
    M = np.array(P, dtype=float)
    n = M.shape[0]
    A = np.vstack([M.T - np.eye(n), np.ones(n)])
    b = np.zeros(n + 1)
    b[-1] = 1.0
    pi, *_ = np.linalg.lstsq(A, b, rcond=None)
    return pi.tolist()


def monte_carlo(n_rolls, seed=20260803):
    """Independent simulation of the same rules; returns per-square frequency."""
    rng = random.Random(seed)
    counts = [0] * N
    pos = 0
    d = 0
    randint = rng.randint
    for _ in range(n_rolls):
        a = randint(1, 6)
        b = randint(1, 6)
        if a == b and d == 2:
            pos, d = JAIL, 0
        else:
            raw = (pos + a + b) % N
            if raw == GO_TO_JAIL:
                pos, d = JAIL, 0
            else:
                pos = raw
                d = d + 1 if a == b else 0
        counts[pos] += 1
    return [c / n_rolls for c in counts]


def jail_decomposition(pi):
    """Break the Jail probability down by arrival route."""
    src = {
        "Dice onto square 10 (Just Visiting)": 0.0,
        "Square 30 (Go To Jail)": 0.0,
        "Third consecutive double": 0.0,
    }
    for sq in range(N):
        for d in range(NUM_D):
            w = pi[sidx(sq, d)]
            if w == 0.0:
                continue
            for die1 in range(1, 7):
                for die2 in range(1, 7):
                    p = w / 36.0
                    if die1 == die2 and d == 2:
                        src["Third consecutive double"] += p
                        continue
                    raw = (sq + die1 + die2) % N
                    if raw == JAIL:
                        src["Dice onto square 10 (Just Visiting)"] += p
                    elif raw == GO_TO_JAIL:
                        src["Square 30 (Go To Jail)"] += p
    return src


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------

def main(argv):
    here = os.path.dirname(os.path.abspath(__file__))

    n_mc = 40_000_000
    if "--mc" in argv:
        n_mc = int(argv[argv.index("--mc") + 1])

    P = build_transition()
    for i, row in enumerate(P):
        assert abs(sum(row) - 1.0) < 1e-12, f"row {i} sums to {sum(row)}"

    pi_states, iters = power_iteration(P)
    pi_np = numpy_solve(P)
    max_dev = (max(abs(a - b) for a, b in zip(pi_states, pi_np))
               if pi_np is not None else None)

    square_p = [sum(pi_states[sidx(sq, d)] for d in range(NUM_D))
                for sq in range(N)]
    total = sum(square_p)
    jail_src = jail_decomposition(pi_states)

    t0 = time.time()
    mc = monte_carlo(n_mc) if n_mc > 0 else None
    mc_secs = time.time() - t0
    mc_worst = mc_worst_sq = None
    if mc is not None:
        devs = [(abs(square_p[i] - mc[i]), i) for i in range(N)]
        mc_worst, mc_worst_sq = max(devs)

    # ---------------- v1 comparison ----------------
    v1_path = os.path.join(here, "landing_probs.json")
    v1 = None
    if os.path.exists(v1_path):
        with open(v1_path) as fh:
            v1 = {r["index"]: r["probability"] for r in json.load(fh)}

    # ---------------- JSON ----------------
    records = []
    for idx, name, group in BOARD:
        rec = {"index": idx, "name": name, "group": group,
               "probability": square_p[idx]}
        if v1 is not None:
            rec["probability_v1"] = v1[idx]
            rec["delta"] = square_p[idx] - v1[idx]
        records.append(rec)

    json_path = os.path.join(here, "landing_probs_v2.json")
    with open(json_path, "w") as fh:
        json.dump(records, fh, indent=2)
        fh.write("\n")

    # ---------------- groups ----------------
    group_totals = {g: 0.0 for g in COLOR_GROUPS}
    group_members = {g: [] for g in COLOR_GROUPS}
    for idx, name, group in BOARD:
        if group in group_totals:
            group_totals[group] += square_p[idx]
            group_members[group].append(idx)

    v1_group_totals = None
    if v1 is not None:
        v1_group_totals = {g: 0.0 for g in COLOR_GROUPS}
        for idx, name, group in BOARD:
            if group in v1_group_totals:
                v1_group_totals[group] += v1[idx]

    props = [r for r in records if r["group"] is not None]
    hi = max(props, key=lambda r: r["probability"])
    lo = min(props, key=lambda r: r["probability"])
    spread = hi["probability"] - lo["probability"]
    ratio = hi["probability"] / lo["probability"]

    v1_spread = v1_ratio = v1_hi = v1_lo = None
    if v1 is not None:
        v1_props = [(v1[r["index"]], r["name"]) for r in props]
        v1_hi = max(v1_props)
        v1_lo = min(v1_props)
        v1_spread = v1_hi[0] - v1_lo[0]
        v1_ratio = v1_hi[0] / v1_lo[0]

    monopolies = ["brown", "light blue", "pink", "orange",
                  "red", "yellow", "green", "dark blue"]
    per_sq = {g: group_totals[g] / len(group_members[g]) for g in COLOR_GROUPS}
    best_mono = max(monopolies, key=lambda g: per_sq[g])
    best_set_total = max(COLOR_GROUPS, key=lambda g: group_totals[g])

    ordered = sorted(records, key=lambda r: -r["probability"])

    # ---------------- Markdown ----------------
    L = []
    L.append("# LEVERAGE Landing Probabilities (v2 - no movement cards)")
    L.append("")
    L.append("Exact stationary distribution of a Markov chain over "
             "`(square, consecutive_doubles)` (40 x 3 = 120 states). "
             "One step = one die roll; the probability is that a roll ends "
             "with the token resting on that square.")
    L.append("")
    L.append("## Why this supersedes v1")
    L.append("")
    L.append("v1 modelled the standard physical decks (10 of 16 Chance cards "
             "and 2 of 16 Community Chest cards relocate the token). "
             "LEVERAGE does not use those cards. The four authored era decks "
             "(`docs/reference/era-decks.md`) contain financial and "
             "state-referencing effects only; the cross-deck summary records "
             "**Movement cards: 0** for every era.")
    L.append("")
    L.append("Squares 2, 7, 17, 22, 33 and 36 are therefore **ordinary "
             "terminal resting squares**. A player landing there draws an era "
             "card that affects money, credit, Heat or instruments, and stays "
             "put.")
    L.append("")
    L.append("> **The published Monopoly reference tables no longer apply.** "
             "Every widely cited landing-probability table (Illinois Ave "
             "3.19%, Jail 6.2%, GO 3.10%) assumes the standard card decks. "
             "Those figures are not valid for this board and must not be used "
             "to validate this model. Verification below is self-contained.")
    L.append("")
    L.append("## Rules modelled")
    L.append("")
    L.append("- Two fair d6, exact 2d6 distribution over 36 ordered outcomes.")
    L.append("- Three consecutive doubles sends the player to Jail without "
             "moving.")
    L.append("- Square 30 (\"Go To Jail\") sends the player to Jail and is "
             "never a resting square (probability exactly 0). It is the only "
             "relocating square left on the board.")
    L.append("- **Jail: pay to leave immediately. This is a mandatory rule of "
             "the ruleset, not a modelling assumption.** Rolling for doubles "
             "to escape is not offered. A player sent to Jail pays the fine "
             "and leaves on their next turn. In v1 this convention was an "
             "assumption chosen to match common house rules; here the spec "
             "and the model agree by construction rather than by coincidence. "
             "Arriving in Jail still ends the turn and resets the "
             "consecutive-doubles counter.")
    L.append("- Square 10 aggregates \"In Jail\" and \"Just Visiting\".")
    L.append("")
    L.append("## All 40 squares, by probability (descending)")
    L.append("")
    if v1 is not None:
        L.append("| Rank | Square | Name | Group | Probability | % | "
                 "v1 % | Delta (pp) |")
        L.append("| ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |")
        for rank, r in enumerate(ordered, 1):
            grp = GROUP_LABELS.get(r["group"], "-")
            L.append(f"| {rank} | {r['index']} | {r['name']} | {grp} | "
                     f"{r['probability']:.6f} | {r['probability']*100:.4f}% | "
                     f"{r['probability_v1']*100:.4f}% | "
                     f"{r['delta']*100:+.4f} |")
    else:
        L.append("| Rank | Square | Name | Group | Probability | % |")
        L.append("| ---: | ---: | --- | --- | ---: | ---: |")
        for rank, r in enumerate(ordered, 1):
            grp = GROUP_LABELS.get(r["group"], "-")
            L.append(f"| {rank} | {r['index']} | {r['name']} | {grp} | "
                     f"{r['probability']:.6f} | {r['probability']*100:.4f}% |")
    L.append("")
    L.append(f"**Total: {total:.12f}**")
    L.append("")

    L.append("## Aggregate probability by color group")
    L.append("")
    if v1_group_totals is not None:
        L.append("| Group | Squares | Total | % | Per-square avg % | "
                 "v1 total % | Delta (pp) |")
        L.append("| --- | --- | ---: | ---: | ---: | ---: | ---: |")
        for g in COLOR_GROUPS:
            m = group_members[g]
            t = group_totals[g]
            L.append(f"| {GROUP_LABELS[g]} | {', '.join(map(str, m))} | "
                     f"{t:.6f} | {t*100:.4f}% | {per_sq[g]*100:.4f}% | "
                     f"{v1_group_totals[g]*100:.4f}% | "
                     f"{(t - v1_group_totals[g])*100:+.4f} |")
    else:
        L.append("| Group | Squares | Total | % | Per-square avg % |")
        L.append("| --- | --- | ---: | ---: | ---: |")
        for g in COLOR_GROUPS:
            m = group_members[g]
            t = group_totals[g]
            L.append(f"| {GROUP_LABELS[g]} | {', '.join(map(str, m))} | "
                     f"{t:.6f} | {t*100:.4f}% | {per_sq[g]*100:.4f}% |")
    L.append("")
    prop_total = sum(group_totals.values())
    L.append(f"All 28 purchasable properties combined: {prop_total:.6f} "
             f"({prop_total*100:.4f}%)")
    L.append("")
    L.append(f"- Strongest three-square colour group per square: "
             f"**{GROUP_LABELS[best_mono]}** at {per_sq[best_mono]*100:.4f}% "
             f"per square.")
    L.append(f"- Highest-traffic set overall by total: "
             f"**{GROUP_LABELS[best_set_total]}** at "
             f"{group_totals[best_set_total]*100:.4f}%.")
    L.append("")

    L.append("## Traffic spread across purchasable properties")
    L.append("")
    L.append("| Metric | v2 | v1 |")
    L.append("| --- | ---: | ---: |")
    L.append(f"| Highest-traffic property | {hi['name']} "
             f"{hi['probability']*100:.4f}% | "
             + (f"{v1_hi[1]} {v1_hi[0]*100:.4f}%" if v1 else "-") + " |")
    L.append(f"| Lowest-traffic property | {lo['name']} "
             f"{lo['probability']*100:.4f}% | "
             + (f"{v1_lo[1]} {v1_lo[0]*100:.4f}%" if v1 else "-") + " |")
    L.append(f"| Spread (percentage points) | {spread*100:.4f} | "
             + (f"{v1_spread*100:.4f}" if v1 else "-") + " |")
    L.append(f"| Ratio highest:lowest | {ratio:.4f}x | "
             + (f"{v1_ratio:.4f}x" if v1 else "-") + " |")
    L.append("")

    L.append("## Shape of the distribution")
    L.append("")
    L.append("With card movement removed, the board carries exactly one "
             "structure, driven entirely by the two Jail mechanics:")
    L.append("")
    L.append(f"- **Mass source at square 10.** Jail absorbs "
             f"{square_p[JAIL]*100:.2f}% of all rolls, roughly twice the "
             f"2.50% uniform baseline.")
    L.append(f"- **Echo peak at square {(JAIL+7)%N} (Jail + 7).** Everything "
             f"leaving Jail re-enters the board one modal 2d6 roll later, so "
             f"square {(JAIL+7)%N} is the busiest non-Jail square at "
             f"{square_p[(JAIL+7)%N]*100:.4f}%. The echo decays smoothly "
             f"across the Orange, Red and Yellow ranks.")
    L.append(f"- **Shadow trough at square {(GO_TO_JAIL+7)%N} (Go To Jail + "
             f"7).** Square 30 is never a resting square, so it feeds nobody, "
             f"and the deficit lands one modal roll later. Square "
             f"{(GO_TO_JAIL+7)%N} is the quietest square on the board at "
             f"{square_p[(GO_TO_JAIL+7)%N]*100:.4f}%.")
    L.append("")
    L.append("This is why Orange and Red still lead and why Dark Blue is "
             "still traffic-poor: those positions are now determined purely "
             "by distance from Jail, not by card destinations. Orange's "
             "strength was previously attributed to Jail traffic, and that "
             "attribution is now the *entire* explanation rather than one "
             "contributor among several.")
    L.append("")
    L.append("## Validation")
    L.append("")
    L.append("Where Jail's probability comes from (contributions per die "
             "roll, summing to the square-10 total):")
    L.append("")
    L.append("| Arrival route | Probability | % |")
    L.append("| --- | ---: | ---: |")
    for label, val in jail_src.items():
        L.append(f"| {label} | {val:.6f} | {val*100:.4f}% |")
    L.append(f"| **Total** | **{sum(jail_src.values()):.6f}** | "
             f"**{sum(jail_src.values())*100:.4f}%** |")
    L.append("")
    L.append("Independent confirmations:")
    L.append("")
    L.append("- Probabilities sum to "
             f"{total:.12f}.")
    if max_dev is not None:
        L.append(f"- Power iteration and a numpy linear solve of "
                 f"`pi (P - I) = 0` agree to {max_dev:.2e}.")
    if mc is not None:
        L.append(f"- A {n_mc:,}-roll Monte Carlo simulation of the same rules "
                 f"reproduced every square to within {mc_worst*100:.4f} "
                 f"percentage points (worst: square {mc_worst_sq}), "
                 f"consistent with sampling noise.")
    L.append("- Every row of the 120x120 transition matrix sums to 1.")
    L.append("- No comparison against published Monopoly tables is made or is "
             "valid, since those assume the standard movement decks.")
    L.append("")

    md_path = os.path.join(here, "landing_probs_v2.md")
    with open(md_path, "w") as fh:
        fh.write("\n".join(L))

    # ---------------- Console ----------------
    print("LEVERAGE landing probabilities v2 -- NO MOVEMENT CARDS")
    print("Card squares 2/7/17/22/33/36 are ordinary terminal resting squares.")
    print("JAIL: pay to leave immediately is a MANDATORY RULE here, not an "
          "assumption.")
    print("Published Monopoly reference tables DO NOT APPLY to this board.")
    print()
    print(f"Power iteration converged in {iters} iterations.")
    if max_dev is not None:
        print(f"numpy linear-solve cross-check: max deviation = {max_dev:.3e}")
    if mc is not None:
        print(f"Monte Carlo {n_mc:,} rolls in {mc_secs:.1f}s: "
              f"max deviation {mc_worst*100:.4f} pp (square {mc_worst_sq})")
    print()

    print("All 40 squares (descending):")
    hdr = f"{'#':>3}  {'Sq':>3}  {'Name':<24} {'v2 %':>8}"
    if v1 is not None:
        hdr += f" {'v1 %':>8} {'delta pp':>9}"
    print(hdr)
    for rank, r in enumerate(ordered, 1):
        line = (f"{rank:>3}  {r['index']:>3}  {r['name']:<24} "
                f"{r['probability']*100:>7.4f}%")
        if v1 is not None:
            line += (f" {r['probability_v1']*100:>7.4f}% "
                     f"{r['delta']*100:>+8.4f}")
        print(line)
    print()

    print("Jail probability, by arrival route:")
    for label, val in jail_src.items():
        print(f"  {label:<40} {val*100:>7.4f}%")
    print(f"  {'TOTAL':<40} {sum(jail_src.values())*100:>7.4f}%")
    print()

    print("Aggregate by color group:")
    hdr = f"{'Group':<12} {'Sqs':>4} {'total %':>9} {'per-sq %':>9}"
    if v1_group_totals is not None:
        hdr += f" {'v1 tot %':>9} {'delta pp':>9}"
    print(hdr)
    for g in COLOR_GROUPS:
        t = group_totals[g]
        line = (f"{GROUP_LABELS[g]:<12} {len(group_members[g]):>4} "
                f"{t*100:>8.4f}% {per_sq[g]*100:>8.4f}%")
        if v1_group_totals is not None:
            line += (f" {v1_group_totals[g]*100:>8.4f}% "
                     f"{(t - v1_group_totals[g])*100:>+9.4f}")
        print(line)
    print()

    print("Load-bearing design claims:")
    print(f"  Strongest 3-square colour group per square: "
          f"{GROUP_LABELS[best_mono]} ({per_sq[best_mono]*100:.4f}%/sq) "
          f"-- {'UNCHANGED' if best_mono == 'orange' else 'CHANGED, SPEC NEEDS REWRITE'}")
    print(f"  Highest-traffic set overall by total: "
          f"{GROUP_LABELS[best_set_total]} "
          f"({group_totals[best_set_total]*100:.4f}%) "
          f"-- {'UNCHANGED' if best_set_total == 'railroad' else 'CHANGED, SPEC NEEDS REWRITE'}")
    print()

    print("Property traffic spread:")
    print(f"  v2: {hi['name']} {hi['probability']*100:.4f}% .. "
          f"{lo['name']} {lo['probability']*100:.4f}%  "
          f"spread {spread*100:.4f} pp, ratio {ratio:.4f}x")
    if v1 is not None:
        print(f"  v1: {v1_hi[1]} {v1_hi[0]*100:.4f}% .. "
              f"{v1_lo[1]} {v1_lo[0]*100:.4f}%  "
              f"spread {v1_spread*100:.4f} pp, ratio {v1_ratio:.4f}x")
        verdict = "NARROWS" if spread < v1_spread else "WIDENS"
        print(f"  Spread {verdict}: "
              f"{v1_spread*100:.4f} pp -> {spread*100:.4f} pp "
              f"({(spread/v1_spread - 1)*100:+.1f}%)")
    print()

    # ---------------- Checks ----------------
    checks = []
    checks.append(("probabilities sum to 1.0", abs(total - 1.0) < 1e-9,
                   f"sum = {total:.12f}"))
    checks.append(("Go To Jail (30) has zero probability",
                   square_p[GO_TO_JAIL] < 1e-12, f"{square_p[GO_TO_JAIL]:.3e}"))
    checks.append(("all probabilities non-negative",
                   all(p >= -1e-15 for p in square_p), ""))
    checks.append(("Jail decomposition reconciles with chain marginal",
                   abs(sum(jail_src.values()) - square_p[JAIL]) < 1e-12,
                   f"{sum(jail_src.values())*100:.4f}% vs "
                   f"{square_p[JAIL]*100:.4f}%"))
    checks.append(("Jail is still the single most-landed-on square",
                   ordered[0]["index"] == JAIL,
                   f"top = {ordered[0]['name']} "
                   f"{ordered[0]['probability']*100:.4f}%"))
    if max_dev is not None:
        checks.append(("power iteration matches numpy linear solve",
                       max_dev < 1e-9, f"max dev = {max_dev:.3e}"))
    if mc is not None:
        checks.append((f"Monte Carlo ({n_mc:,} rolls) agrees within 0.02 pp",
                       mc_worst < 2e-4, f"max dev = {mc_worst*100:.4f} pp"))
    # With card movement gone, the only remaining structure is the wave driven
    # by the two Jail mechanics: a mass source at square 10, an echo peaking
    # one modal roll (7) later at square 17, and a shadow troughing 7 past the
    # empty Go To Jail square at 37.
    echo_peak = (JAIL + 7) % N
    shadow_trough = (GO_TO_JAIL + 7) % N
    non_jail = [(square_p[i], i) for i in range(N) if i not in (JAIL, GO_TO_JAIL)]
    resting = [(square_p[i], i) for i in range(N) if i != GO_TO_JAIL]
    checks.append((f"highest non-Jail square is the echo peak at Jail+7 "
                   f"(square {echo_peak})",
                   max(non_jail)[1] == echo_peak,
                   f"max at square {max(non_jail)[1]} "
                   f"({max(non_jail)[0]*100:.4f}%)"))
    checks.append((f"lowest resting square is the shadow trough at "
                   f"GoToJail+7 (square {shadow_trough})",
                   min(resting)[1] == shadow_trough,
                   f"min at square {min(resting)[1]} "
                   f"({min(resting)[0]*100:.4f}%)"))

    # The card-movement depression is gone. Note we deliberately do NOT assert
    # that the card squares are unremarkable: square 17 sits exactly on the
    # Jail+7 echo crest and squares 7 and 36 sit in the Go-To-Jail shadow, so
    # their levels are set by board geometry, not by card behaviour. What must
    # be true is that none of them is still depressed below the board's own
    # shadow trough, and that every one of them rose relative to v1.
    trough = min(square_p[i] for i in range(N) if i != GO_TO_JAIL)
    checks.append(("no card square is depressed below the board's shadow "
                   "trough (card-movement drain removed)",
                   all(square_p[c] >= trough - 1e-15 for c in CARD_SQUARES),
                   f"trough {trough*100:.4f}%; cards "
                   + ", ".join(f"{c}:{square_p[c]*100:.3f}%"
                               for c in CARD_SQUARES)))
    if v1 is not None:
        checks.append(("all six card squares gained traffic vs v1",
                       all(square_p[c] > v1[c] for c in CARD_SQUARES),
                       ", ".join(f"{c}:{(square_p[c]-v1[c])*100:+.3f}pp"
                                 for c in CARD_SQUARES)))

    if v1 is not None:
        checks.append(("property traffic spread narrowed vs v1",
                       spread < v1_spread,
                       f"{v1_spread*100:.4f} pp -> {spread*100:.4f} pp"))

    print("Sanity checks:")
    ok = True
    for label, passed, detail in checks:
        ok = ok and passed
        print(f"  [{'PASS' if passed else 'FAIL'}] {label}"
              + (f"  ({detail})" if detail else ""))
    print()
    print("ALL CHECKS PASSED" if ok else "SOME CHECKS FAILED")
    print()
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
