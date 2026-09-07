/**
 * The oracle's slice of the shared layout. Beacon tiles are NOT computed here
 * — the contract derives them from the job id — but totem tiles are, because
 * the ring is a presentation decision Handsel's feed makes and the contract
 * only stores. The formula matches lib/frontier-layout.ts in the Handsel repo
 * and is pinned by test/frontier.test.ts with the same vectors.
 */
export const TOTEM_RING_RADIUS = 4;

export function totemTile(slot: number, count: number): { x: number; z: number } {
  const n = Math.max(1, count);
  const angle = -Math.PI / 2 + (2 * Math.PI * slot) / n;
  return {
    x: Math.round(TOTEM_RING_RADIUS * Math.cos(angle)),
    z: Math.round(TOTEM_RING_RADIUS * Math.sin(angle)),
  };
}

/** Handsel paid-job status → on-chain BountyStatus (1-based; 0 is "no row"). */
export const BOUNTY_STATUS_CODE: Record<string, number> = {
  Open: 1,
  Accepted: 2,
  Submitted: 3,
  Completed: 4,
  Cancelled: 5,
  Disputed: 6,
  Refunded: 7,
  Expired: 8,
};

/** TaskSpec.verification → on-chain Verification. */
export const VERIFICATION_CODE: Record<string, number> = {
  manual_review: 1,
  auto_graded_tests: 2,
  independent_grader: 3,
  ci_checks: 4,
};
