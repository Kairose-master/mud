import { useEffect, useRef } from "react";
import { useMUD } from "./MUDContext";

/**
 * WASD / arrows move one tile per transaction; Q E Z C step diagonally. Keys
 * are ignored while a move is in flight so a held key does not queue a
 * hundred transactions — the contract would reject all but the adjacent one.
 */
export const useKeyboardMovement = () => {
  const {
    systemCalls: { moveBy },
  } = useMUD();
  const busy = useRef(false);

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const map: Record<string, [number, number]> = {
        w: [0, -1],
        ArrowUp: [0, -1],
        s: [0, 1],
        ArrowDown: [0, 1],
        a: [-1, 0],
        ArrowLeft: [-1, 0],
        d: [1, 0],
        ArrowRight: [1, 0],
        q: [-1, -1],
        e: [1, -1],
        z: [-1, 1],
        c: [1, 1],
      };
      const step = map[e.key];
      if (!step || busy.current) return;
      e.preventDefault();
      busy.current = true;
      moveBy(step[0], step[1])
        .catch(() => undefined)
        .finally(() => {
          busy.current = false;
        });
    };

    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [moveBy]);
};
