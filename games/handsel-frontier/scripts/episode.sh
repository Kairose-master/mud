#!/usr/bin/env bash
# One command, one episode: boots a local chain, deploys the World, builds and
# serves the client, runs the economy simulator with recording on, and leaves
# everything in out/<scenario>-<timestamp>/ (video.webm, README.md with the
# tables for a video description, events.jsonl, ticks.csv, summary.json).
#
#   scripts/episode.sh boom                # defaults: scenario's ticks, 1.5s per tick
#   scripts/episode.sh bust --ticks 120 --tick-ms 1000
#   scripts/episode.sh live --handsel-url https://handsel-nu.vercel.app
#   NO_RECORD=1 scripts/episode.sh steady  # numbers only, no browser
#
# Needs: node 20+, pnpm, foundry (anvil + forge on PATH), and for recording a
# Chromium Playwright can drive (CHROMIUM_PATH, or Playwright's own install).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SCENARIO="${1:-steady}"; shift || true
PORT="${PORT:-8545}"
CLIENT_PORT="${CLIENT_PORT:-4173}"
export PATH="$PATH:$HOME/.foundry/bin"

command -v anvil >/dev/null || { echo "anvil not found — install foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup" >&2; exit 1; }
command -v pnpm  >/dev/null || { echo "pnpm not found" >&2; exit 1; }

cd "$ROOT"
[ -d node_modules ] || pnpm install

cleanup() {
  [ -n "${ANVIL_PID:-}" ] && kill "$ANVIL_PID" 2>/dev/null || true
  [ -n "${PREVIEW_PID:-}" ] && kill "$PREVIEW_PID" 2>/dev/null || true
}
trap cleanup EXIT

# 1. a fresh chain, so every episode starts from block 0 and the same seed replays.
if ! curl -s -o /dev/null "http://127.0.0.1:$PORT"; then
  anvil --port "$PORT" --base-fee 0 --silent &
  ANVIL_PID=$!
  for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT" && break; sleep 0.2; done
fi

# 2. the World (the simulator also deploys if worlds.json is stale; doing it
#    here first means the client build below bakes in the right address).
( cd packages/contracts && DEBUG= PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 pnpm mud deploy --rpc "http://127.0.0.1:$PORT" >/dev/null )

# 3. the client, built and served (only needed for the recording)
if [ -z "${NO_RECORD:-}" ]; then
  ( cd packages/client && pnpm exec vite build >/dev/null )
  ( cd packages/client && pnpm exec vite preview --port "$CLIENT_PORT" --strictPort >/dev/null 2>&1 ) &
  PREVIEW_PID=$!
  for _ in $(seq 1 50); do curl -s -o /dev/null "http://localhost:$CLIENT_PORT/" && break; sleep 0.2; done
  RECORD="--record --client-url http://localhost:$CLIENT_PORT"
else
  RECORD=""
fi

# 4. the episode
cd packages/sim
# shellcheck disable=SC2086
DEBUG= pnpm exec tsx src/index.ts --scenario "$SCENARIO" --port "$PORT" $RECORD "$@"
