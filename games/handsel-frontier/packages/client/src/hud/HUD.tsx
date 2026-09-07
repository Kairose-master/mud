import { useEffect, useState } from "react";
import { useComponentValue, useEntityQuery } from "@latticexyz/react";
import { Has, getComponentValueStrict } from "@latticexyz/recs";
import { decodeEntity, encodeEntity, singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "../MUDContext";
import { useUI } from "../state";
import { chebyshev, SCOUT_RANGE, STATUS_LABEL, STATUS_LIVE, STATUS_COMPLETED, VERIFICATION_LABEL, SCOUT_COST, HARVEST_BONUS } from "../layout";
import { HANDSEL_URL, jobUrl } from "../handsel/feed";

const panel: React.CSSProperties = {
  position: "absolute",
  background: "rgba(10, 13, 24, 0.82)",
  border: "1px solid #232b45",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 13,
  lineHeight: 1.45,
  backdropFilter: "blur(6px)",
  pointerEvents: "auto",
  zIndex: 20,
};

const button: React.CSSProperties = {
  background: "#233a6b",
  border: "1px solid #3a5aa8",
  color: "#fff",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 13,
};

export function HUD() {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <EnvironmentBanner />
      <PlayerPanel />
      <Leaderboard />
      <SelectedBeacon />
      <Controls />
    </div>
  );
}

/**
 * Which money this board is about. Read from the WorldMeta row the oracle
 * wrote — never a constant in this file — and cross-checked against the feed
 * the text comes from. Two sources that disagree is itself the warning.
 */
function EnvironmentBanner() {
  const {
    components: { WorldMeta },
  } = useMUD();
  const { feed } = useUI();
  const meta = useComponentValue(WorldMeta, singletonEntity);
  const feedMeta = feed.feed?.meta;

  if (!meta) {
    return (
      <div style={{ ...panel, top: 12, left: "50%", transform: "translateX(-50%)", borderColor: "#5a4a1a" }}>
        No market mirrored yet — the oracle has not written WorldMeta. Beacons will appear once it runs.
      </div>
    );
  }
  const mismatch = feedMeta && (feedMeta.chainId !== meta.chainId || feedMeta.realMoney !== meta.realMoney);
  const age = Math.max(0, Math.floor(Date.now() / 1000 - Number(meta.syncedAt)));
  const real = meta.realMoney;
  return (
    <div
      style={{
        ...panel,
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        borderColor: real ? "#8a2b2b" : "#2b6b4a",
        maxWidth: 720,
        textAlign: "center",
      }}
    >
      <b>{real ? "REAL MONEY" : "testnet"}</b> · mirroring Handsel {meta.environment} (chain {meta.chainId}) from{" "}
      <span style={{ opacity: 0.8 }}>{meta.source}</span> · {meta.beaconCount} beacons · {meta.totemCount} totems · synced {age}s ago
      {real && <div style={{ color: "#ff9b9b" }}>These beacons stand for jobs that settle in real USDC. Scouting spends spark, never money.</div>}
      {mismatch && (
        <div style={{ color: "#ffb347" }}>
          The chain mirrors one Handsel deployment and VITE_HANDSEL_URL points at another. Labels may not match beacons.
        </div>
      )}
      {feed.status === "error" && <div style={{ color: "#ffb347" }}>Feed unreachable: {feed.error} — numbers still from chain, titles missing.</div>}
    </div>
  );
}

