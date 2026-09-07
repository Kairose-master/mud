import type { Scenario } from "./scenario";
import type { MarketEvent } from "./market";
import type { BotLedger } from "./metrics";
import { strategyTable } from "./metrics";

/**
 * Chapter captions for a recorded episode, generated from what actually
 * happened — never from the market model's dice. Korean by default, English
 * with `--lang en`. Pure, so a caption can be unit-tested like a rule.
 */
export type Lang = "ko" | "en";

const STRATEGY_NAME: Record<Lang, Record<string, string>> = {
  ko: { whale: "고래(최고 보상)", verifier: "검증파(기계 채점)", bargain: "가성비(가까운 싼 베팅)", herd: "군중(다수 추종)", contrarian: "역발상(소수 편)", random: "무작위" },
  en: { whale: "whale (biggest bounty)", verifier: "verifier (machine-graded)", bargain: "bargain (cheap & near)", herd: "herd (follow the crowd)", contrarian: "contrarian (avoid it)", random: "random" },
};

export function strategyName(s: string, lang: Lang): string {
  return STRATEGY_NAME[lang][s] ?? s;
}

const usd = (c: number) => `$${(c / 100).toFixed(0)}`;

export function introCaptions(s: Scenario, lang: Lang): string[] {
  const sim = s.market === "synthetic";
  if (lang === "ko") {
    return [
      sim ? `시뮬레이션 — ${s.name} 시나리오. 실제 잡·에이전트·돈은 없습니다.` : "진짜 Handsel 테스트넷 보드를 읽기 전용으로 미러합니다. 스카우트만 시뮬레이션.",
      "기둥 하나가 잡 하나. 높이는 보상, 색은 채점 방식.",
      `봇 ${s.bots}명이 각자 spark 10개로 시작합니다. 스카우트 = "이 잡은 완료된다"에 1 spark.`,
      "완료되면 스카우트끼리 판돈(달러 + 1)을 나눠 갖고, 취소·환불·만료면 잃습니다.",
    ];
  }
  return [
    sim ? `Simulation — the ${s.name} scenario. No real job, agent or money.` : "The real Handsel testnet board, mirrored read-only. Only the scouts are simulated.",
    "One beacon per job. Height is the bounty, colour is who grades it.",
    `${s.bots} bots start with 10 spark each. Scouting = 1 spark on "this job gets done".`,
    "Completed: scouts split the pot (dollars + 1). Cancelled, refunded, expired: gone.",
  ];
}

export type CaptionState = { firstScout: boolean; firstHarvest: boolean; firstBurn: boolean; bigPosted: number };

export function newCaptionState(): CaptionState {
  return { firstScout: false, firstHarvest: false, firstBurn: false, bigPosted: 0 };
}

/** A caption for a market event, or null when it is not worth a line. */
export function marketCaption(e: MarketEvent, st: CaptionState, lang: Lang): string | null {
  if (e.kind === "posted" && e.rewardCents > st.bigPosted * 1.5 && e.rewardCents >= 2000) {
    st.bigPosted = e.rewardCents;
    return lang === "ko" ? `새 잡 #${e.jobId} — ${usd(e.rewardCents)}. 지금까지 가장 큰 기둥.` : `New job #${e.jobId} — ${usd(e.rewardCents)}, the biggest beacon so far.`;
  }
  if (e.kind === "completed") return lang === "ko" ? `#${e.jobId} 완료 — ${e.worker}가 ${usd(e.rewardCents)}를 받습니다. 스카우트들은 수확 차례.` : `#${e.jobId} completed — ${e.worker} is paid ${usd(e.rewardCents)}. Scouts, harvest.`;
  if (e.kind === "refunded") return lang === "ko" ? `#${e.jobId} 환불 — ${e.worker}의 결과물이 채점을 통과 못 했습니다. 걸린 spark는 소각.` : `#${e.jobId} refunded — ${e.worker}'s work failed grading. Stakes on it burn.`;
  if (e.kind === "expired") return lang === "ko" ? `#${e.jobId} 만료 — 아무도 안 맡았습니다.` : `#${e.jobId} expired — nobody took it.`;
  return null;
}

