import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { Hex } from "viem";
import { createWorld, getComponentValue, getComponentValueStrict, Has, runQuery, type Entity } from "@latticexyz/recs";
import { decodeEntity, encodeEntity, syncToRecs } from "@latticexyz/store-sync/recs";
import mudConfigModule from "contracts/mud.config";

// tsx compiles the contracts package (no "type": "module") as CJS, so the
// default export arrives wrapped; Vite hands the client the bare object.
const mudConfig = ((mudConfigModule as unknown as { default?: unknown }).default ?? mudConfigModule) as typeof mudConfigModule;
import { applyPlan, emptySnapshot, planSync, composeFromLegacy, normalizeFrontierFeed, type Frontier, type Snapshot } from "oracle/frontier";
import { applyPlanOnChain } from "oracle/writer";
import { rng } from "./rng";
import { resolveScenario, type Scenario } from "./scenario";
import { marketStats, marketToFrontier, newMarket, stepMarket, type Market, type MarketEvent } from "./market";
import { decide, STRATEGIES, type BotView, type Strategy } from "./bots";
import { formatTable, strategyTable, type BotLedger, type TickRow } from "./metrics";
import { ANVIL_KEY, botKey, clientsFor, ensureAnvil, ensureDeployed, fund, ROOT, type Rpc } from "./chain";
import { startRecording } from "./record";

/**
 * Handsel Frontier economy simulator.
 *
 *   pnpm start -- --scenario boom --ticks 90 --bots 8 --tick-ms 1500
 *   pnpm episode -- --scenario bust            # same, plus a 1080p recording
 *
 * One process drives everything on a local anvil: the market (synthetic, or
 * the live Handsel board mirrored), the strategy bots, the metrics, and —
 * with --record — a headless Chromium filming the client in director mode.
 * Output lands in out/<scenario>-<timestamp>/: events.jsonl, ticks.csv,
 * summary.json, README.md (a ready-to-paste video description), video.webm.
 */
type Args = {
  scenario: string;
  ticks?: number;
  bots?: number;
  seed?: number;
  tickMs: number;
  record: boolean;
  port: number;
  clientUrl: string;
  out: string;
  handselUrl: string;
  redeploy: boolean;
  /** Bot actions per tick — players act faster than the market settles. */
  steps: number;
};

function parseArgs(argv: string[]): Args {
  const a: Args = { scenario: "steady", tickMs: 1500, record: false, port: 8545, clientUrl: "http://localhost:4173", out: join(ROOT, "out"), handselUrl: process.env.HANDSEL_URL ?? "https://handsel-nu.vercel.app", redeploy: false, steps: 3 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === "--scenario") a.scenario = v, i++;
    else if (k === "--ticks") a.ticks = Number(v), i++;
    else if (k === "--bots") a.bots = Number(v), i++;
    else if (k === "--seed") a.seed = Number(v), i++;
    else if (k === "--tick-ms") a.tickMs = Number(v), i++;
    else if (k === "--port") a.port = Number(v), i++;
    else if (k === "--client-url") a.clientUrl = v, i++;
    else if (k === "--out") a.out = v, i++;
    else if (k === "--handsel-url") a.handselUrl = v, i++;
    else if (k === "--steps") a.steps = Number(v), i++;
    else if (k === "--record") a.record = true;
    else if (k === "--redeploy") a.redeploy = true;
    else if (k === "--help") {
      console.log("--scenario steady|boom|bust|live  --ticks N --bots N --seed N --tick-ms MS --record --port 8545 --client-url URL --out DIR --handsel-url URL --redeploy --steps N");
      process.exit(0);
    }
  }
  return a;
}

