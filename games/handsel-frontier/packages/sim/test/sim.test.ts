import { describe, expect, it } from "vitest";
import { rng } from "../src/rng";
import { resolveScenario, SCENARIOS } from "../src/scenario";
import { marketStats, marketToFrontier, newMarket, stepMarket } from "../src/market";
import { chooseTarget, decide, stepToward, type BotView } from "../src/bots";
import { formatTable, strategyTable } from "../src/metrics";

describe("rng", () => {
  it("is deterministic per seed", () => {
    const a = rng(7), b = rng(7), c = rng(8);
    const xs = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(xs);
    expect(c.next()).not.toBe(xs[0]);
  });
});

describe("synthetic market", () => {
  it("only ever uses statuses the contract has codes for, and labels itself a simulation", () => {
    const s = resolveScenario("boom");
    const m = newMarket(s);
    const r = rng(s.seed);
    for (let i = 0; i < 200; i++) stepMarket(m, s, r);
    const f = marketToFrontier(m, s, "test");
    expect(f.meta.environment).toBe("simulation");
    expect(f.meta.realMoney).toBe(false);
    for (const b of f.beacons) {
      expect(b.statusCode).toBeGreaterThan(0);
      expect(b.statusCode).toBeLessThanOrEqual(8);
      expect(b.verificationCode).toBeGreaterThan(0);
    }
    expect(f.totems.length).toBe(s.agents.length);
    const stats = marketStats(m);
    expect(stats.posted).toBeGreaterThan(20);
    expect(stats.completed + stats.refunded + stats.expired + stats.open + stats.inProgress).toBe(stats.posted);
  });

  it("a bust refunds more than it pays; a boom pays more than it refunds", () => {
    const run = (name: string) => {
      const s = resolveScenario(name);
      const m = newMarket(s);
      const r = rng(s.seed);
      for (let i = 0; i < 300; i++) stepMarket(m, s, r);
      return marketStats(m);
    };
    const boom = run("boom"), bust = run("bust");
    expect(boom.completed).toBeGreaterThan(boom.refunded);
    expect(bust.refunded).toBeGreaterThan(bust.completed);
  });

  it("pays the worker on completion and moves its score", () => {
    const s = resolveScenario("boom");
    const m = newMarket(s);
    const r = rng(3);
    for (let i = 0; i < 300; i++) stepMarket(m, s, r);
    const paid = m.agents.reduce((a, x) => a + x.earnedCents, 0);
    expect(paid).toBe(Math.round(marketStats(m).paidUsd * 100));
    expect(m.agents.some((a) => a.creditScore !== 300 + m.agents.indexOf(a) * 17)).toBe(true);
  });

  it("every built-in scenario resolves", () => {
    for (const name of Object.keys(SCENARIOS)) expect(resolveScenario(name).name).toBe(name);
    expect(() => resolveScenario("nope")).toThrow(/unknown scenario/);
  });
});

const beacon = (jobId: number, over: Partial<BotView["beacons"][number]> = {}) => ({
  jobId: BigInt(jobId),
  status: 1,
  verification: 1,
  rewardCents: 1000,
  scoutCount: 0,
  x: 10,
  z: 10,
  ...over,
});

describe("bots", () => {
  const base = (): BotView => ({ x: 0, z: 0, spark: 5, stakes: new Map(), beacons: [] });

  it("whale wants the biggest bounty, bargain the cheapest nearby, verifier the machine-graded", () => {
    const v = base();
    v.beacons = [beacon(1, { rewardCents: 500, verification: 4, x: 3, z: 3 }), beacon(2, { rewardCents: 9000, verification: 1, x: 20, z: 20 }), beacon(3, { rewardCents: 100, verification: 2, x: 2, z: 1 })];
    const r = rng(1);
    expect(chooseTarget("whale", v, r)?.jobId).toBe(2n);
    expect(chooseTarget("bargain", v, r)?.jobId).toBe(3n);
    expect(chooseTarget("verifier", v, r)?.jobId).toBe(1n);
  });

  it("herd follows scouts, contrarian avoids them", () => {
    const v = base();
    v.beacons = [beacon(1, { scoutCount: 5 }), beacon(2, { scoutCount: 0 })];
    expect(chooseTarget("herd", v, rng(1))?.jobId).toBe(1n);
    expect(chooseTarget("contrarian", v, rng(1))?.jobId).toBe(2n);
  });

  it("ignores settled beacons and ones already staked", () => {
    const v = base();
    v.beacons = [beacon(1, { status: 4 }), beacon(2)];
    v.stakes.set(2n, false);
    expect(chooseTarget("whale", v, rng(1))).toBeNull();
    expect(decide("whale", v, rng(1))).toEqual({ kind: "idle", reason: "nothing live to scout" });
  });

  it("harvests first, scouts in range, otherwise walks one tile", () => {
    const v = base();
    v.beacons = [beacon(1, { status: 4 }), beacon(2, { x: 1, z: 2 }), beacon(3, { x: 8, z: -8 })];
    v.stakes.set(1n, false);
    expect(decide("whale", v, rng(1))).toEqual({ kind: "harvest", jobId: 1n });
    v.stakes.set(1n, true);
    v.beacons = [beacon(2, { x: 1, z: 2 })];
    expect(decide("whale", v, rng(1))).toEqual({ kind: "scout", jobId: 2n });
    v.beacons = [beacon(3, { x: 8, z: -8 })];
    expect(decide("whale", v, rng(1))).toEqual({ kind: "move", x: 1, z: -1, toward: 3n });
    v.spark = 0;
    expect(decide("whale", v, rng(1))).toEqual({ kind: "idle", reason: "no spark" });
  });

  it("keeps a sticky target while it is still a candidate", () => {
    const v = base();
    v.beacons = [beacon(1, { rewardCents: 500, x: 3, z: 3 }), beacon(2, { rewardCents: 9000, x: 20, z: 20 })];
    expect(chooseTarget("whale", v, rng(1), 1n)?.jobId).toBe(1n);
    v.beacons[0].status = 4;
    expect(chooseTarget("whale", v, rng(1), 1n)?.jobId).toBe(2n);
  });

  it("stepToward clamps to the world", () => {
    expect(stepToward(24, 24, 30, 30)).toEqual({ x: 24, z: 24 });
    expect(stepToward(0, 0, -5, 5)).toEqual({ x: -1, z: 1 });
  });
});

