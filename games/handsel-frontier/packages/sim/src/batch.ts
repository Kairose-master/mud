import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HERE, ROOT } from "./chain";
import { formatTable } from "./metrics";
import type { Strategy } from "./bots";

/**
 * Many seeds, one scenario, no camera: how do the strategies do on average?
 *
 *   pnpm batch -- --scenario bust --runs 8 --ticks 60
 *
 * Each run gets its own fresh anvil on its own port, because a re-run on a
 * chain that already holds the previous run's bounties and stakes would not
 * be a re-run. Output: out/batch-<scenario>-<stamp>/ with every run's folder
 * and a summary.md of mean / min / max return per strategy.
 */
type Args = { scenario: string; runs: number; ticks?: number; bots?: number; tickMs: number; startPort: number; seed0: number; out: string };

function parseArgs(argv: string[]): Args {
  const a: Args = { scenario: "steady", runs: 5, tickMs: 150, startPort: 8600, seed0: 100, out: join(ROOT, "out") };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === "--scenario") a.scenario = v, i++;
    else if (k === "--runs") a.runs = Number(v), i++;
    else if (k === "--ticks") a.ticks = Number(v), i++;
    else if (k === "--bots") a.bots = Number(v), i++;
    else if (k === "--tick-ms") a.tickMs = Number(v), i++;
    else if (k === "--start-port") a.startPort = Number(v), i++;
    else if (k === "--seed0") a.seed0 = Number(v), i++;
    else if (k === "--out") a.out = v, i++;
  }
  return a;
}

function runOne(args: Args, i: number, outDir: string): Promise<void> {
  const port = args.startPort + i;
  const argv = ["src/index.ts", "--scenario", args.scenario, "--seed", String(args.seed0 + i), "--port", String(port), "--tick-ms", String(args.tickMs), "--out", outDir, "--redeploy"];
  if (args.ticks) argv.push("--ticks", String(args.ticks));
  if (args.bots) argv.push("--bots", String(args.bots));
  return new Promise((resolve, reject) => {
    const p = spawn("pnpm", ["exec", "tsx", ...argv], { cwd: HERE + "/..", stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, DEBUG: "" } });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`run ${i} exited ${code}`))));
  });
}

type Summary = { scenario: { seed: number }; strategies: { strategy: Strategy; roi: number; hitRate: number; scouts: number; harvests: number }[]; market: { completed: number; refunded: number; expired: number; posted: number } };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = join(args.out, `batch-${args.scenario}-${stamp}`);
  mkdirSync(outDir, { recursive: true });
  console.log(`[batch] ${args.scenario} × ${args.runs} runs → ${outDir}`);
  for (let i = 0; i < args.runs; i++) {
    console.log(`[batch] run ${i + 1}/${args.runs} (seed ${args.seed0 + i}, port ${args.startPort + i})`);
    await runOne(args, i, outDir);
  }
  const summaries: Summary[] = readdirSync(outDir)
    .filter((d) => d.startsWith(`${args.scenario}-`))
    .map((d) => JSON.parse(readFileSync(join(outDir, d, "summary.json"), "utf8")) as Summary);

  const by = new Map<Strategy, number[]>();
  const hits = new Map<Strategy, number[]>();
  for (const s of summaries)
    for (const r of s.strategies) {
      by.set(r.strategy, [...(by.get(r.strategy) ?? []), r.roi]);
      hits.set(r.strategy, [...(hits.get(r.strategy) ?? []), r.hitRate]);
    }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const rows = [...by.entries()]
    .map(([strategy, rois]) => ({
      strategy,
      runs: rois.length,
      meanReturn: mean(rois),
      minReturn: Math.min(...rois),
      maxReturn: Math.max(...rois),
      wins: summaries.filter((s) => s.strategies[0]?.strategy === strategy).length,
      meanHitRate: mean(hits.get(strategy) ?? []),
    }))
    .sort((a, b) => b.meanReturn - a.meanReturn);
  const market = {
    runs: summaries.length,
    meanCompleted: mean(summaries.map((s) => s.market.completed)),
    meanRefunded: mean(summaries.map((s) => s.market.refunded)),
    meanExpired: mean(summaries.map((s) => s.market.expired)),
    meanPosted: mean(summaries.map((s) => s.market.posted)),
  };
  const md = [
    `# Batch — ${args.scenario} × ${summaries.length} seeds`,
    "",
    "Return = (spark at the end − 10) / 10, pooled per strategy per run. `wins` = runs that strategy finished first.",
    "",
    formatTable(rows as unknown as Record<string, string | number>[]),
    "",
    formatTable([market as unknown as Record<string, string | number>]),
    "",
    `Seeds ${args.seed0}–${args.seed0 + summaries.length - 1}. Simulation — no real job, agent or money.`,
  ].join("\n");
  writeFileSync(join(outDir, "summary.md"), md);
  writeFileSync(join(outDir, "summary.json"), JSON.stringify({ scenario: args.scenario, rows, market, runs: summaries.map((s) => s.scenario.seed) }, null, 2));
  console.log("\n" + md + "\n[batch] done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
