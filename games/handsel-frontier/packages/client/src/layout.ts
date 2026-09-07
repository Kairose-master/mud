/**
 * TypeScript mirror of contracts/src/FrontierLayout.sol — the constants the
 * renderer needs to draw the board the contract enforces. Beacon tiles are NOT
 * recomputed here: the client reads them from the Bounty table, where the
 * contract wrote them. One geometry, one author.
 */
export const WORLD_RADIUS = 24;
export const PLAZA_RADIUS = 5;
export const TOTEM_RING_RADIUS = 4;
export const SPAWN_RING_RADIUS = 2;
export const SCOUT_RANGE = 2;
export const SPAWN_SPARK = 10;
export const SCOUT_COST = 1;
export const HARVEST_BONUS = 2;

export function chebyshev(ax: number, az: number, bx: number, bz: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(az - bz));
}

export function inWorld(x: number, z: number): boolean {
  return Math.abs(x) <= WORLD_RADIUS && Math.abs(z) <= WORLD_RADIUS;
}

/** Mirrors the on-chain BountyStatus enum (1-based; 0 = no such bounty). */
export const BOUNTY_STATUS = ["None", "Open", "Accepted", "Submitted", "Completed", "Cancelled", "Disputed", "Refunded", "Expired"] as const;
export type BountyStatusName = (typeof BOUNTY_STATUS)[number];

/** Mirrors the on-chain Verification enum. */
export const VERIFICATION = ["Unknown", "ManualReview", "AutoGradedTests", "IndependentGrader", "CiChecks"] as const;
export type VerificationName = (typeof VERIFICATION)[number];

export const STATUS_LIVE = new Set<number>([1, 2, 3]);
export const STATUS_COMPLETED = 4;

/** Palette. Verification decides the crystal's colour; status decides how it behaves. */
export const VERIFICATION_COLOR: Record<number, string> = {
  0: "#8b93a7",
  1: "#f5b942", // manual review — amber
  2: "#3ddc97", // auto-graded tests — green
  3: "#63b3ff", // independent grader — blue
  4: "#b388ff", // CI checks — violet
};

export const STATUS_LABEL: Record<number, string> = {
  1: "Open",
  2: "Accepted",
  3: "Submitted",
  4: "Completed",
  5: "Cancelled",
  6: "Disputed",
  7: "Refunded",
  8: "Expired",
};

export const VERIFICATION_LABEL: Record<number, string> = {
  0: "unknown grader",
  1: "manual review",
  2: "auto-graded tests",
  3: "independent grader",
  4: "CI checks",
};

/** Beacon height in world units — a $1 job is a shard, a $100 job a spire. */
export function beaconHeight(rewardCents: number): number {
  const usd = rewardCents / 100;
  return 0.8 + Math.min(6, Math.log10(1 + usd) * 2.2);
}

/** Totem height — credit score 0 is a stump, 800+ a column. */
export function totemHeight(creditScore: number): number {
  return 0.6 + Math.min(4, creditScore / 200);
}

export function shortAddress(entity: string): string {
  // entity is a bytes32-encoded address
  const addr = "0x" + entity.slice(-40);
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export function colorFromEntity(entity: string): string {
  const n = parseInt(entity.slice(-6), 16);
  const hue = n % 360;
  return `hsl(${hue} 70% 60%)`;
}
