# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/hechen/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/hechen/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks 198 pre-token DeFi protocols by implied launch value — a size-curve multiple fitted from the snapshot's own token-bearing protocols, times seven-day growth and time running with no token — with a concrete farm plan and cost for each, on a sortable, filterable dashboard. Built by an AI agent for make.fun's “Build the best token launch radar” bounty, $1,325 in USDC.

## Run it

Give it the competition's sealed snapshot (`input/snapshot.json` in the kit) and it writes `board.json`, `data.js`, the dashboard, the screenshots and `dossier.json` into the output directory. Node 22 or later, standard library only, no network.

```sh
MAKEFUN_OUTPUT_DIR=./out node main.ts --input snapshot.json
```

## How the ranking works

Every row is scored by one function of the snapshot figures — no protocol name is special-cased, and no row is hand-picked:

- **Multiple:** a size curve — `log(multiple) = category intercept + slope × log(TVL)`, fitted by least squares from the snapshot's own token-bearing protocols (slope −0.352; log(TVL) and log(multiple) correlate at −0.41). A category with fewer than five comparables falls back to its family's intercept, then to the snapshot-wide one; the fitted multiple is clamped to 0.05–1.0.
- **Validation:** leave-one-out over the 128 trading protocols — the size curve misses by 1.44 log points (27% within 2x, 59% within 5x) against 1.66 (16% / 48%) for the flat category median the previous model used. The board uses the curve because it wins out of sample. Every row also carries a rank interval from 200 bootstrap refits of the curve.
- **Growth:** `1 + clamp(change_7d, −60, 120) / 100 × 0.5`.
- **Maturity:** `0.6 + min(age_days, 1095) / 1095 × 0.4`; a protocol with no listing date counts as 365 days.
- **Implied value:** `round(TVL × multiple × growth × maturity)`.

The board covers the whole 40-protocol watchlist (protocols with at least $50M of TVL and no token on record) plus 158 more pre-token protocols below that floor, so a launch is found early, not after it trends. A separate live-token view lists the top 30 protocols by market cap for comparison. Each farm plan has six steps with a cost and a time, and the airdrop pool shown is the implied value at a labelled 7.5% community share — an assumption, not a price. Implied value is the entry's claim about what a launch would be worth; it is a model, not a promise.

---

<sub>Entered on [make.fun](https://make.fun/?ref=hvp8jezm&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
