import type { Frontier, FeedBeacon, FeedTotem } from "oracle/frontier";
import { BOUNTY_STATUS_CODE, VERIFICATION_CODE, totemTile } from "oracle/layout";
import type { Rng } from "./rng";
import type { Scenario } from "./scenario";

/**
 * The synthetic market — a job lifecycle with the same vocabulary the real
 * one has (Open → Accepted → Submitted → Completed | Refunded, or Expired),
 * whose outcomes depend on who grades the job. It produces the same
 * `Frontier` shape the oracle reads from Handsel, so the writer that puts it
 * on chain is the same writer. It is labelled "simulation" on chain and in
 * the HUD; it never pretends to be Handsel.
 */
export type Verification = keyof Scenario["verificationMix"];
export type JobState = {
  jobId: number;
  status: "Open" | "Accepted" | "Submitted" | "Completed" | "Refunded" | "Expired";
  verification: Verification;
  rewardCents: number;
  worker: number | null; // agent index
  postedAt: number;
  settledAt: number | null;
};
export type AgentState = { name: string; creditScore: number; jobsDone: number; earnedCents: number; refunds: number };
export type Market = { tick: number; nextJobId: number; jobs: JobState[]; agents: AgentState[] };

export type MarketEvent =
  | { kind: "posted"; jobId: number; rewardCents: number; verification: Verification }
  | { kind: "accepted"; jobId: number; worker: string }
  | { kind: "submitted"; jobId: number; worker: string }
  | { kind: "completed"; jobId: number; worker: string; rewardCents: number }
  | { kind: "refunded"; jobId: number; worker: string }
  | { kind: "expired"; jobId: number };

export function newMarket(s: Scenario): Market {
  return {
    tick: 0,
    nextJobId: 1,
    jobs: [],
    agents: s.agents.map((name, i) => ({ name, creditScore: 300 + i * 17, jobsDone: 0, earnedCents: 0, refunds: 0 })),
  };
}

function pickVerification(s: Scenario, r: Rng): Verification {
  const entries = Object.entries(s.verificationMix) as [Verification, number][];
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let x = r.next() * total;
  for (const [v, w] of entries) {
    x -= w;
    if (x <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

/** One tick of the market. Mutates and returns the events it produced. */
export function stepMarket(m: Market, s: Scenario, r: Rng): MarketEvent[] {
  const events: MarketEvent[] = [];
  m.tick++;
  for (let i = 0; i < s.postRate; i++) {
    if (!r.chance(0.5)) continue;
    const [lo, hi] = s.bountyUsd;
    const usd = lo + r.next() * (hi - lo);
    const job: JobState = {
      jobId: m.nextJobId++,
      status: "Open",
      verification: pickVerification(s, r),
      rewardCents: Math.round(usd * 100),
      worker: null,
      postedAt: m.tick,
      settledAt: null,
    };
    m.jobs.push(job);
    events.push({ kind: "posted", jobId: job.jobId, rewardCents: job.rewardCents, verification: job.verification });
  }
  for (const j of m.jobs) {
    if (j.status === "Open") {
      if (m.agents.length && r.chance(s.advanceChance)) {
        // Higher-scored agents take jobs more often — the leaderboard means something.
        const weights = m.agents.map((a) => a.creditScore);
        const total = weights.reduce((a, b) => a + b, 0);
        let x = r.next() * total;
        let idx = 0;
        for (; idx < weights.length - 1; idx++) {
          x -= weights[idx];
          if (x <= 0) break;
        }
        j.worker = idx;
        j.status = "Accepted";
        events.push({ kind: "accepted", jobId: j.jobId, worker: m.agents[idx].name });
      } else if (r.chance(s.expireChance)) {
        j.status = "Expired";
        j.settledAt = m.tick;
        events.push({ kind: "expired", jobId: j.jobId });
      }
    } else if (j.status === "Accepted") {
      if (r.chance(s.advanceChance)) {
        j.status = "Submitted";
        events.push({ kind: "submitted", jobId: j.jobId, worker: m.agents[j.worker!].name });
      }
    } else if (j.status === "Submitted") {
      if (r.chance(s.advanceChance)) {
        const a = m.agents[j.worker!];
        if (r.chance(s.passRate[j.verification])) {
          j.status = "Completed";
          a.jobsDone++;
          a.earnedCents += j.rewardCents;
          a.creditScore = Math.min(900, a.creditScore + 12);
          events.push({ kind: "completed", jobId: j.jobId, worker: a.name, rewardCents: j.rewardCents });
        } else {
          j.status = "Refunded";
          a.refunds++;
          a.creditScore = Math.max(0, a.creditScore - 20);
          events.push({ kind: "refunded", jobId: j.jobId, worker: a.name });
        }
        j.settledAt = m.tick;
      }
    }
  }
  return events;
}

/** The market as the feed the oracle would have read — ranked totems included. */
export function marketToFrontier(m: Market, s: Scenario, label: string): Frontier {
  const beacons: FeedBeacon[] = m.jobs.map((j) => ({
    jobId: String(j.jobId),
    statusCode: BOUNTY_STATUS_CODE[j.status],
    verificationCode: VERIFICATION_CODE[j.verification],
    rewardCents: j.rewardCents,
  }));
  const ranked = [...m.agents].sort((a, b) => b.creditScore - a.creditScore);
  const totems: FeedTotem[] = ranked.map((a, slot) => ({
    slot,
    name: a.name,
    creditScore: Math.round(a.creditScore),
    jobsDone: a.jobsDone,
    earnedCents: a.earnedCents,
    tile: totemTile(slot, ranked.length),
  }));
  return {
    source: label,
    meta: { environment: "simulation", chainId: 0, realMoney: false, contractAddress: null },
    beacons,
    totems,
  };
}

export function marketStats(m: Market) {
  const by = (st: JobState["status"]) => m.jobs.filter((j) => j.status === st);
  const cents = (js: JobState[]) => js.reduce((a, j) => a + j.rewardCents, 0);
  return {
    posted: m.jobs.length,
    open: by("Open").length,
    inProgress: by("Accepted").length + by("Submitted").length,
    completed: by("Completed").length,
    refunded: by("Refunded").length,
    expired: by("Expired").length,
    openUsd: cents([...by("Open"), ...by("Accepted"), ...by("Submitted")]) / 100,
    paidUsd: cents(by("Completed")) / 100,
    refundedUsd: cents(by("Refunded")) / 100,
  };
}
