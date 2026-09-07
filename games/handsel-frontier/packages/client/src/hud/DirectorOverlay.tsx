import { useEffect, useState } from "react";
import { useEntityQuery } from "@latticexyz/react";
import { Has, getComponentValueStrict } from "@latticexyz/recs";
import { useMUD } from "../MUDContext";
import { directorTitle, type WorldEvent } from "../director";

const panel: React.CSSProperties = {
  position: "absolute",
  background: "rgba(10, 13, 24, 0.82)",
  border: "1px solid #232b45",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 14,
  lineHeight: 1.45,
  backdropFilter: "blur(6px)",
  zIndex: 20,
};

const TONE: Record<WorldEvent["tone"], string> = { good: "#3ddc97", bad: "#ff8a8a", neutral: "#c7cde0", gold: "#ffd166" };

declare global {
  interface Window {
    /** The recorder narrates through these: a caption line, and a closing card. */
    __frontierCaption?: (text: string | null) => void;
    __frontierEndCard?: (html: string | null) => void;
  }
}

/** What the recorder sees on top of the board: title, market panel, ticker, captions. */
export function DirectorOverlay({ events }: { events: WorldEvent[] }) {
  const title = directorTitle();
  const [caption, setCaption] = useState<string | null>(null);
  const [endCard, setEndCard] = useState<string | null>(null);
  useEffect(() => {
    window.__frontierCaption = (t) => setCaption(t);
    window.__frontierEndCard = (h) => setEndCard(h);
    return () => {
      delete window.__frontierCaption;
      delete window.__frontierEndCard;
    };
  }, []);
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {caption && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 150,
            transform: "translateX(-50%)",
            maxWidth: 1100,
            padding: "12px 22px",
            background: "rgba(7, 9, 15, 0.78)",
            border: "1px solid #3a4160",
            borderRadius: 12,
            fontSize: 30,
            fontWeight: 600,
            lineHeight: 1.3,
            textAlign: "center",
            color: "#ffffff",
            textShadow: "0 2px 6px #000",
            zIndex: 30,
          }}
        >
          {caption}
        </div>
      )}
      {endCard && (
        <div
          style={{ position: "absolute", inset: 0, background: "rgba(7, 9, 15, 0.92)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center" }}
          dangerouslySetInnerHTML={{ __html: endCard }}
        />
      )}
      <div style={{ ...panel, top: 12, left: 12, maxWidth: 420 }}>
        <div style={{ fontWeight: 800, fontSize: 20 }}>Handsel Frontier</div>
        <div style={{ opacity: 0.8, fontSize: 13 }}>{title ?? "the labor market as a map"}</div>
      </div>
      <MarketPanel />
      <div style={{ ...panel, bottom: 12, left: 12, width: 520, minHeight: 60 }}>
        <div style={{ fontWeight: 700, marginBottom: 4, opacity: 0.7, fontSize: 12, letterSpacing: 1 }}>ON CHAIN</div>
        {events.length === 0 && <div style={{ opacity: 0.5 }}>waiting for the first block…</div>}
        {events.map((e, i) => (
          <div key={e.id} style={{ color: TONE[e.tone], opacity: Math.max(0.25, 1 - i * 0.12), fontWeight: i === 0 ? 700 : 400 }}>
            {e.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketPanel() {
  const {
    components: { Bounty },
  } = useMUD();
  const rows = useEntityQuery([Has(Bounty)]).map((e) => getComponentValueStrict(Bounty, e));
  const count = (s: number[]) => rows.filter((r) => s.includes(r.status)).length;
  const usd = (s: number[]) => rows.filter((r) => s.includes(r.status)).reduce((a, r) => a + r.rewardCents, 0) / 100;
  const scouts = rows.reduce((a, r) => a + r.scoutCount, 0);
  const cell = (label: string, value: string, color = "#e6e9f2") => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 18 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <b style={{ color }}>{value}</b>
    </div>
  );
  return (
    <div style={{ ...panel, bottom: 12, right: 12, minWidth: 240 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, opacity: 0.7, fontSize: 12, letterSpacing: 1 }}>MARKET</div>
      {cell("open", `${count([1])} · $${usd([1]).toFixed(0)}`)}
      {cell("in progress", `${count([2, 3])} · $${usd([2, 3]).toFixed(0)}`, "#8fb4ff")}
      {cell("paid out", `${count([4])} · $${usd([4]).toFixed(0)}`, "#3ddc97")}
      {cell("refunded / expired", `${count([5, 7, 8])} · $${usd([5, 7, 8]).toFixed(0)}`, "#ff8a8a")}
      {cell("stakes placed", String(scouts), "#ffd166")}
    </div>
  );
}
