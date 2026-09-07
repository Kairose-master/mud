import { defineWorld } from "@latticexyz/world";

/**
 * Handsel Frontier — the Handsel labor market as a place.
 *
 * Every open Handsel job is a BEACON on this map; every ranked Handsel agent is
 * a TOTEM in the plaza. Neither is invented here: an oracle (packages/oracle)
 * mirrors Handsel's public feed (`GET /api/world/frontier`) into the Bounty and
 * Totem tables, and only the namespace owner may write them. Players — any
 * wallet — spawn, walk the grid, and SCOUT beacons they believe will be
 * completed. When Handsel later reports the job Completed, the scout HARVESTS
 * spark. Cancelled or refunded jobs pay nothing. That is the whole game: a
 * prediction market on other agents' work, with the market itself as terrain.
 *
 * Numbers only cross the bridge. Job titles, descriptions and acceptance
 * criteria stay on Handsel; the client reads them from the same public feed
 * when a beacon is selected. The chain holds ids, statuses, cents and tiles.
 */
export default defineWorld({
  namespace: "frontier",
  systems: {
    // Only the deployer (namespace owner) and addresses it grants may mirror
    // the market. Everything a player can do is open.
    OracleSystem: { openAccess: false },
  },
  enums: {
    // Mirrors Handsel's on-chain LaborMarket status enum, 1-based so that a
    // zero row means "no such bounty" rather than "Open".
    BountyStatus: ["None", "Open", "Accepted", "Submitted", "Completed", "Cancelled", "Disputed", "Refunded", "Expired"],
    // Mirrors TaskSpec.verification (lib/task-spec.ts in the Handsel repo).
    Verification: ["Unknown", "ManualReview", "AutoGradedTests", "IndependentGrader", "CiChecks"],
  },
  tables: {
    /** Which Handsel deployment this world mirrors — written by the oracle,
     *  never a constant. The HUD derives its testnet/mainnet disclosure from
     *  this row, the same rule Handsel's own UI follows. */
    WorldMeta: {
      schema: {
        chainId: "uint32",
        realMoney: "bool",
        syncedAt: "uint64",
        beaconCount: "uint32",
        totemCount: "uint32",
        marketContract: "address",
        environment: "string",
        source: "string",
      },
      key: [],
    },
    Player: {
      schema: {
        id: "bytes32",
        spawnedAt: "uint64",
        spark: "uint32",
        scouts: "uint32",
        harvests: "uint32",
      },
      key: ["id"],
    },
    Position: {
      schema: {
        id: "bytes32",
        x: "int32",
        z: "int32",
      },
      key: ["id"],
    },
    /** One row per Handsel job id, mirrored by the oracle. The tile is derived
     *  on-chain from the job id (FrontierLayout) so a client, the oracle and the
     *  contract can never disagree about where a beacon stands. */
    Bounty: {
      schema: {
        jobId: "uint256",
        status: "BountyStatus",
        verification: "Verification",
        rewardCents: "uint32",
        x: "int32",
        z: "int32",
        updatedAt: "uint64",
        scoutCount: "uint32",
      },
      key: ["jobId"],
    },
    /** The Handsel agent leaderboard, by rank slot, standing in a ring in the plaza. */
    Totem: {
      schema: {
        slot: "uint8",
        creditScore: "uint32",
        jobsDone: "uint32",
        earnedCents: "uint64",
        x: "int32",
        z: "int32",
        name: "string",
      },
      key: ["slot"],
    },
    /** A player's stake of intent on a bounty. */
    Scout: {
      schema: {
        jobId: "uint256",
        player: "bytes32",
        at: "uint64",
        harvested: "bool",
      },
      key: ["jobId", "player"],
    },
  },
});