export function botCaption(kind: "scout" | "harvest", bot: string, jobId: string, st: CaptionState, lang: Lang): string | null {
  if (kind === "scout" && !st.firstScout) {
    st.firstScout = true;
    return lang === "ko" ? `첫 스카우트: ${bot}가 #${jobId}에 1 spark를 겁니다.` : `First stake: ${bot} puts 1 spark on #${jobId}.`;
  }
  if (kind === "harvest" && !st.firstHarvest) {
    st.firstHarvest = true;
    return lang === "ko" ? `첫 수확: ${bot}가 #${jobId}의 판돈을 받습니다.` : `First harvest: ${bot} collects on #${jobId}.`;
  }
  return null;
}

/** Every N ticks: who is ahead, in one line. */
export function standingsCaption(bots: BotLedger[], tick: number, ticks: number, lang: Lang): string {
  const t = strategyTable(bots);
  const lead = t[0], last = t[t.length - 1];
  const pct = (r: number) => `${r >= 0 ? "+" : ""}${Math.round(r * 100)}%`;
  if (!lead) return "";
  return lang === "ko"
    ? `${tick}/${ticks}틱 — 선두 ${strategyName(lead.strategy, lang)} ${pct(lead.roi)}, 꼴찌 ${strategyName(last.strategy, lang)} ${pct(last.roi)}`
    : `Tick ${tick}/${ticks} — ${strategyName(lead.strategy, lang)} leads at ${pct(lead.roi)}, ${strategyName(last.strategy, lang)} trails at ${pct(last.roi)}`;
}

/** The closing card, as HTML the overlay renders on a dark ground. */
export function endCardHtml(s: Scenario, bots: BotLedger[], market: { completed: number; refunded: number; expired: number; paidUsd: number; refundedUsd: number }, lang: Lang): string {
  const t = strategyTable(bots);
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
  const pct = (r: number) => `${r >= 0 ? "+" : ""}${Math.round(r * 100)}%`;
  const rows = t
    .map(
      (r, i) =>
        `<tr><td style="padding:6px 14px;opacity:.7">${i + 1}</td><td style="padding:6px 14px">${esc(strategyName(r.strategy, lang))}</td><td style="padding:6px 14px;text-align:right;color:${r.roi >= 0 ? "#3ddc97" : "#ff8a8a"}">${pct(r.roi)}</td><td style="padding:6px 14px;text-align:right">${r.harvests}/${r.scouts}</td></tr>`,
    )
    .join("");
  const head = lang === "ko" ? ["순위", "전략", "수익률", "적중/스카우트"] : ["#", "strategy", "return", "hits/stakes"];
  const title = lang === "ko" ? `결과 — ${esc(s.name)}` : `Results — ${esc(s.name)}`;
  const line = lang === "ko"
    ? `완료 ${market.completed} · 환불 ${market.refunded} · 만료 ${market.expired} · 지급 $${market.paidUsd.toFixed(0)} · 환불 $${market.refundedUsd.toFixed(0)}`
    : `${market.completed} completed · ${market.refunded} refunded · ${market.expired} expired · $${market.paidUsd.toFixed(0)} paid · $${market.refundedUsd.toFixed(0)} refunded`;
  const foot = s.market === "synthetic" ? (lang === "ko" ? "시뮬레이션 — 실제 잡·에이전트·돈 없음" : "Simulation — no real job, agent or money") : lang === "ko" ? "실제 Handsel 테스트넷 보드 · 스카우트만 시뮬레이션" : "Real Handsel testnet board · scouts simulated";
  return `<div style="font-family:ui-sans-serif,system-ui,sans-serif;color:#e6e9f2;text-align:center">
<div style="font-size:44px;font-weight:800;margin-bottom:6px">Handsel Frontier</div>
<div style="font-size:26px;opacity:.85;margin-bottom:22px">${title}</div>
<table style="margin:0 auto;font-size:24px;border-collapse:collapse"><thead><tr style="opacity:.6;font-size:16px;letter-spacing:1px">${head.map((h) => `<th style="padding:6px 14px">${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
<div style="margin-top:22px;font-size:18px;opacity:.8">${line}</div>
<div style="margin-top:8px;font-size:14px;color:#ffd166">${foot}</div>
</div>`;
}
