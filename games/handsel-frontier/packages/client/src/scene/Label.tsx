import { Html } from "@react-three/drei";
import type { CSSProperties, ReactNode } from "react";

/**
 * A floating label. DOM, not a text mesh: drei's <Text> suspends on a font it
 * fetches from a CDN, and one unreachable CDN blanked the whole scene during
 * the first headless render. A label must never be able to take the board
 * down with it.
 */
export function Label({
  position,
  children,
  color = "#e6e9f2",
  size = 12,
  maxWidth,
}: {
  position: [number, number, number];
  children: ReactNode;
  color?: string;
  size?: number;
  maxWidth?: number;
}) {
  const style: CSSProperties = {
    pointerEvents: "none",
    userSelect: "none",
    whiteSpace: maxWidth ? "normal" : "nowrap",
    maxWidth,
    textAlign: "center",
    color,
    fontSize: size,
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    textShadow: "0 0 3px #07090f, 0 0 6px #07090f, 0 1px 2px #000",
    lineHeight: 1.25,
  };
  return (
    <Html position={position} center distanceFactor={14} zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
      <div style={style}>{children}</div>
    </Html>
  );
}
