import type { Strategy } from "./bots";

export type BotLedger = { name: string; strategy: Strategy; spark: number; startSpark: number; scouts: number; harvests: number; burned: number };

export type TickRow = {
  tick: number;
  posted: number;
  open: number;
  inProgress: number;
  completed: number;
  refunded: number;
  expired: number;
  openUsd: number;
  paidUsd: number;
  refundedUsd: number;
  sparkSupply: number;
  scoutsPlaced: number;
  harvests: number;
};

/** Per-strategy return: spark now vs spark at spawn, pooled across bots. */
export function strategyTable(bots: BotLedger[]) {
  const by = new Map<Strategy, { bots: number; start: number; now: number; scouts: number; harvests: number; burned: number }>();
  for (const b of bots) {
    const row = by.get(b.strategy) ?? { bots: 0, start: 0, now: 0, scouts: 0, harvests: 0, burned: 0 };
    row.bots++;
    row.start += b.startSpark;
    row.now += b.spark;
    row.scouts += b.scouts;
    row.harvests += b.harvests;
    row.burned += b.burned;
    by.set(b.strategy, row);
  }
  return [...by.entries()]
    .map(([strategy, r]) => ({
      strategy,
      bots: r.bots,
      sparkStart: r.start,
      sparkEnd: r.now,
      roi: r.start ? (r.now - r.start) / r.start : 0,
      scouts: r.scouts,
      harvests: r.harvests,
      burned: r.burned,
      hitRate: r.scouts ? r.harvests / r.scouts : 0,
    }))
    .sort((a, b) => b.roi - a.roi);
}

export function formatTable(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "(empty)";
  const cols = Object.keys(rows[0]);
  const fmt = (v: string | number) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : v);
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => fmt(r[c]).length)));
  const line = (cells: string[]) => "| " + cells.map((c, i) => c.padEnd(widths[i])).join(" | ") + " |";
  return [line(cols), line(widths.map((w) => "-".repeat(w))), ...rows.map((r) => line(cols.map((c) => fmt(r[c]))))].join("\n");
}
