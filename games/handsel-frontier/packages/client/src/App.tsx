import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Scene } from "./scene/Scene";
import { HUD } from "./hud/HUD";
import { UIContext } from "./state";
import { useHandselFeed } from "./handsel/feed";
import { useKeyboardMovement } from "./useKeyboardMovement";
import { useComponentValue } from "@latticexyz/react";
import { singletonEntity } from "@latticexyz/store-sync/recs";
import { useMUD } from "./MUDContext";
import { isDirector, useWorldEvents } from "./director";
import { DirectorOverlay } from "./hud/DirectorOverlay";

export const App = () => {
  // `?job=<id>` deep-links to a beacon, so Handsel can point at a job on the map.
  const [selectedJobId, setSelected] = useState<bigint | null>(() => {
    const raw = new URLSearchParams(window.location.search).get("job");
    return raw && /^\d+$/.test(raw) ? BigInt(raw) : null;
  });
  // A simulated world has no Handsel text to fetch — and must not look like it tried.
  const {
    components: { WorldMeta },
  } = useMUD();
  const meta = useComponentValue(WorldMeta, singletonEntity);
  const feed = useHandselFeed(30_000, meta?.environment !== "simulation");
  const ui = useMemo(() => ({ selectedJobId, select: setSelected, feed }), [selectedJobId, feed]);
  useKeyboardMovement();
  const events = useWorldEvents(10);
  const director = isDirector();

  return (
    <UIContext.Provider value={ui}>
      <div style={{ position: "relative", height: "100vh" }}>
        <Canvas shadows camera={{ fov: 45, near: 0.1, far: 200, position: [9, 11, 9] }} onPointerMissed={() => setSelected(null)}>
          <Scene events={events} />
        </Canvas>
        <HUD director={director} />
        {director && <DirectorOverlay events={events} />}
      </div>
    </UIContext.Provider>
  );
};