describe("metrics", () => {
  it("pools bots by strategy and sorts by ROI", () => {
    const t = strategyTable([
      { name: "a", strategy: "whale", spark: 20, startSpark: 10, scouts: 4, harvests: 2, burned: 1 },
      { name: "b", strategy: "whale", spark: 10, startSpark: 10, scouts: 2, harvests: 0, burned: 2 },
      { name: "c", strategy: "bargain", spark: 5, startSpark: 10, scouts: 5, harvests: 0, burned: 5 },
    ]);
    expect(t[0]).toMatchObject({ strategy: "whale", bots: 2, sparkStart: 20, sparkEnd: 30, roi: 0.5, scouts: 6, harvests: 2 });
    expect(t[1]).toMatchObject({ strategy: "bargain", roi: -0.5 });
    expect(formatTable(t as unknown as Record<string, string | number>[])).toContain("| whale");
  });
});

import { botCaption, endCardHtml, introCaptions, marketCaption, newCaptionState, standingsCaption } from "../src/captions";

describe("captions", () => {
  const s = resolveScenario("bust");
  it("open with the simulation disclaimer in both languages", () => {
    expect(introCaptions(s, "ko")[0]).toMatch(/시뮬레이션/);
    expect(introCaptions(s, "en")[0]).toMatch(/Simulation/);
    expect(introCaptions(resolveScenario("live"), "en")[0]).toMatch(/real Handsel/);
  });
  it("narrate settlements, only the first stake and harvest, and only notable postings", () => {
    const st = newCaptionState();
    expect(marketCaption({ kind: "posted", jobId: 1, rewardCents: 500, verification: "ci_checks" }, st, "en")).toBeNull();
    expect(marketCaption({ kind: "posted", jobId: 2, rewardCents: 5000, verification: "ci_checks" }, st, "en")).toMatch(/biggest/);
    expect(marketCaption({ kind: "posted", jobId: 3, rewardCents: 5100, verification: "ci_checks" }, st, "en")).toBeNull();
    expect(marketCaption({ kind: "refunded", jobId: 2, worker: "Sim Reader" }, st, "ko")).toMatch(/환불/);
    expect(botCaption("scout", "whale-0", "2", st, "en")).toMatch(/First stake/);
    expect(botCaption("scout", "whale-1", "3", st, "en")).toBeNull();
    expect(botCaption("harvest", "whale-0", "2", st, "ko")).toMatch(/첫 수확/);
  });
  it("standings and end card name the leader and escape html", () => {
    const bots = [
      { name: "a", strategy: "whale" as const, spark: 20, startSpark: 10, scouts: 4, harvests: 2, burned: 1 },
      { name: "b", strategy: "herd" as const, spark: 5, startSpark: 10, scouts: 5, harvests: 0, burned: 5 },
    ];
    expect(standingsCaption(bots, 15, 60, "en")).toMatch(/whale .* leads at \+100%.*herd .* trails at -50%/);
    const html = endCardHtml({ ...s, name: "<bust>" }, bots, { completed: 1, refunded: 2, expired: 0, paidUsd: 10, refundedUsd: 20 }, "ko");
    expect(html).toContain("&lt;bust&gt;");
    expect(html).toMatch(/시뮬레이션/);
  });
});
