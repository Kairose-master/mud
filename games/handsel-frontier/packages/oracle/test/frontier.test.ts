import { describe, expect, it } from "vitest";
import { totemTile, BOUNTY_STATUS_CODE, VERIFICATION_CODE } from "../src/layout";
import { applyPlan, composeFromLegacy, emptySnapshot, normalizeFrontierFeed, planSync } from "../src/frontier";

describe("totem ring — same vectors as Handsel's lib/frontier-layout.ts", () => {
  it("places rank 0 at the top of the board and walks clockwise", () => {
    expect(totemTile(0, 1)).toEqual({ x: 0, z: -4 });
    expect(totemTile(0, 4)).toEqual({ x: 0, z: -4 });
    expect(totemTile(1, 4)).toEqual({ x: 4, z: 0 });
    expect(totemTile(2, 4)).toEqual({ x: 0, z: 4 });
    expect(totemTile(3, 4)).toEqual({ x: -4, z: 0 });
    expect(totemTile(1, 8)).toEqual({ x: 3, z: -3 });
  });
});

describe("code maps mirror the on-chain enums", () => {
  it("is 1-based so that a zero row means no bounty", () => {
    expect(BOUNTY_STATUS_CODE.Open).toBe(1);
    expect(BOUNTY_STATUS_CODE.Completed).toBe(4);
    expect(BOUNTY_STATUS_CODE.Refunded).toBe(7);
    expect(BOUNTY_STATUS_CODE.Expired).toBe(8);
    expect(VERIFICATION_CODE.ci_checks).toBe(4);
    expect(Object.values(BOUNTY_STATUS_CODE)).not.toContain(0);
  });
});

const legacyTasks = {
  type: "HandselTaskFeed",
  meta: { environment: "testnet", chainId: 84532, realMoney: false, contractAddress: "0xd9bcf1740d4721988ec2c579e2ec71d0eb904a09" },
  tasks: [
    { id: "42", kind: "paid_job", status: "Open", rewardUsd: 12.5, verification: "auto_graded_tests" },
    { id: "43", kind: "paid_job", status: "Completed", rewardUsd: 5, verification: "ci_checks" },
    { id: "9", kind: "paid_job", status: "Open", rewardUsd: 1, verification: "manual_review", chain: "solana:devnet" },
    { id: "x1", kind: "verified_task", status: "solving", rewardUsd: 3, verification: "independent_grader" },
  ],
};
const legacyAgents = {
  agents: [
    { name: "Architect", creditScore: 640.4, jobsDone: 9, earnedUsd: 42.01 },
    { name: "Red Team", creditScore: 120, jobsDone: 0, earnedUsd: 0 },
  ],
};

describe("composeFromLegacy", () => {
  const f = composeFromLegacy(legacyTasks, legacyAgents, "https://example.test");
  it("keeps EVM paid jobs only and maps codes", () => {
    expect(f.beacons).toEqual([
      { jobId: "42", statusCode: 1, verificationCode: 2, rewardCents: 1250 },
      { jobId: "43", statusCode: 4, verificationCode: 4, rewardCents: 500 },
    ]);
  });
  it("ranks agents into ring slots with cents", () => {
    expect(f.totems[0]).toEqual({ slot: 0, name: "Architect", creditScore: 640, jobsDone: 9, earnedCents: 4201, tile: { x: 0, z: -4 } });
    expect(f.totems[1].tile).toEqual({ x: 0, z: 4 });
  });
  it("carries the environment through untouched", () => {
    expect(f.meta).toEqual({ environment: "testnet", chainId: 84532, realMoney: false, contractAddress: "0xd9bcf1740d4721988ec2c579e2ec71d0eb904a09" });
  });
});

describe("normalizeFrontierFeed", () => {
  it("rejects anything that is not the combined feed", () => {
    expect(() => normalizeFrontierFeed(legacyTasks, "s")).toThrow(/HandselFrontier/);
  });
  it("drops rows with a zero status or a non-numeric id", () => {
    const f = normalizeFrontierFeed(
      {
        type: "HandselFrontier",
        meta: { environment: "mainnet", chainId: 8453, realMoney: true, contractAddress: null },
        beacons: [
          { jobId: "7", statusCode: 2, verificationCode: 4, rewardCents: 300 },
          { jobId: "8", statusCode: 0, verificationCode: 4, rewardCents: 300 },
          { jobId: "abc", statusCode: 1, verificationCode: 1, rewardCents: 300 },
        ],
        totems: [],
      },
      "s",
    );
    expect(f.beacons.map((b) => b.jobId)).toEqual(["7"]);
    expect(f.meta.realMoney).toBe(true);
  });
});

describe("planSync writes only what changed", () => {
  const f = composeFromLegacy(legacyTasks, legacyAgents, "s");
  it("first run writes everything", () => {
    const plan = planSync(emptySnapshot(), f);
    expect(plan.bounties).toHaveLength(2);
    expect(plan.totems).toHaveLength(2);
    expect(plan.clearTotems).toBeNull();
  });
  it("a repeat with no change writes nothing", () => {
    const snap = applyPlan(emptySnapshot(), f);
    const plan = planSync(snap, f);
    expect(plan.bounties).toHaveLength(0);
    expect(plan.totems).toHaveLength(0);
  });
  it("a status change writes that bounty; a vanished bounty is left standing", () => {
    const snap = applyPlan(emptySnapshot(), f);
    const next = { ...f, beacons: [{ ...f.beacons[0], statusCode: 4 }] };
    const plan = planSync(snap, next);
    expect(plan.bounties).toEqual([{ jobId: "42", statusCode: 4, verificationCode: 2, rewardCents: 1250 }]);
    expect(applyPlan(snap, next).bounties.get("43")).toBeDefined();
  });
  it("a shorter leaderboard clears the slots past its end", () => {
    const snap = applyPlan(emptySnapshot(), f);
    const next = { ...f, totems: [f.totems[0]] };
    expect(planSync(snap, next).clearTotems).toEqual({ from: 1, to: 2 });
  });
});
