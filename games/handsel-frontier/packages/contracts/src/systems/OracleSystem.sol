// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { System } from "@latticexyz/world/src/System.sol";
import { WorldMeta, Bounty, Totem } from "../codegen/index.sol";
import { BountyStatus, Verification } from "../codegen/common.sol";
import { FrontierLayout } from "../FrontierLayout.sol";
import { TotemInput } from "../TotemInput.sol";

/**
 * The bridge from Handsel to the Frontier. `openAccess: false` in
 * mud.config.ts means only the namespace owner (the deployer) and addresses it
 * explicitly grants may call anything here — the oracle keeper in
 * packages/oracle runs with that key.
 *
 * It mirrors, it does not judge: every value written here is read from
 * Handsel's public feed, and the only thing this contract adds is the tile a
 * beacon stands on, derived from the job id.
 */
contract OracleSystem is System {
  error LengthMismatch();
  error BadStatus();
  error BadVerification();

  function syncMeta(
    uint32 chainId,
    bool realMoney,
    string calldata environment,
    string calldata source,
    address marketContract,
    uint32 beaconCount,
    uint32 totemCount
  ) public {
    WorldMeta.set(chainId, realMoney, uint64(block.timestamp), beaconCount, totemCount, marketContract, environment, source);
  }

  /** Upsert many bounties in one transaction. Tiles are computed here so the
   *  oracle cannot place a beacon anywhere but where the id says it belongs. */
  function syncBounties(
    uint256[] calldata jobIds,
    uint8[] calldata statuses,
    uint8[] calldata verifications,
    uint32[] calldata rewardCents
  ) public {
    uint256 n = jobIds.length;
    if (statuses.length != n || verifications.length != n || rewardCents.length != n) revert LengthMismatch();
    for (uint256 i; i < n; i++) {
      if (statuses[i] == 0 || statuses[i] > uint8(type(BountyStatus).max)) revert BadStatus();
      if (verifications[i] > uint8(type(Verification).max)) revert BadVerification();
      (int32 x, int32 z) = FrontierLayout.beaconTile(jobIds[i]);
      uint32 scouts = Bounty.getScoutCount(jobIds[i]);
      Bounty.set(
        jobIds[i],
        BountyStatus(statuses[i]),
        Verification(verifications[i]),
        rewardCents[i],
        x,
        z,
        uint64(block.timestamp),
        scouts
      );
    }
  }

  /** Rewrite the leaderboard ring. Slots are rank order; the oracle passes
   *  tiles it computed with the shared layout so the ring shape is one
   *  decision (Handsel's lib/frontier-layout.ts) rather than two. */
  function syncTotems(TotemInput[] calldata totems) public {
    for (uint256 i; i < totems.length; i++) {
      TotemInput calldata t = totems[i];
      Totem.set(t.slot, t.creditScore, t.jobsDone, t.earnedCents, t.x, t.z, t.name);
    }
  }

  /** Remove ranks [from, to) after the board shrank. */
  function clearTotems(uint8 from, uint8 to) public {
    for (uint8 s = from; s < to; s++) {
      Totem.deleteRecord(s);
    }
  }
}
