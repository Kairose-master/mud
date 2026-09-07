---
name: frontier-episode
description: Run and record a Handsel Frontier economy-simulator episode (the MUD 3D game in games/handsel-frontier) and hand back the video plus a ready-to-paste description. Use when asked to simulate the Frontier economy, record an episode, make YouTube footage of the game, compare scout strategies, or run the boom/bust/steady/live scenarios.
---

# Frontier episode

One episode = one scenario run on a fresh local chain, with strategy bots
betting on a market, filmed in the client's director mode.

## Run

```sh
cd games/handsel-frontier
scripts/episode.sh <scenario> [--ticks N] [--tick-ms MS] [--bots N] [--seed N] [--steps N] [--lang ko|en]
```

Captions (intro with the simulation disclaimer, first stake/harvest,
settlements, standings every 15 ticks, a closing ranking card) are generated
from the episode's own events and burned into the recording. Korean by
default.

For evidence rather than a story, run a batch — many seeds, no camera:

```sh
cd packages/sim && pnpm batch -- --scenario bust --runs 8 --ticks 60
```

It writes `out/batch-<scenario>-<stamp>/summary.md` (mean / min / max return
and wins per strategy). Quote that table when the user asks which strategy
is actually better; quote a single episode's table only as that episode.

Scenarios: `steady` (calm market), `boom` (big bounties, most ship), `bust`
(hand-reviewed briefs, mostly refunded), `live` (the real Handsel board at
`--handsel-url`, default the testnet rehearsal, mirrored read-only; only the
scouts are simulated). `NO_RECORD=1` skips the browser and produces numbers
only. Defaults: the scenario's tick count (60–90), 1.5 s per tick, 6–8 bots,
3 bot actions per tick.

Timing: an episode takes about `ticks × tick-ms` plus a minute of setup. Run
it with a generous timeout (10 minutes is safe) — it does its own cleanup.

## Output

`out/<scenario>-<timestamp>/`:

- `video.webm` — 1920×1080 VP8. YouTube takes it as-is; there is no H.264
  encoder in Playwright's ffmpeg so no .mp4 is produced.
- `README.md` — title, the simulation disclaimer, the end-of-market table and
  the per-strategy table (ROI, hit rate, burned stakes). Paste it into the
  video description.
- `summary.json`, `ticks.csv`, `events.jsonl` — for charts or a second cut.

Send the user `video.webm` and quote `README.md`'s strategy table. The
disclaimer line in `README.md` must stay in any description: a synthetic
episode contains no real Handsel job, agent or money, and the HUD says
SIMULATION for the same reason.

## Rules

- Never point `live` at the mainnet URL unless the user explicitly asks — the
  banner will say REAL MONEY, which is correct, but the ask has to be theirs.
- The simulator never touches Handsel: it reads a public feed and writes a
  chain it owns. Do not add Handsel credentials to it.
- Strategies live in `packages/sim/src/bots.ts`, the market model in
  `packages/sim/src/market.ts`, scenarios in `packages/sim/src/scenario.ts`.
  All three are pure and tested (`pnpm --filter sim test`); change the model
  there, not in the runner.
