import { useEffect, useMemo, useState } from "react";
import type { Component, Entity, Schema } from "@latticexyz/recs";
import { decodeEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "./MUDContext";
import { STATUS_LABEL, shortAddress } from "./layout";

/**
 * Director mode (`?director=1`): the client films itself. No controls hint,
 * a big title, an event ticker, a market panel, and a camera that orbits the
 * plaza and cuts to whatever just happened. Used by packages/sim's recorder
 * to produce episodes; harmless to a human who turns it on.
 */
export function isDirector(): boolean {
  return new URLSearchParams(window.location.search).get("director") === "1";
}

export function directorTitle(): string | null {
  return new URLSearchParams(window.location.search).get("title");
}

export type WorldEvent = {
  id: number;
  at: number;
  kind: "beacon" | "scout" | "harvest" | "spawn" | "totem";
  text: string;
  /** Where to point the camera, if anywhere. */
  tile: { x: number; z: number } | null;
  tone: "good" | "bad" | "neutral" | "gold";
};

type BountyValue = { status: number; rewardCents: number; scoutCount: number; x: number; z: number };
type PlayerValue = { spark: number; spawnedAt: bigint; harvests: number };

/**
 * A ring buffer of what changed on chain, built from the components' own
 * update streams — the same events the renderer redraws from, so the ticker
 * cannot report something the board does not show.
 */
export function useWorldEvents(limit = 8): WorldEvent[] {
  const {
    components: { Bounty, Scout, Player },
  } = useMUD();
  const [events, setEvents] = useState<WorldEvent[]>([]);

  useEffect(() => {
    let seq = 0;
    const started = Date.now();
    const push = (e: Omit<WorldEvent, "id" | "at">) => {
      // The initial sync replays history; only narrate what happens after it.
      if (Date.now() - started < 4000) return;
      setEvents((prev) => [{ id: seq++, at: Date.now(), ...e }, ...prev].slice(0, limit));
    };
    const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

    const subs = [
      (Bounty as Component<Schema>).update$.subscribe(({ entity, value }) => {
        const [now, was] = value as [BountyValue | undefined, BountyValue | undefined];
        if (!now) return;
        const { jobId } = decodeEntity(Bounty.metadata.keySchema, entity as Entity);
        const tile = { x: now.x, z: now.z };
        if (!was) push({ kind: "beacon", text: `New job #${jobId} · ${usd(now.rewardCents)}`, tile, tone: "neutral" });
        else if (was.status !== now.status) {
          const label = STATUS_LABEL[now.status] ?? "?";
          const tone = now.status === 4 ? "good" : now.status === 5 || now.status === 7 || now.status === 8 ? "bad" : "neutral";
          push({ kind: "beacon", text: `#${jobId} ${label} · ${usd(now.rewardCents)}${now.scoutCount ? ` · ${now.scoutCount} scout${now.scoutCount === 1 ? "" : "s"}` : ""}`, tile, tone });
        }
      }),
      (Scout as Component<Schema>).update$.subscribe(({ entity, value }) => {
        const [now, was] = value as [{ harvested: boolean } | undefined, { harvested: boolean } | undefined];
        if (!now) return;
        const { jobId, player } = decodeEntity(Scout.metadata.keySchema, entity as Entity);
        const tile = tileOfBounty(Bounty, jobId);
        if (!was) push({ kind: "scout", text: `${shortAddress(player)} scouted #${jobId}`, tile, tone: "gold" });
        else if (!was.harvested && now.harvested) push({ kind: "harvest", text: `${shortAddress(player)} harvested #${jobId}`, tile, tone: "good" });
      }),
      (Player as Component<Schema>).update$.subscribe(({ entity, value }) => {
        const [now, was] = value as [PlayerValue | undefined, PlayerValue | undefined];
        if (now && !was) push({ kind: "spawn", text: `${shortAddress(entity)} joined the Frontier`, tile: null, tone: "neutral" });
      }),
    ];
    return () => subs.forEach((s) => s.unsubscribe());
  }, [Bounty, Scout, Player, limit]);

  return events;
}

function tileOfBounty(Bounty: { values: Record<string, Map<Entity, unknown>>; metadata: { keySchema: Record<string, string> } }, jobId: bigint) {
  // Find the beacon's tile by scanning the x/z value maps for the matching key.
  for (const [entity, x] of Bounty.values.x as Map<Entity, number>) {
    const k = decodeEntity(Bounty.metadata.keySchema as never, entity) as { jobId: bigint };
    if (k.jobId === jobId) return { x, z: (Bounty.values.z as Map<Entity, number>).get(entity) ?? 0 };
  }
  return null;
}

/** The camera's current subject: the newest event with a tile, held for a few seconds, else the plaza. */
export function useDirectorTarget(events: WorldEvent[], holdMs = 6000): { x: number; z: number; zoom: number } {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => {
    const recent = events.find((e) => e.tile && now - e.at < holdMs);
    if (recent?.tile) return { x: recent.tile.x, z: recent.tile.z, zoom: 11 };
    return { x: 0, z: 0, zoom: 30 };
  }, [events, now, holdMs]);
}
