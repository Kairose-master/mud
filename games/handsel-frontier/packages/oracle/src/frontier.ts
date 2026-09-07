import { BOUNTY_STATUS_CODE, VERIFICATION_CODE, totemTile } from "./layout";

/** The subset of Handsel's `GET /api/world/frontier` the oracle acts on. */
export type FeedMeta = {
  environment: "mainnet" | "testnet";
  chainId: number;
  realMoney: boolean;
  contractAddress: string | null;
};

export type FeedBeacon = {
  jobId: string;
  statusCode: number;
  verificationCode: number;
  rewardCents: number;
};

export type FeedTotem = {
  slot: number;
  name: string;
  creditScore: number;
  jobsDone: number;
  earnedCents: number;
  tile: { x: number; z: number };
};

export type Frontier = {
  source: string;
  meta: FeedMeta;
  beacons: FeedBeacon[];
  totems: FeedTotem[];
};

function asInt(n: unknown, fallback = 0): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.trunc(v) : fallback;
}

/** `GET /api/world/frontier` → Frontier. Throws on a shape it does not recognise. */
export function normalizeFrontierFeed(body: unknown, source: string): Frontier {
  const b = body as Record<string, unknown>;
  if (!b || b.type !== "HandselFrontier" || !Array.isArray(b.beacons) || !Array.isArray(b.totems) || !b.meta) {
    throw new Error("not a HandselFrontier feed");
  }
  const meta = b.meta as Record<string, unknown>;
  return {
    source,
    meta: {
      environment: meta.environment === "mainnet" ? "mainnet" : "testnet",
      chainId: asInt(meta.chainId),
      realMoney: meta.realMoney === true,
      contractAddress: typeof meta.contractAddress === "string" ? meta.contractAddress : null,
    },
    beacons: (b.beacons as Record<string, unknown>[])
      .map((x) => ({
        jobId: String(x.jobId),
        statusCode: asInt(x.statusCode),
        verificationCode: asInt(x.verificationCode),
        rewardCents: Math.max(0, asInt(x.rewardCents)),
      }))
      .filter((x) => /^\d+$/.test(x.jobId) && x.statusCode > 0),
    totems: (b.totems as Record<string, unknown>[]).map((x, i) => {
      const tile = (x.tile ?? {}) as Record<string, unknown>;
      return {
        slot: asInt(x.slot, i),
        name: String(x.name ?? ""),
        creditScore: Math.max(0, asInt(x.creditScore)),
        jobsDone: Math.max(0, asInt(x.jobsDone)),
        earnedCents: Math.max(0, asInt(x.earnedCents)),
        tile: { x: asInt(tile.x), z: asInt(tile.z) },
      };
    }),
  };
}

/**
 * Compatibility path: a Handsel deployment that predates `/api/world/frontier`
 * still publishes `GET /api/tasks?status=all` and `GET /api/world/agents`.
 * Compose the same Frontier from those two, with the same code maps and the
 * same totem ring — so the oracle can mirror today's production before the
 * combined feed ships, and the day it ships nothing on chain changes.
 */
export function composeFromLegacy(tasksBody: unknown, agentsBody: unknown, source: string): Frontier {
  const t = tasksBody as Record<string, unknown>;
  if (!t || t.type !== "HandselTaskFeed" || !Array.isArray(t.tasks) || !t.meta) throw new Error("not a HandselTaskFeed");
  const meta = t.meta as Record<string, unknown>;
  const a = agentsBody as Record<string, unknown>;
  const agents = a && Array.isArray(a.agents) ? (a.agents as Record<string, unknown>[]) : [];

  const beacons: FeedBeacon[] = [];
  for (const raw of t.tasks as Record<string, unknown>[]) {
    if (raw.kind !== "paid_job") continue;
    if (typeof raw.chain === "string" && raw.chain.startsWith("solana:")) continue; // ids collide across runtimes
    const statusCode = BOUNTY_STATUS_CODE[String(raw.status)] ?? 0;
    if (!statusCode) continue;
    beacons.push({
      jobId: String(raw.id),
      statusCode,
      verificationCode: VERIFICATION_CODE[String(raw.verification)] ?? 0,
      rewardCents: Math.round(Math.max(0, Number(raw.rewardUsd) || 0) * 100),
    });
  }
  const totems: FeedTotem[] = agents.map((ag, i) => ({
    slot: i,
    name: String(ag.name ?? ""),
    creditScore: Math.max(0, asInt(ag.creditScore)),
    jobsDone: Math.max(0, asInt(ag.jobsDone)),
    earnedCents: Math.round(Math.max(0, Number(ag.earnedUsd) || 0) * 100),
    tile: totemTile(i, agents.length),
  }));

  return {
    source,
    meta: {
      environment: meta.environment === "mainnet" ? "mainnet" : "testnet",
      chainId: asInt(meta.chainId),
      realMoney: meta.realMoney === true,
      contractAddress: typeof meta.contractAddress === "string" ? meta.contractAddress : null,
    },
    beacons: beacons.filter((b) => /^\d+$/.test(b.jobId)),
    totems,
  };
}

export type BountyRow = { statusCode: number; verificationCode: number; rewardCents: number };
export type TotemRow = Omit<FeedTotem, "slot">;

export type Snapshot = {
  bounties: Map<string, BountyRow>;
  totems: Map<number, TotemRow>;
};

export type SyncPlan = {
  bounties: FeedBeacon[];
  totems: FeedTotem[];
  clearTotems: { from: number; to: number } | null;
};

function sameBounty(a: BountyRow, b: BountyRow): boolean {
  return a.statusCode === b.statusCode && a.verificationCode === b.verificationCode && a.rewardCents === b.rewardCents;
}

function sameTotem(a: TotemRow, b: TotemRow): boolean {
  return (
    a.name === b.name &&
    a.creditScore === b.creditScore &&
    a.jobsDone === b.jobsDone &&
    a.earnedCents === b.earnedCents &&
    a.tile.x === b.tile.x &&
    a.tile.z === b.tile.z
  );
}

/**
 * What to write, given what was written last. Only changed rows go on chain;
 * a bounty that fell out of the feed is left alone (its last status stands —
 * the feed caps at 50 rows, and scouts must still be able to harvest an old
 * completed job). Totem slots beyond the new board size are cleared.
 */
export function planSync(prev: Snapshot, next: Frontier): SyncPlan {
  const bounties = next.beacons.filter((b) => {
    const was = prev.bounties.get(b.jobId);
    return !was || !sameBounty(was, b);
  });
  const totems = next.totems.filter((t) => {
    const was = prev.totems.get(t.slot);
    return !was || !sameTotem(was, t);
  });
  const prevMax = prev.totems.size ? Math.max(...prev.totems.keys()) + 1 : 0;
  const clearTotems = prevMax > next.totems.length ? { from: next.totems.length, to: prevMax } : null;
  return { bounties, totems, clearTotems };
}

/** The snapshot after a plan has been applied. */
export function applyPlan(prev: Snapshot, next: Frontier): Snapshot {
  const bounties = new Map(prev.bounties);
  for (const b of next.beacons) bounties.set(b.jobId, { statusCode: b.statusCode, verificationCode: b.verificationCode, rewardCents: b.rewardCents });
  const totems = new Map<number, TotemRow>();
  for (const t of next.totems) totems.set(t.slot, { name: t.name, creditScore: t.creditScore, jobsDone: t.jobsDone, earnedCents: t.earnedCents, tile: t.tile });
  return { bounties, totems };
}

export function emptySnapshot(): Snapshot {
  return { bounties: new Map(), totems: new Map() };
}
