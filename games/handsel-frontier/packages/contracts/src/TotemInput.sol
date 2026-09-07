// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

/** One leaderboard row as the oracle hands it over — its own file so the
 *  generated world interface can import it by name. */
struct TotemInput {
  uint8 slot;
  uint32 creditScore;
  uint32 jobsDone;
  uint64 earnedCents;
  int32 x;
  int32 z;
  string name;
}
