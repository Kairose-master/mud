import type { Rng } from "./rng";

/**
 * Scout strategies. A bot sees only what a player sees on chain: beacons
 * (status, reward, grader, scout count, tile), its own tile, spark and
 * stakes. It never sees the market model's dice.
 */
export type Strategy = "whale" | "verifier" | "bargain" | "herd" | "contrarian" | "random";
export const STRATEGIES: Strategy[] = ["whale", "verifier", "bargain", "herd", "contrarian", "random"];

export type BeaconView = { jobId: bigint; status: number; verification: number; rewardCents: number; scoutCount: number; x: number; z: number };
export type BotView = {
  x: number;
  z: number;
  spark: number;
  /** jobIds this bot has scouted → harvested? */
  stakes: Map<bigint, boolean>;
  beacons: BeaconView[];
};

export type BotAction =
  | { kind: "harvest"; jobId: bigint }
  | { kind: "scout"; jobId: bigint }
  | { kind: "move"; x: number; z: number; toward: bigint }
  | { kind: "idle"; reason: string };

const LIVE = new Set([1, 2, 3]);
const COMPLETED = 4;
const SCOUT_RANGE = 2;
const WORLD_RADIUS = 24;

export function chebyshev(ax: number, az: number, bx: number, bz: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(az - bz));
}

/** Which live, un-staked beacon this strategy wants, or null. A `sticky`
 *  target is kept while it is still a candidate, so a walk is not abandoned
 *  every time a slightly better beacon appears on the far side of the map. */
export function chooseTarget(strategy: Strategy, v: BotView, r: Rng, sticky?: bigint | null): BeaconView | null {
  const candidates = v.beacons.filter((b) => LIVE.has(b.status) && !v.stakes.has(b.jobId));
  if (candidates.length === 0) return null;
  if (sticky !== undefined && sticky !== null) {
    const kept = candidates.find((b) => b.jobId === sticky);
    if (kept) return kept;
  }
  const near = (b: BeaconView) => chebyshev(v.x, v.z, b.x, b.z);
  const by = (score: (b: BeaconView) => number) => [...candidates].sort((a, b) => score(b) - score(a) || near(a) - near(b))[0];
  switch (strategy) {
    case "whale":
      return by((b) => b.rewardCents);
    case "verifier":
      // Machine-graded first (CI, auto tests), then reward; manual review last.
      return by((b) => (b.verification === 4 ? 3 : b.verification === 2 ? 2 : b.verification === 3 ? 1 : 0) * 1e6 + b.rewardCents);
    case "bargain":
      // Cheap bets close by: payout is floor($)+2, so a $1 job pays 3 for 1.
      return by((b) => -near(b) * 100 - b.rewardCents / 100);
    case "herd":
      return by((b) => b.scoutCount * 1e6 + b.rewardCents);
    case "contrarian":
      return by((b) => -b.scoutCount * 1e6 + b.rewardCents);
    case "random":
      return r.pick(candidates);
  }
}

/** One step toward a tile, eight directions, clamped to the world. */
export function stepToward(x: number, z: number, tx: number, tz: number): { x: number; z: number } {
  const nx = x + Math.sign(tx - x);
  const nz = z + Math.sign(tz - z);
  return { x: Math.max(-WORLD_RADIUS, Math.min(WORLD_RADIUS, nx)), z: Math.max(-WORLD_RADIUS, Math.min(WORLD_RADIUS, nz)) };
}

export function decide(strategy: Strategy, v: BotView, r: Rng, sticky?: bigint | null): BotAction {
  // A payout waiting is always taken first.
  for (const [jobId, harvested] of v.stakes) {
    if (harvested) continue;
    const b = v.beacons.find((x) => x.jobId === jobId);
    if (b && b.status === COMPLETED) return { kind: "harvest", jobId };
  }
  if (v.spark < 1) return { kind: "idle", reason: "no spark" };
  const target = chooseTarget(strategy, v, r, sticky);
  if (!target) return { kind: "idle", reason: "nothing live to scout" };
  if (chebyshev(v.x, v.z, target.x, target.z) <= SCOUT_RANGE) return { kind: "scout", jobId: target.jobId };
  const next = stepToward(v.x, v.z, target.x, target.z);
  return { kind: "move", x: next.x, z: next.z, toward: target.jobId };
}
