import type { Hex } from "viem";
import type { Frontier, SyncPlan } from "./frontier";

/** Just enough of a viem public client to wait for receipts. */
export type ReceiptWaiter = { waitForTransactionReceipt: (args: { hash: Hex }) => Promise<unknown> };

/** The World handle the writer needs: the four owner-only systems. */
export type FrontierWorldWriter = {
  write: {
    frontier__syncBounties: (args: [bigint[], number[], number[], number[]]) => Promise<Hex>;
    frontier__syncTotems: (
      args: [{ slot: number; creditScore: number; jobsDone: number; earnedCents: bigint; x: number; z: number; name: string }[]],
    ) => Promise<Hex>;
    frontier__clearTotems: (args: [number, number]) => Promise<Hex>;
    frontier__syncMeta: (args: [number, boolean, string, string, Hex, number, number]) => Promise<Hex>;
  };
};

const ZERO = "0x0000000000000000000000000000000000000000" as Hex;

/**
 * Apply a plan to the World: bounties in batches of 40, totems in one call,
 * a clear if the board shrank, then the meta row last so a reader that sees
 * a new `syncedAt` knows the rows before it are already there.
 * Shared by the oracle (mirroring Handsel) and the simulator (driving a
 * synthetic market) — one writer, so neither can drift from the other.
 */
export async function applyPlanOnChain(world: FrontierWorldWriter, publicClient: ReceiptWaiter, plan: SyncPlan, frontier: Frontier): Promise<number> {
  const wait = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });
  let txs = 0;
  for (let i = 0; i < plan.bounties.length; i += 40) {
    const batch = plan.bounties.slice(i, i + 40);
    await wait(
      await world.write.frontier__syncBounties([
        batch.map((b) => BigInt(b.jobId)),
        batch.map((b) => b.statusCode),
        batch.map((b) => b.verificationCode),
        batch.map((b) => b.rewardCents),
      ]),
    );
    txs++;
  }
  if (plan.totems.length) {
    await wait(
      await world.write.frontier__syncTotems([
        plan.totems.map((t) => ({
          slot: t.slot,
          creditScore: t.creditScore,
          jobsDone: t.jobsDone,
          earnedCents: BigInt(t.earnedCents),
          x: t.tile.x,
          z: t.tile.z,
          name: t.name,
        })),
      ]),
    );
    txs++;
  }
  if (plan.clearTotems) {
    await wait(await world.write.frontier__clearTotems([plan.clearTotems.from, plan.clearTotems.to]));
    txs++;
  }
  await wait(
    await world.write.frontier__syncMeta([
      frontier.meta.chainId,
      frontier.meta.realMoney,
      frontier.meta.environment,
      frontier.source,
      (frontier.meta.contractAddress ?? ZERO) as Hex,
      frontier.beacons.length,
      frontier.totems.length,
    ]),
  );
  return txs + 1;
}