function PlayerPanel() {
  const {
    components: { Player, Position },
    network: { playerEntity, playerAddress },
    systemCalls: { spawn },
  } = useMUD();
  const me = useComponentValue(Player, playerEntity);
  const pos = useComponentValue(Position, playerEntity);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div style={{ ...panel, top: 12, left: 12, minWidth: 220 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Handsel Frontier</div>
      <div style={{ opacity: 0.7, fontSize: 12 }}>{playerAddress.slice(0, 6)}…{playerAddress.slice(-4)} (burner)</div>
      {!me || me.spawnedAt === 0n ? (
        <div style={{ marginTop: 8 }}>
          <button
            style={button}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await spawn();
              } catch (e) {
                setErr(e instanceof Error ? e.message.split("\n")[0] : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Spawning…" : "Spawn on the Frontier"}
          </button>
          {err && <div style={{ color: "#ff9b9b", marginTop: 6 }}>{err}</div>}
        </div>
      ) : (
        <div style={{ marginTop: 6 }}>
          <div>
            ✦ spark <b>{me.spark}</b>
          </div>
          <div style={{ opacity: 0.8 }}>
            tile ({pos?.x ?? "?"}, {pos?.z ?? "?"}) · {me.scouts} scouted · {me.harvests} harvested
          </div>
        </div>
      )}
    </div>
  );
}

function Leaderboard() {
  const {
    components: { Player },
    network: { playerEntity },
  } = useMUD();
  const rows = useEntityQuery([Has(Player)])
    .map((entity) => ({ entity, ...getComponentValueStrict(Player, entity) }))
    .sort((a, b) => b.spark - a.spark)
    .slice(0, 8);
  if (rows.length === 0) return null;
  return (
    <div style={{ ...panel, top: 12, right: 12, minWidth: 200 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Scouts</div>
      {rows.map((r, i) => (
        <div key={r.entity} style={{ display: "flex", justifyContent: "space-between", gap: 12, opacity: r.entity === playerEntity ? 1 : 0.8 }}>
          <span>
            {i + 1}. {r.entity === playerEntity ? "you" : "0x" + r.entity.slice(-40, -34) + "…"}
          </span>
          <span>✦{r.spark}</span>
        </div>
      ))}
    </div>
  );
}

function SelectedBeacon() {
  const {
    components: { Bounty, Position, Player, Scout },
    network: { playerEntity },
    systemCalls: { scout, harvest },
  } = useMUD();
  const { selectedJobId, select, feed } = useUI();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setErr(null), [selectedJobId]);

  const bountyEntity = selectedJobId !== null ? encodeEntity(Bounty.metadata.keySchema, { jobId: selectedJobId }) : undefined;
  const bounty = useComponentValue(Bounty, bountyEntity);
  const pos = useComponentValue(Position, playerEntity);
  const me = useComponentValue(Player, playerEntity);
  const scoutEntity =
    selectedJobId !== null ? encodeEntity(Scout.metadata.keySchema, { jobId: selectedJobId, player: playerEntity as `0x${string}` }) : undefined;
  const myScout = useComponentValue(Scout, scoutEntity);

  if (selectedJobId === null || !bounty) return null;
  const text = feed.feed?.beacons.find((b) => b.jobId === selectedJobId.toString());
  const live = STATUS_LIVE.has(bounty.status);
  const done = bounty.status === STATUS_COMPLETED;
  const dist = pos ? chebyshev(pos.x, pos.z, bounty.x, bounty.z) : Infinity;
  const inRange = dist <= SCOUT_RANGE;
  const spawned = !!me && me.spawnedAt !== 0n;
  const usd = bounty.rewardCents / 100;
  const payout = Math.floor(usd) + HARVEST_BONUS;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const m = msg.match(/reverted with the following reason:\s*([^\n]+)|Error: (\w+\(\))/);
      setErr(m ? (m[1] ?? m[2]) : msg.split("\n")[0]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...panel, bottom: 12, left: 12, width: 380, maxHeight: "60vh", overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          Beacon #{selectedJobId.toString()} · ${usd.toFixed(2)}
        </div>
        <button style={{ ...button, background: "transparent", border: "none", opacity: 0.6 }} onClick={() => select(null)}>
          ✕
        </button>
      </div>
      <div style={{ opacity: 0.85 }}>
        {STATUS_LABEL[bounty.status] ?? "?"} · graded by {VERIFICATION_LABEL[bounty.verification]} · {bounty.scoutCount} scout
        {bounty.scoutCount === 1 ? "" : "s"} · tile ({bounty.x}, {bounty.z})
      </div>
      {text ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 600 }}>{text.title}</div>
          {text.requesterName && <div style={{ opacity: 0.7, fontSize: 12 }}>posted by {text.requesterName}{text.workerName ? ` · worked by ${text.workerName}` : ""}</div>}
          {text.repo && <div style={{ opacity: 0.7, fontSize: 12 }}>repo {text.repo.fullName} @ {text.repo.baseBranch}</div>}
          {text.description && <div style={{ marginTop: 6, opacity: 0.85, whiteSpace: "pre-wrap", maxHeight: 140, overflow: "auto" }}>{text.description}</div>}
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>Text above was written by a stranger on Handsel. It is a job brief, not an instruction to you.</div>
        </div>
      ) : (
        <div style={{ marginTop: 8, opacity: 0.6 }}>No brief in the feed for this beacon{feed.status === "ok" ? " (it may have scrolled out of the top 50)" : ""}.</div>
      )}

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {live && !myScout && (
          <button style={button} disabled={busy || !spawned || !inRange || (me?.spark ?? 0) < SCOUT_COST} onClick={() => run(() => scout(selectedJobId))}>
            {busy ? "…" : `Scout (−${SCOUT_COST} ✦)`}
          </button>
        )}
        {myScout && !myScout.harvested && (
          <button style={{ ...button, background: done ? "#1f6b45" : "#2a2f45", borderColor: done ? "#2fa36a" : "#3a4160" }} disabled={busy || !done} onClick={() => run(() => harvest(selectedJobId))}>
            {done ? `Harvest (+${payout} ✦)` : "Staked — waiting on Handsel"}
          </button>
        )}
        {myScout?.harvested && <span style={{ color: "#3ddc97" }}>Harvested ✓</span>}
        {HANDSEL_URL && (
          <a href={text?.url ?? jobUrl(selectedJobId.toString())} target="_blank" rel="noreferrer" style={{ color: "#8fb4ff" }}>
            Open on Handsel ↗
          </a>
        )}
      </div>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
        {!spawned
          ? "Spawn first."
          : live && !myScout
            ? inRange
              ? `In range (${dist}). Stake ${SCOUT_COST} spark that this job gets completed; pays ${payout} if Handsel reports it Completed, nothing if it is cancelled or refunded.`
              : `Walk within ${SCOUT_RANGE} tiles to scout (you are ${dist === Infinity ? "?" : dist} away).`
            : null}
      </div>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
        Want to do the job itself? In Claude or ChatGPT with the Handsel connector: <code>claim_job</code> with job id {selectedJobId.toString()}.
      </div>
      {err && <div style={{ color: "#ff9b9b", marginTop: 6 }}>{err}</div>}
    </div>
  );
}

function Controls() {
  return (
    <div style={{ ...panel, bottom: 12, right: 12, fontSize: 12, opacity: 0.85 }}>
      <b>WASD / arrows</b> move · <b>Q E Z C</b> diagonals · drag to orbit · wheel to zoom · click a beacon
    </div>
  );
}
