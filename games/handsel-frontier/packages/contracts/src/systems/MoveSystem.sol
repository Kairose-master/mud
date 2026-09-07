// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { System } from "@latticexyz/world/src/System.sol";
import { Player, Position, PositionData } from "../codegen/index.sol";
import { FrontierLayout } from "../FrontierLayout.sol";
import { NotSpawned } from "../Errors.sol";

contract MoveSystem is System {
  error NotAdjacent();
  error OutOfWorld();

  /** One tile per transaction, eight directions, inside the world. */
  function move(int32 x, int32 z) public {
    bytes32 id = bytes32(uint256(uint160(_msgSender())));
    if (Player.getSpawnedAt(id) == 0) revert NotSpawned();

    PositionData memory from = Position.get(id);
    if (FrontierLayout.chebyshev(from.x, from.z, x, z) != 1) revert NotAdjacent();
    if (!FrontierLayout.inWorld(x, z)) revert OutOfWorld();

    Position.set(id, x, z);
  }
}
