// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { System } from "@latticexyz/world/src/System.sol";
import { Player, Position } from "../codegen/index.sol";
import { FrontierLayout } from "../FrontierLayout.sol";

contract SpawnSystem is System {
  error AlreadySpawned();

  /** Any wallet becomes a player once. Spark is the only resource; it is
   *  minted here and nowhere else except a successful harvest. */
  function spawn() public {
    bytes32 id = bytes32(uint256(uint160(_msgSender())));
    if (Player.getSpawnedAt(id) != 0) revert AlreadySpawned();

    (int32 x, int32 z) = FrontierLayout.spawnTile(id);
    Player.set(id, uint64(block.timestamp), FrontierLayout.SPAWN_SPARK, 0, 0);
    Position.set(id, x, z);
  }
}
