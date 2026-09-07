import { createContext, useContext } from "react";
import type { FeedState } from "./handsel/feed";

/** UI-only state: which beacon the player is looking at, plus the feed. */
export type UIState = {
  selectedJobId: bigint | null;
  select: (jobId: bigint | null) => void;
  feed: FeedState;
};

export const UIContext = createContext<UIState | null>(null);

export function useUI(): UIState {
  const v = useContext(UIContext);
  if (!v) throw new Error("useUI outside UIContext");
  return v;
}
