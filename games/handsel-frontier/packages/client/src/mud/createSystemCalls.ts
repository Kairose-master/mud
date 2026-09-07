import { getComponentValue } from "@latticexyz/recs";
import { ClientComponents } from "./createClientComponents";
import { SetupNetworkResult } from "./setupNetwork";

export type SystemCalls = ReturnType<typeof createSystemCalls>;

/**
 * Everything a player can ask the World to do. Each call is one transaction
 * from the burner wallet; the contract enforces every rule (adjacency, range,
 * spark, status), so the client only ever *asks*.
 */
export function createSystemCalls(
  { worldContract, waitForTransaction, playerEntity }: SetupNetworkResult,
  { Position }: ClientComponents,
) {
  const spawn = async () => {
    const tx = await worldContract.write.frontier__spawn();
    await waitForTransaction(tx);
  };

  const moveTo = async (x: number, z: number) => {
    const tx = await worldContract.write.frontier__move([x, z]);
    await waitForTransaction(tx);
  };

  const moveBy = async (dx: number, dz: number) => {
    const pos = getComponentValue(Position, playerEntity);
    if (!pos) return;
    await moveTo(pos.x + dx, pos.z + dz);
  };

  const scout = async (jobId: bigint) => {
    const tx = await worldContract.write.frontier__scout([jobId]);
    await waitForTransaction(tx);
  };

  const harvest = async (jobId: bigint) => {
    const tx = await worldContract.write.frontier__harvest([jobId]);
    await waitForTransaction(tx);
  };

  return { spawn, moveTo, moveBy, scout, harvest };
}
