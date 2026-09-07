import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, getAddress, getContract, http, keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mudFoundry } from "@latticexyz/common/chains";
import IWorldAbi from "contracts/out/IWorld.sol/IWorld.abi.json" with { type: "json" };

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "../../..");
export const CONTRACTS_DIR = join(ROOT, "packages/contracts");
export const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;

export type Rpc = { url: string; port: number };

export async function rpcUp(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Start anvil if nothing answers on the port. Returns the child to kill, or null if one was already there. */
export async function ensureAnvil(rpc: Rpc): Promise<ChildProcess | null> {
  if (await rpcUp(rpc.url)) return null;
  const child = spawn("anvil", ["--port", String(rpc.port), "--base-fee", "0", "--silent"], { stdio: "ignore", detached: false });
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await rpcUp(rpc.url)) return child;
  }
  child.kill();
  throw new Error("anvil did not come up (is foundry on PATH?)");
}

export function run(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

export function readWorldAddress(chainId: number): Hex | null {
  try {
    const worlds = JSON.parse(readFileSync(join(CONTRACTS_DIR, "worlds.json"), "utf8")) as Record<string, { address: Hex }>;
    return worlds[String(chainId)]?.address ? getAddress(worlds[String(chainId)].address) : null;
  } catch {
    return null;
  }
}

/** `mud deploy` against the RPC; a fresh anvil always needs it. */
export async function ensureDeployed(rpc: Rpc, chainId: number, force: boolean): Promise<Hex> {
  const existing = readWorldAddress(chainId);
  if (existing && !force) {
    // The address file may be stale (a fresh anvil has no code there).
    const client = createPublicClient({ chain: mudFoundry, transport: http(rpc.url) });
    const code = await client.getCode({ address: existing });
    if (code && code !== "0x") return existing;
  }
  // DEBUG="" keeps the contracts package's .env (DEBUG=mud:*) from flooding the episode log.
  await run("pnpm", ["mud", "deploy", "--rpc", rpc.url], CONTRACTS_DIR, { PRIVATE_KEY: ANVIL_KEY, DEBUG: "" });
  const addr = readWorldAddress(chainId);
  if (!addr) throw new Error("deploy did not write worlds.json");
  return addr;
}

/** Deterministic bot keys from a seed — no real key ever, and re-runnable. */
export function botKey(seed: number, index: number): Hex {
  return keccak256(toHex(`handsel-frontier-bot:${seed}:${index}`));
}

export function clientsFor(rpc: Rpc, key: Hex, worldAddress: Hex) {
  const account = privateKeyToAccount(key);
  const publicClient = createPublicClient({ chain: mudFoundry, transport: http(rpc.url), pollingInterval: 100 });
  const walletClient = createWalletClient({ chain: mudFoundry, transport: http(rpc.url), account });
  const world = getContract({ address: worldAddress, abi: IWorldAbi, client: { public: publicClient, wallet: walletClient } });
  return { account, publicClient, walletClient, world };
}

/** anvil_setBalance — bots need gas even at base fee zero (the tx still carries a gas price floor of 0, but viem estimates). */
export async function fund(rpc: Rpc, address: Hex, wei = 10n ** 20n): Promise<void> {
  await fetch(rpc.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "anvil_setBalance", params: [address, toHex(wei)] }),
  });
}
