import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, createWalletClient, getAddress, getContract, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mudFoundry, garnet, redstone } from "@latticexyz/common/chains";
import { baseSepolia } from "viem/chains";
import IWorldAbi from "contracts/out/IWorld.sol/IWorld.abi.json" with { type: "json" };
import { applyPlan, composeFromLegacy, emptySnapshot, normalizeFrontierFeed, planSync, type Frontier, type Snapshot } from "./frontier";

/**
 * The Frontier oracle: mirrors Handsel's public feed into the World.
 *
 *   Handsel  --HTTP (public, read-only)-->  this process  --tx (owner key)-->  OracleSystem
 *
 * It holds the namespace owner's key and nothing else — no Handsel credentials,
 * because Handsel's side of this is unauthenticated by design. Every value it
 * writes is a number Handsel published; the one thing it adds, the totem
 * ring's shape, is the same formula Handsel's own feed uses.
 */
const env = (k: string, fallback?: string): string => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`${k} is required`);
  return v;
};

const HANDSEL_URL = env("HANDSEL_URL", "https://handsel-nu.vercel.app").replace(/\/+$/, "");
const RPC_URL = env("RPC_URL", "http://127.0.0.1:8545");
const CHAIN_ID = Number(env("CHAIN_ID", "31337"));
const PRIVATE_KEY = env("PRIVATE_KEY") as Hex;
const INTERVAL = Math.max(5, Number(env("INTERVAL_SECONDS", "30")));
const ONCE = process.argv.includes("--once");

const chains = [mudFoundry, garnet, redstone, baseSepolia];
const chain = chains.find((c) => c.id === CHAIN_ID);
if (!chain) throw new Error(`unsupported CHAIN_ID ${CHAIN_ID}`);

function worldAddress(): Hex {
  if (process.env.WORLD_ADDRESS) return getAddress(process.env.WORLD_ADDRESS);
  const here = dirname(fileURLToPath(import.meta.url));
  const worlds = JSON.parse(readFileSync(join(here, "../../contracts/worlds.json"), "utf8")) as Record<string, { address: Hex }>;
  const w = worlds[String(CHAIN_ID)];
  if (!w) throw new Error(`no world deployed for chain ${CHAIN_ID} in contracts/worlds.json (set WORLD_ADDRESS to override)`);
  return getAddress(w.address);
}

async function getJson(url: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

/** The combined feed when Handsel serves it; the two older feeds otherwise. */
async function fetchFrontier(): Promise<Frontier> {
  const combined = await getJson(`${HANDSEL_URL}/api/world/frontier`);
  if (combined.ok) return normalizeFrontierFeed(combined.body, HANDSEL_URL);
  if (combined.status !== 404) {
    const detail = (combined.body as { detail?: string; error?: string } | null) ?? {};
    throw new Error(`frontier feed HTTP ${combined.status}: ${detail.detail ?? detail.error ?? "unreadable"}`);
  }
  const [tasks, agents] = await Promise.all([getJson(`${HANDSEL_URL}/api/tasks?status=all&limit=50`), getJson(`${HANDSEL_URL}/api/world/agents?limit=24`)]);
  if (!tasks.ok) {
    const detail = (tasks.body as { detail?: string; error?: string } | null) ?? {};
    throw new Error(`task feed HTTP ${tasks.status}: ${detail.detail ?? detail.error ?? "unreadable"}`);
  }
  return composeFromLegacy(tasks.body, agents.ok ? agents.body : { agents: [] }, HANDSEL_URL);
}

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ chain, transport: http(RPC_URL), account });
  const address = worldAddress();
  const world = getContract({ address, abi: IWorldAbi, client: { public: publicClient, wallet: walletClient } });

  console.log(`[oracle] mirroring ${HANDSEL_URL} -> world ${address} on chain ${CHAIN_ID} as ${account.address}`);

  let snapshot: Snapshot = emptySnapshot();

  const tick = async () => {
    const frontier = await fetchFrontier();
    const plan = planSync(snapshot, frontier);
    const wait = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });

    if (plan.bounties.length) {
      for (let i = 0; i < plan.bounties.length; i += 40) {
        const batch = plan.bounties.slice(i, i + 40);
        const hash = await world.write.frontier__syncBounties([
          batch.map((b) => BigInt(b.jobId)),
          batch.map((b) => b.statusCode),
          batch.map((b) => b.verificationCode),
          batch.map((b) => b.rewardCents),
        ]);
        await wait(hash);
      }
    }
    if (plan.totems.length) {
      const hash = await world.write.frontier__syncTotems([
        plan.totems.map((t) => ({
          slot: t.slot,
          creditScore: t.creditScore,
          jobsDone: t.jobsDone,
          earnedCents: BigInt(t.earnedCents),
          x: t.tile.x,
          z: t.tile.z,
          name: t.name,
        })),
      ]);
      await wait(hash);
    }
    if (plan.clearTotems) {
      await wait(await world.write.frontier__clearTotems([plan.clearTotems.from, plan.clearTotems.to]));
    }
    await wait(
      await world.write.frontier__syncMeta([
        frontier.meta.chainId,
        frontier.meta.realMoney,
        frontier.meta.environment,
        frontier.source,
        (frontier.meta.contractAddress ?? "0x0000000000000000000000000000000000000000") as Hex,
        frontier.beacons.length,
        frontier.totems.length,
      ]),
    );
    snapshot = applyPlan(snapshot, frontier);
    console.log(
      `[oracle] ${new Date().toISOString()} ${frontier.meta.environment}/${frontier.meta.chainId} realMoney=${frontier.meta.realMoney} beacons=${frontier.beacons.length} (+${plan.bounties.length} written) totems=${frontier.totems.length} (+${plan.totems.length} written${plan.clearTotems ? `, cleared ${plan.clearTotems.from}-${plan.clearTotems.to}` : ""})`,
    );
  };

  for (;;) {
    try {
      await tick();
    } catch (err) {
      console.error(`[oracle] tick failed: ${err instanceof Error ? err.message : String(err)}`);
      if (ONCE) process.exit(1);
    }
    if (ONCE) return;
    await new Promise((r) => setTimeout(r, INTERVAL * 1000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
