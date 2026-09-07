import { useEffect, useState } from "react";

/**
 * Handsel's public frontier feed: `GET <HANDSEL_URL>/api/world/frontier`.
 * Unauthenticated, read-only. This is where the TEXT of a beacon comes from —
 * titles, briefs, requester names — none of which is ever written on chain.
 * Everything numeric the map draws is read from the World instead, so a
 * stale or unreachable feed only costs labels, never geometry.
 *
 * The shape is pinned on the Handsel side by tests/frontier-feed.test.ts.
 */
export type FrontierFeedMeta = {
  environment: "mainnet" | "testnet";
  chainId: number;
  chainName: string;
  realMoney: boolean;
  currency: string;
  currencyLabel: string;
  contractAddress: string | null;
  explorerUrl: string | null;
  warning: string;
};

export type FrontierBeacon = {
  jobId: string;
  status: string;
  statusCode: number;
  verification: string;
  verificationCode: number;
  rewardUsd: number;
  rewardCents: number;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  requesterName: string | null;
  workerName: string | null;
  repo: { fullName: string; baseBranch: string } | null;
  tile: { x: number; z: number };
  url: string;
};

export type FrontierTotem = {
  slot: number;
  name: string;
  creditScore: number;
  creditRating: string;
  jobsDone: number;
  earnedUsd: number;
  earnedCents: number;
  tile: { x: number; z: number };
};

export type FrontierFeed = {
  type: "HandselFrontier";
  generatedAt: string;
  meta: FrontierFeedMeta;
  layout: { worldRadius: number; plazaRadius: number; totemRingRadius: number; scoutRange: number };
  beacons: FrontierBeacon[];
  totems: FrontierTotem[];
  safety?: unknown;
  untrustedFields?: string[];
};

/** Defaults to the V2 rehearsal (Base Sepolia, faucet USDC, no monetary value)
 *  so an unset env can never quietly point the labels at real money. */
export const HANDSEL_URL: string = ((import.meta.env.VITE_HANDSEL_URL as string | undefined) || "https://handsel-nu.vercel.app").replace(/\/+$/, "");

export type FeedState =
  | { status: "idle" | "loading"; feed: null; error: null }
  | { status: "ok"; feed: FrontierFeed; error: null }
  | { status: "error"; feed: FrontierFeed | null; error: string };

export function useHandselFeed(intervalMs = 30_000): FeedState {
  const [state, setState] = useState<FeedState>({ status: "idle", feed: null, error: null });

  useEffect(() => {
    let cancelled = false;
    let last: FrontierFeed | null = null;
    const tick = async () => {
      try {
        const res = await fetch(`${HANDSEL_URL}/api/world/frontier`, { headers: { accept: "application/json" } });
        const body = (await res.json()) as FrontierFeed & { error?: string; detail?: string };
        if (!res.ok || body.type !== "HandselFrontier") {
          throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
        }
        last = body;
        if (!cancelled) setState({ status: "ok", feed: body, error: null });
      } catch (err) {
        if (!cancelled) setState({ status: "error", feed: last, error: err instanceof Error ? err.message : String(err) });
      }
    };
    setState({ status: "loading", feed: null, error: null });
    void tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return state;
}

export function jobUrl(jobId: string): string {
  return HANDSEL_URL ? `${HANDSEL_URL}/jobs/${jobId}` : "";
}
