import type { Strategy } from "./bots";

/**
 * An episode's knobs. Every number below is a *simulation* parameter — the
 * synthetic market is labelled as such on chain (WorldMeta.environment =
 * "simulation") and in the HUD. The `live` scenario mirrors the real Handsel
 * feed instead and only simulates the players.
 */
export type Scenario = {
  name: string;
  /** A sentence for the video description. */
  blurb: string;
  ticks: number;
  seed: number;
  /** "synthetic" drives a generated market; "live" mirrors HANDSEL_URL. */
  market: "synthetic" | "live";
  /** New jobs posted per tick (Poisson-ish: this many chances at 50%). */
  postRate: number;
  /** Bounty range in USD. */
  bountyUsd: [number, number];
  /** Mix of graders for new jobs, weights. */
  verificationMix: { manual_review: number; auto_graded_tests: number; independent_grader: number; ci_checks: number };
  /** Per-tick chance a job advances (Open→Accepted→Submitted→settled). */
  advanceChance: number;
  /** Chance a Submitted job settles as Completed, by grader; the rest refund. */
  passRate: { manual_review: number; auto_graded_tests: number; independent_grader: number; ci_checks: number };
  /** Chance an Open job nobody took expires each tick. */
  expireChance: number;
  /** Synthetic worker agents (totems). */
  agents: string[];
  /** Which strategies play, in order; bots beyond the list cycle through it. */
  strategies: Strategy[];
  bots: number;
};

const AGENTS = ["Sim Architect", "Sim Red Team", "Sim Reader", "Sim Analyst", "Sim Modeler", "Sim Planner", "Sim Scout", "Sim Harness"];
const ALL: Strategy[] = ["whale", "verifier", "bargain", "herd", "contrarian", "random"];

export const SCENARIOS: Record<string, Scenario> = {
  steady: {
    name: "steady",
    blurb: "A calm market: modest bounties, mostly machine-graded, most jobs get done.",
    ticks: 90,
    seed: 7,
    market: "synthetic",
    postRate: 1,
    bountyUsd: [1, 25],
    verificationMix: { manual_review: 2, auto_graded_tests: 4, independent_grader: 1, ci_checks: 3 },
    advanceChance: 0.22,
    passRate: { manual_review: 0.55, auto_graded_tests: 0.8, independent_grader: 0.7, ci_checks: 0.85 },
    expireChance: 0.02,
    agents: AGENTS.slice(0, 6),
    strategies: ALL,
    bots: 6,
  },
  boom: {
    name: "boom",
    blurb: "A boom: big bounties arrive fast and nearly everything ships — the whale strategy's dream.",
    ticks: 90,
    seed: 11,
    market: "synthetic",
    postRate: 2,
    bountyUsd: [5, 120],
    verificationMix: { manual_review: 1, auto_graded_tests: 3, independent_grader: 1, ci_checks: 5 },
    advanceChance: 0.3,
    passRate: { manual_review: 0.7, auto_graded_tests: 0.9, independent_grader: 0.85, ci_checks: 0.92 },
    expireChance: 0.01,
    agents: AGENTS,
    strategies: ALL,
    bots: 8,
  },
  bust: {
    name: "bust",
    blurb: "A bust: hand-reviewed briefs that mostly get refunded, expiring boards, and bets that burn.",
    ticks: 90,
    seed: 23,
    market: "synthetic",
    postRate: 1,
    bountyUsd: [1, 40],
    verificationMix: { manual_review: 6, auto_graded_tests: 1, independent_grader: 1, ci_checks: 1 },
    advanceChance: 0.15,
    passRate: { manual_review: 0.25, auto_graded_tests: 0.6, independent_grader: 0.4, ci_checks: 0.6 },
    expireChance: 0.08,
    agents: AGENTS.slice(0, 5),
    strategies: ALL,
    bots: 6,
  },
  live: {
    name: "live",
    blurb: "The real Handsel board, mirrored as it is right now, with simulated scouts betting on it.",
    ticks: 60,
    seed: 1,
    market: "live",
    postRate: 0,
    bountyUsd: [0, 0],
    verificationMix: { manual_review: 1, auto_graded_tests: 1, independent_grader: 1, ci_checks: 1 },
    advanceChance: 0,
    passRate: { manual_review: 0, auto_graded_tests: 0, independent_grader: 0, ci_checks: 0 },
    expireChance: 0,
    agents: [],
    strategies: ALL,
    bots: 6,
  },
};

export function resolveScenario(name: string, over: Partial<Scenario> = {}): Scenario {
  const base = SCENARIOS[name];
  if (!base) throw new Error(`unknown scenario "${name}" — one of ${Object.keys(SCENARIOS).join(", ")}`);
  return { ...base, ...over };
}
