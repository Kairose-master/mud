# games/handsel-frontier — guide for an AI working here

A MUD onchain 3D game where the Handsel labor market is the map. `README.md`
is how to run it, `DESIGN.md` is why it is shaped this way. The Handsel side
of the bridge is `docs/frontier.md` in Kairose-master/handsel.

| I want to… | look in |
|---|---|
| Change a rule (spawn, move, scout, harvest) | `packages/contracts/src/systems/*.sol`, then `pnpm --filter contracts test` |
| Change where things stand | `packages/contracts/src/FrontierLayout.sol` **and** Handsel's `lib/frontier-layout.ts` — the vectors are pinned on both sides |
| Mirror a Handsel deployment | `packages/oracle` (`pnpm --filter oracle once`) |
| Run / record an economy episode | `scripts/episode.sh <scenario>` — see `.claude/skills/frontier-episode` at the repo root |
| Add a scout strategy or a market scenario | `packages/sim/src/bots.ts`, `packages/sim/src/scenario.ts`, `packages/sim/src/market.ts` (pure, tested) |
| The filming camera, ticker, market panel | `packages/client/src/director.ts`, `packages/client/src/hud/DirectorOverlay.tsx` |

Conventions: no invented data on the board (an empty market is an empty
plain); the environment banner is read from `WorldMeta`, never a constant; a
synthetic market always writes `environment = "simulation"`; text never goes
on chain. Tests: `pnpm test` at this directory's root runs all three packages.
Foundry must be on `PATH` (`~/.foundry/bin`).