async function fetchLive(handselUrl: string): Promise<Frontier> {
  const get = async (p: string) => {
    const res = await fetch(`${handselUrl}${p}`, { headers: { accept: "application/json" } });
    return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
  };
  const combined = await get("/api/world/frontier");
  if (combined.ok) return normalizeFrontierFeed(combined.body, handselUrl);
  const [tasks, agents] = await Promise.all([get("/api/tasks?status=all&limit=50"), get("/api/world/agents?limit=24")]);
  if (!tasks.ok) throw new Error(`task feed HTTP ${tasks.status}`);
  return composeFromLegacy(tasks.body, agents.ok ? agents.body : { agents: [] }, handselUrl);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scenario: Scenario = resolveScenario(args.scenario, {
    ...(args.ticks ? { ticks: args.ticks } : {}),
    ...(args.bots ? { bots: args.bots } : {}),
    ...(args.seed !== undefined ? { seed: args.seed } : {}),
  });
  const rpc: Rpc = { url: `http://127.0.0.1:${args.port}`, port: args.port };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = join(args.out, `${scenario.name}-${stamp}`);
  mkdirSync(outDir, { recursive: true });
  const log = (line: string) => console.log(`[sim] ${line}`);
  const event = (e: Record<string, unknown>) => appendFileSync(join(outDir, "events.jsonl"), JSON.stringify({ t: Date.now(), ...e }) + "\n");

  log(`scenario ${scenario.name} · ${scenario.ticks} ticks · ${scenario.bots} bots · seed ${scenario.seed} · market ${scenario.market}`);
  const anvil = await ensureAnvil(rpc);
  if (anvil) log(`started anvil on :${rpc.port}`);
  const worldAddress = await ensureDeployed(rpc, 31337, args.redeploy || !!anvil);
  log(`world ${worldAddress}`);

  // ---- read side: the same sync the client uses, so bots see exactly what a player sees.
  const owner = clientsFor(rpc, ANVIL_KEY, worldAddress);
  const recsWorld = createWorld();
  const { components, waitForTransaction } = await syncToRecs({
    world: recsWorld,
    config: mudConfig,
    address: worldAddress,
    publicClient: owner.publicClient,
    startBlock: 0n,
  });
  const { Bounty, Player, Position, Scout } = components;
  const wait = async (hash: Hex) => {
    await owner.publicClient.waitForTransactionReceipt({ hash });
    await waitForTransaction(hash);
  };

  // ---- market
  const r = rng(scenario.seed);
  const market: Market = newMarket(scenario);
  let snapshot: Snapshot = emptySnapshot();
  let liveFrontier: Frontier | null = null;
  const pushMarket = async (label: string) => {
    const frontier = scenario.market === "synthetic" ? marketToFrontier(market, scenario, label) : { ...(liveFrontier ??= await fetchLive(args.handselUrl)), source: label };
    const plan = planSync(snapshot, frontier);
    await applyPlanOnChain(owner.world, { waitForTransactionReceipt: (a) => wait(a.hash) }, plan, frontier);
    snapshot = applyPlan(snapshot, frontier);
    return frontier;
  };

  // ---- bots
  type Bot = { name: string; strategy: Strategy; key: Hex; entity: Entity; world: ReturnType<typeof clientsFor>["world"]; ledger: BotLedger; target: bigint | null };
  const bots: Bot[] = [];
  for (let i = 0; i < scenario.bots; i++) {
    const strategy = scenario.strategies[i % scenario.strategies.length] ?? STRATEGIES[i % STRATEGIES.length];
    const key = botKey(scenario.seed, i);
    const c = clientsFor(rpc, key, worldAddress);
    await fund(rpc, c.account.address);
    const entity = encodeEntity({ address: "address" }, { address: c.account.address });
    bots.push({ name: `${strategy}-${i}`, strategy, key, entity, world: c.world, ledger: { name: `${strategy}-${i}`, strategy, spark: 0, startSpark: 0, scouts: 0, harvests: 0, burned: 0 }, target: null });
  }

  const label = (tick: number) => (scenario.market === "synthetic" ? `simulation · ${scenario.name} · seed ${scenario.seed} · tick ${tick}/${scenario.ticks}` : `${args.handselUrl} · live mirror · tick ${tick}/${scenario.ticks}`);
  await pushMarket(label(0));
  for (const b of bots) {
    if (!getComponentValue(Player, b.entity)?.spawnedAt) await wait(await b.world.write.frontier__spawn());
    const p = getComponentValueStrict(Player, b.entity);
    b.ledger.spark = b.ledger.startSpark = p.spark;
    event({ kind: "spawn", bot: b.name, strategy: b.strategy, spark: p.spark });
  }
  log(`${bots.length} bots spawned`);

  const recorder = args.record ? await startRecording({ clientUrl: args.clientUrl, outDir, title: `${scenario.name} · ${scenario.blurb}`, worldAddress }) : null;

  const beaconViews = () =>
    [...runQuery([Has(Bounty)])].map((e) => {
      const b = getComponentValueStrict(Bounty, e);
      return { jobId: decodeEntity(Bounty.metadata.keySchema, e).jobId, status: b.status, verification: b.verification, rewardCents: b.rewardCents, scoutCount: b.scoutCount, x: b.x, z: b.z };
    });
  const stakesOf = (bot: Bot) => {
    const m = new Map<bigint, boolean>();
    for (const e of runQuery([Has(Scout)])) {
      const k = decodeEntity(Scout.metadata.keySchema, e);
      if (k.player === bot.entity) m.set(k.jobId, getComponentValueStrict(Scout, e).harvested);
    }
    return m;
  };

  const ticks: TickRow[] = [];
  writeFileSync(join(outDir, "ticks.csv"), "tick,posted,open,inProgress,completed,refunded,expired,openUsd,paidUsd,refundedUsd,sparkSupply,scoutsPlaced,harvests\n");
  let scoutsPlaced = 0, harvests = 0;

  for (let tick = 1; tick <= scenario.ticks; tick++) {
    const t0 = Date.now();
    // 1. the market moves
    let events: MarketEvent[] = [];
    if (scenario.market === "synthetic") events = stepMarket(market, scenario, r);
    else if (tick % 10 === 0) liveFrontier = null; // re-fetch the live board every 10 ticks
    await pushMarket(label(tick));
    for (const e of events) event({ ...e, kind: `market.${e.kind}`, tick });

    // 2. the bots act — up to `steps` transactions each, walking counts as one
    const beacons = beaconViews();
    for (let step = 0; step < args.steps; step++) {
      for (const b of bots) {
        const pos = getComponentValueStrict(Position, b.entity);
        const pl = getComponentValueStrict(Player, b.entity);
        const view: BotView = { x: pos.x, z: pos.z, spark: pl.spark, stakes: stakesOf(b), beacons };
        const action = decide(b.strategy, view, r, b.target);
        if (action.kind === "idle") continue;
        try {
          if (action.kind === "move") {
            b.target = action.toward;
            await wait(await b.world.write.frontier__move([action.x, action.z]));
          } else if (action.kind === "scout") {
            b.target = null;
            await wait(await b.world.write.frontier__scout([action.jobId]));
            b.ledger.scouts++;
            scoutsPlaced++;
          } else if (action.kind === "harvest") {
            await wait(await b.world.write.frontier__harvest([action.jobId]));
            b.ledger.harvests++;
            harvests++;
          }
          event({ kind: `bot.${action.kind}`, tick, step, bot: b.name, strategy: b.strategy, ...("jobId" in action ? { jobId: action.jobId.toString() } : {}), ...("x" in action ? { x: action.x, z: action.z } : {}) });
        } catch (err) {
          b.target = null;
          event({ kind: "bot.revert", tick, step, bot: b.name, action: action.kind, error: err instanceof Error ? err.message.split("\n")[0].slice(0, 160) : String(err) });
        }
        b.ledger.spark = getComponentValueStrict(Player, b.entity).spark;
      }
      // scouts change scoutCount, which herd/contrarian read
      beacons.splice(0, beacons.length, ...beaconViews());
    }
    // burned = stakes on beacons that settled without paying
    for (const b of bots) {
      let burned = 0;
      for (const [jobId, harvested] of stakesOf(b)) {
        const bc = beacons.find((x) => x.jobId === jobId);
        if (!harvested && bc && (bc.status === 5 || bc.status === 7 || bc.status === 8)) burned++;
      }
      b.ledger.burned = burned;
    }

    // 3. metrics
    const stats = scenario.market === "synthetic" ? marketStats(market) : liveStats(beacons);
    const row: TickRow = { tick, ...stats, sparkSupply: bots.reduce((a, b) => a + b.ledger.spark, 0), scoutsPlaced, harvests };
    ticks.push(row);
    appendFileSync(join(outDir, "ticks.csv"), Object.values(row).join(",") + "\n");
    if (tick % 10 === 0 || tick === scenario.ticks) log(`tick ${tick}/${scenario.ticks} · posted ${row.posted} open ${row.open} done ${row.completed} refunded ${row.refunded} · scouts ${scoutsPlaced} harvests ${harvests} · spark ${row.sparkSupply}`);

    const spent = Date.now() - t0;
    if (spent < args.tickMs) await new Promise((res) => setTimeout(res, args.tickMs - spent));
  }

  // ---- summary
  const table = strategyTable(bots.map((b) => b.ledger));
  const last = ticks[ticks.length - 1];
  const summary = {
    scenario: { name: scenario.name, blurb: scenario.blurb, seed: scenario.seed, ticks: scenario.ticks, bots: scenario.bots, market: scenario.market, handselUrl: scenario.market === "live" ? args.handselUrl : null },
    world: worldAddress,
    market: last,
    strategies: table,
    bots: bots.map((b) => b.ledger),
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  const readme = [
    `# Handsel Frontier — ${scenario.name}`,
    "",
    scenario.blurb,
    "",
    scenario.market === "synthetic"
      ? `This is a **simulation**: a generated market (seed ${scenario.seed}, ${scenario.ticks} ticks). No real Handsel job, agent or money appears in it.`
      : `The market is the **live Handsel board** at ${args.handselUrl}, mirrored read-only. The scouts are simulated players; nothing they do touches Handsel.`,
    "",
    "## Market at the end",
    "",
    formatTable([last as unknown as Record<string, string | number>]),
    "",
    "## Strategies (spark is the only currency; every bot starts with 10)",
    "",
    formatTable(table as unknown as Record<string, string | number>[]),
    "",
    "Strategies: **whale** chases the biggest bounty · **verifier** prefers machine-graded jobs · **bargain** cheap bets close by · **herd** follows other scouts · **contrarian** avoids them · **random**.",
    "",
    `World \`${worldAddress}\` on a local anvil · game: Kairose-master/mud \`games/handsel-frontier\` · market: Kairose-master/handsel`,
  ].join("\n");
  writeFileSync(join(outDir, "README.md"), readme);
  console.log("\n" + readme + "\n");

  if (recorder) {
    const video = await recorder.stop();
    log(`video ${video}`);
  }
  log(`output ${outDir}`);
  if (anvil) anvil.kill();
  process.exit(0);
}

function liveStats(beacons: { status: number; rewardCents: number }[]) {
  const n = (s: number[]) => beacons.filter((b) => s.includes(b.status));
  const usd = (xs: { rewardCents: number }[]) => xs.reduce((a, b) => a + b.rewardCents, 0) / 100;
  return {
    posted: beacons.length,
    open: n([1]).length,
    inProgress: n([2, 3]).length,
    completed: n([4]).length,
    refunded: n([5, 7]).length,
    expired: n([8]).length,
    openUsd: usd(n([1, 2, 3])),
    paidUsd: usd(n([4])),
    refundedUsd: usd(n([5, 7])),
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
