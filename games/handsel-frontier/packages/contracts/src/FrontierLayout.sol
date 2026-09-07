// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

/**
 * Where things stand on the Frontier — the one place the map's geometry is
 * decided. The Handsel repo carries a TypeScript mirror of this library
 * (lib/frontier-layout.ts) with the same test vectors, so the market's feed,
 * the oracle and this contract all put a beacon on the same tile without ever
 * exchanging coordinates.
 *
 * Grid: integer tiles, x and z in [-WORLD_RADIUS, WORLD_RADIUS]. The plaza
 * (|x|, |z| <= PLAZA_RADIUS) is reserved for totems and spawning; a beacon
 * whose hash lands there is pushed straight out along z.
 */
library FrontierLayout {
  int32 internal constant WORLD_RADIUS = 24;
  int32 internal constant PLAZA_RADIUS = 5;
  int32 internal constant TOTEM_RING_RADIUS = 4;
  int32 internal constant SPAWN_RING_RADIUS = 2;
  /** Chebyshev distance within which a player may scout a beacon. */
  int32 internal constant SCOUT_RANGE = 2;

  uint32 internal constant SPAWN_SPARK = 10;
  uint32 internal constant SCOUT_COST = 1;
  /** Added to the whole dollars of a completed bounty to form the pot every
   *  scout of that bounty shares. Pari-mutuel: a crowd on one beacon splits
   *  it, a lone scout keeps it, and nobody ever harvests less than 1. */
  uint32 internal constant HARVEST_BONUS = 1;

  function abs32(int32 v) internal pure returns (int32) {
    return v < 0 ? -v : v;
  }

  function chebyshev(int32 ax, int32 az, int32 bx, int32 bz) internal pure returns (int32) {
    int32 dx = abs32(ax - bx);
    int32 dz = abs32(az - bz);
    return dx > dz ? dx : dz;
  }

  function inWorld(int32 x, int32 z) internal pure returns (bool) {
    return abs32(x) <= WORLD_RADIUS && abs32(z) <= WORLD_RADIUS;
  }

  function inPlaza(int32 x, int32 z) internal pure returns (bool) {
    return abs32(x) <= PLAZA_RADIUS && abs32(z) <= PLAZA_RADIUS;
  }

  /**
   * The tile a Handsel job's beacon stands on. keccak256(abi.encode(jobId)),
   * first four bytes -> x, next four -> z, each reduced onto the 2R+1 wide
   * grid; a plaza hit is pushed out by 2*PLAZA_RADIUS + 2 along z, which keeps
   * it inside the world because PLAZA_RADIUS*3 + 2 < WORLD_RADIUS.
   */
  function beaconTile(uint256 jobId) internal pure returns (int32 x, int32 z) {
    bytes32 h = keccak256(abi.encode(jobId));
    uint32 span = uint32(uint32(WORLD_RADIUS) * 2 + 1);
    x = int32(int256(uint256(uint32(bytes4(h)) % span))) - WORLD_RADIUS;
    z = int32(int256(uint256(uint32(bytes4(h << 32)) % span))) - WORLD_RADIUS;
    if (inPlaza(x, z)) {
      int32 push = PLAZA_RADIUS * 2 + 2;
      z = z >= 0 ? z + push : z - push;
    }
  }

  /** Where a new player appears: on the spawn ring, by address hash, so a
   *  crowd of newcomers does not stack on one tile. */
  function spawnTile(bytes32 player) internal pure returns (int32 x, int32 z) {
    uint8 side = uint8(uint256(keccak256(abi.encode(player))) % 8);
    int32 r = SPAWN_RING_RADIUS;
    if (side == 0) return (r, 0);
    if (side == 1) return (r, r);
    if (side == 2) return (0, r);
    if (side == 3) return (-r, r);
    if (side == 4) return (-r, 0);
    if (side == 5) return (-r, -r);
    if (side == 6) return (0, -r);
    return (r, -r);
  }
}
