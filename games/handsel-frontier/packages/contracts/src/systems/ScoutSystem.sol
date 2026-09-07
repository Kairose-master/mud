// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { System } from "@latticexyz/world/src/System.sol";
import { Player, PlayerData, Position, PositionData, Bounty, BountyData, Scout } from "../codegen/index.sol";
import { BountyStatus } from "../codegen/common.sol";
import { FrontierLayout } from "../FrontierLayout.sol";
import { NotSpawned } from "../Errors.sol";

/**
 * Scouting is the game's one bet: stand near a beacon and stake a spark that
 * the job behind it will be completed. Handsel decides the outcome — the
 * oracle mirrors the job's status, and only a `Completed` status pays. The
 * contract never guesses at a verdict, never moves market money, and cannot
 * be told by a player what a job's status is.
 */
contract ScoutSystem is System {
  error NoSuchBounty();
  error BountySettled();
  error TooFar();
  error AlreadyScouted();
  error NoSpark();
  error NotCompleted();
  error NotScouted();
  error AlreadyHarvested();

  function scout(uint256 jobId) public {
    bytes32 id = bytes32(uint256(uint160(_msgSender())));
    PlayerData memory p = Player.get(id);
    if (p.spawnedAt == 0) revert NotSpawned();

    BountyData memory b = Bounty.get(jobId);
    if (b.status == BountyStatus.None) revert NoSuchBounty();
    if (!isLive(b.status)) revert BountySettled();

    PositionData memory pos = Position.get(id);
    if (FrontierLayout.chebyshev(pos.x, pos.z, b.x, b.z) > FrontierLayout.SCOUT_RANGE) revert TooFar();
    if (Scout.getAt(jobId, id) != 0) revert AlreadyScouted();
    if (p.spark < FrontierLayout.SCOUT_COST) revert NoSpark();

    Player.setSpark(id, p.spark - FrontierLayout.SCOUT_COST);
    Player.setScouts(id, p.scouts + 1);
    Scout.set(jobId, id, uint64(block.timestamp), false);
    Bounty.setScoutCount(jobId, b.scoutCount + 1);
  }

  /** Pays out once the mirrored status says Completed. The pot is one spark
   *  per whole dollar of the bounty plus HARVEST_BONUS, split evenly among
   *  everyone who scouted it (pari-mutuel), never below 1. Distance no longer
   *  matters — the bet was placed in person, the payout is a receipt. */
  function harvest(uint256 jobId) public {
    bytes32 id = bytes32(uint256(uint160(_msgSender())));
    PlayerData memory p = Player.get(id);
    if (p.spawnedAt == 0) revert NotSpawned();

    BountyData memory b = Bounty.get(jobId);
    if (b.status == BountyStatus.None) revert NoSuchBounty();
    if (b.status != BountyStatus.Completed) revert NotCompleted();

    if (Scout.getAt(jobId, id) == 0) revert NotScouted();
    if (Scout.getHarvested(jobId, id)) revert AlreadyHarvested();

    Scout.setHarvested(jobId, id, true);
    Player.setSpark(id, p.spark + payout(b.rewardCents, b.scoutCount));
    Player.setHarvests(id, p.harvests + 1);
  }

  /** Exposed for the client and the bots, which mirror it in TypeScript. */
  function payout(uint32 rewardCents, uint32 scoutCount) public pure returns (uint32) {
    uint32 pot = rewardCents / 100 + FrontierLayout.HARVEST_BONUS;
    uint32 share = pot / (scoutCount == 0 ? 1 : scoutCount);
    return share < 1 ? 1 : share;
  }

  function isLive(BountyStatus s) internal pure returns (bool) {
    return s == BountyStatus.Open || s == BountyStatus.Accepted || s == BountyStatus.Submitted;
  }
}
