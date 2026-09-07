// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import "forge-std/Test.sol";
import { MudTest } from "@latticexyz/world/test/MudTest.t.sol";
import { IWorld } from "../src/codegen/world/IWorld.sol";
import { Player, Position, Bounty, Totem, Scout, WorldMeta } from "../src/codegen/index.sol";
import { BountyStatus, Verification } from "../src/codegen/common.sol";
import { FrontierLayout } from "../src/FrontierLayout.sol";
import { TotemInput } from "../src/TotemInput.sol";

contract FrontierTest is MudTest {
  IWorld world;
  address deployer = vm.addr(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80);
  address alice = address(0xA11CE);
  address bob = address(0xB0B);

  function setUp() public override {
    super.setUp();
    world = IWorld(worldAddress);
  }

  function key(address a) internal pure returns (bytes32) {
    return bytes32(uint256(uint160(a)));
  }

  function testWorldExists() public {
    uint256 codeSize;
    address addr = worldAddress;
    assembly {
      codeSize := extcodesize(addr)
    }
    assertTrue(codeSize > 0);
  }

  // ---- layout: these vectors are pinned on the Handsel side too
  // (tests/frontier-layout.test.ts). Change one, change both.
  function testBeaconTileVectors() public pure {
    (int32 x, int32 z) = FrontierLayout.beaconTile(1);
    assertEq(x, -12);
    assertEq(z, 0);
    (x, z) = FrontierLayout.beaconTile(2);
    assertEq(x, 10);
    assertEq(z, -13);
    (x, z) = FrontierLayout.beaconTile(42);
    assertEq(x, -2);
    assertEq(z, -15);
    (x, z) = FrontierLayout.beaconTile(1000);
    assertEq(x, 13);
    assertEq(z, 24);
  }

  function testBeaconTileNeverInPlazaAndAlwaysInWorld(uint256 jobId) public pure {
    (int32 x, int32 z) = FrontierLayout.beaconTile(jobId);
    assertTrue(FrontierLayout.inWorld(x, z));
    assertFalse(FrontierLayout.inPlaza(x, z));
  }

  // ---- oracle access
  function testOracleIsClosedToPlayers() public {
    uint256[] memory ids = new uint256[](1);
    uint8[] memory st = new uint8[](1);
    uint8[] memory ve = new uint8[](1);
    uint32[] memory rc = new uint32[](1);
    ids[0] = 7;
    st[0] = uint8(BountyStatus.Open);
    ve[0] = uint8(Verification.CiChecks);
    rc[0] = 500;
    vm.prank(alice);
    vm.expectRevert();
    world.frontier__syncBounties(ids, st, ve, rc);
  }

  function testOracleRejectsZeroStatus() public {
    uint256[] memory ids = new uint256[](1);
    uint8[] memory st = new uint8[](1);
    uint8[] memory ve = new uint8[](1);
    uint32[] memory rc = new uint32[](1);
    ids[0] = 7;
    vm.prank(deployer);
    vm.expectRevert();
    world.frontier__syncBounties(ids, st, ve, rc);
  }

  function seedBounty(uint256 jobId, BountyStatus status, uint32 cents) internal {
    uint256[] memory ids = new uint256[](1);
    uint8[] memory st = new uint8[](1);
    uint8[] memory ve = new uint8[](1);
    uint32[] memory rc = new uint32[](1);
    ids[0] = jobId;
    st[0] = uint8(status);
    ve[0] = uint8(Verification.AutoGradedTests);
    rc[0] = cents;
    vm.prank(deployer);
    world.frontier__syncBounties(ids, st, ve, rc);
  }

  function testOracleWritesTileFromJobId() public {
    seedBounty(42, BountyStatus.Open, 1250);
    assertEq(Bounty.getX(42), -2);
    assertEq(Bounty.getZ(42), -15);
    assertEq(uint8(Bounty.getStatus(42)), uint8(BountyStatus.Open));
    assertEq(Bounty.getRewardCents(42), 1250);
  }

  function testSyncMetaIsWhatTheHudReads() public {
    vm.prank(deployer);
    world.frontier__syncMeta(84532, false, "testnet", "https://handsel-nu.vercel.app", address(0xBEEF), 3, 2);
    assertEq(WorldMeta.getChainId(), 84532);
    assertEq(WorldMeta.getRealMoney(), false);
    assertEq(WorldMeta.getEnvironment(), "testnet");
    assertEq(WorldMeta.getBeaconCount(), 3);
  }

  function testTotemsSyncAndClear() public {
    TotemInput[] memory totems = new TotemInput[](2);
    totems[0] = TotemInput(0, 640, 9, 4200, 0, -4, "Architect");
    totems[1] = TotemInput(1, 120, 0, 0, 4, 0, "Red Team");
    vm.prank(deployer);
    world.frontier__syncTotems(totems);
    assertEq(Totem.getName(0), "Architect");
    assertEq(Totem.getCreditScore(1), 120);
    vm.prank(deployer);
    world.frontier__clearTotems(1, 2);
    assertEq(Totem.getCreditScore(1), 0);
    assertEq(bytes(Totem.getName(1)).length, 0);
    assertEq(Totem.getName(0), "Architect");
  }

  // ---- players
  function testSpawnOnce() public {
    vm.prank(alice);
    world.frontier__spawn();
    assertEq(Player.getSpark(key(alice)), FrontierLayout.SPAWN_SPARK);
    (int32 x, int32 z) = FrontierLayout.spawnTile(key(alice));
    assertEq(Position.getX(key(alice)), x);
    assertEq(Position.getZ(key(alice)), z);
    vm.prank(alice);
    vm.expectRevert();
    world.frontier__spawn();
  }

  function testMoveIsOneTileAndInsideWorld() public {
    vm.startPrank(alice);
    world.frontier__spawn();
    int32 x = Position.getX(key(alice));
    int32 z = Position.getZ(key(alice));
    world.frontier__move(x + 1, z + 1); // diagonal is one step
    assertEq(Position.getX(key(alice)), x + 1);
    vm.expectRevert();
    world.frontier__move(x + 3, z + 1);
    vm.stopPrank();
    vm.prank(bob);
    vm.expectRevert(); // never spawned
    world.frontier__move(0, 1);
  }

  function walkTo(address who, int32 targetX, int32 targetZ) internal {
    vm.startPrank(who);
    int32 x = Position.getX(key(who));
    int32 z = Position.getZ(key(who));
    while (x != targetX || z != targetZ) {
      if (x < targetX) x++;
      else if (x > targetX) x--;
      if (z < targetZ) z++;
      else if (z > targetZ) z--;
      world.frontier__move(x, z);
    }
    vm.stopPrank();
  }

  function testScoutThenHarvestPaysOnlyOnCompleted() public {
    seedBounty(42, BountyStatus.Open, 1250); // tile (-2, -15)
    vm.prank(alice);
    world.frontier__spawn();

    // Too far from the plaza.
    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSignature("TooFar()"));
    world.frontier__scout(42);

    walkTo(alice, -2, -13); // within SCOUT_RANGE (2)
    vm.prank(alice);
    world.frontier__scout(42);
    assertEq(Player.getSpark(key(alice)), FrontierLayout.SPAWN_SPARK - FrontierLayout.SCOUT_COST);
    assertEq(Bounty.getScoutCount(42), 1);
    assertTrue(Scout.getAt(42, key(alice)) != 0);

    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSignature("AlreadyScouted()"));
    world.frontier__scout(42);

    // Not completed yet: nothing to harvest.
    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSignature("NotCompleted()"));
    world.frontier__harvest(42);

    // A re-sync must keep the scout count.
    seedBounty(42, BountyStatus.Accepted, 1250);
    assertEq(Bounty.getScoutCount(42), 1);

    seedBounty(42, BountyStatus.Completed, 1250);
    vm.prank(alice);
    world.frontier__harvest(42);
    // 9 + 12 (whole dollars) + 2 bonus
    assertEq(Player.getSpark(key(alice)), 9 + 12 + FrontierLayout.HARVEST_BONUS);
    assertEq(Player.getHarvests(key(alice)), 1);

    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSignature("AlreadyHarvested()"));
    world.frontier__harvest(42);

    // A bystander who never scouted gets nothing.
    vm.prank(bob);
    world.frontier__spawn();
    vm.prank(bob);
    vm.expectRevert(abi.encodeWithSignature("NotScouted()"));
    world.frontier__harvest(42);
  }

  function testCancelledBountyPaysNothingAndCannotBeScouted() public {
    seedBounty(42, BountyStatus.Open, 1250);
    vm.prank(alice);
    world.frontier__spawn();
    walkTo(alice, -2, -13);
    vm.prank(alice);
    world.frontier__scout(42);

    seedBounty(42, BountyStatus.Cancelled, 1250);
    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSignature("NotCompleted()"));
    world.frontier__harvest(42);

    vm.prank(bob);
    world.frontier__spawn();
    walkTo(bob, -2, -13);
    vm.prank(bob);
    vm.expectRevert(abi.encodeWithSignature("BountySettled()"));
    world.frontier__scout(42);
  }

  function testScoutRunsOutOfSpark() public {
    vm.prank(alice);
    world.frontier__spawn();
    // Ten distinct live bounties all placed on the tile alice will stand near
    // is not something the layout allows, so drain spark by direct table
    // write instead — the rule under test is the spark check, not the walk.
    seedBounty(42, BountyStatus.Open, 100);
    walkTo(alice, -2, -13);
    vm.prank(deployer);
    Player.setSpark(key(alice), 0);
    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSignature("NoSpark()"));
    world.frontier__scout(42);
  }
}
