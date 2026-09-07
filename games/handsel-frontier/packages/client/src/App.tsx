import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Scene } from "./scene/Scene";
import { HUD } from "./hud/HUD";
import { UIContext } from "./state";
import { useHandselFeed } from "./handsel/feed";
import { useKeyboardMovement } from "./useKeyboardMovement";

export const App = () => {
  // `?job=<id>` deep-links to a beacon, so Handsel can point at a job on the map.
  const [selectedJobId, setSelected] = useState<bigint | null>(() => {
    const raw = new URLSearchParams(window.location.search).get("job");
    return raw && /^\d+$/.test(raw) ? BigInt(raw) : null;
  });
  const feed = useHandselFeed();
  const ui = useMemo(() => ({ selectedJobId, select: setSelected, feed }), [selectedJobId, feed]);
  useKeyboardMovement();

  return (
    <UIContext.Provider value={ui}>
      <div style={{ position: "relative", height: "100vh" }}>
        <Canvas shadows camera={{ fov: 45, near: 0.1, far: 200, position: [9, 11, 9] }} onPointerMissed={() => setSelected(null)}>
          <Scene />
        </Canvas>
        <HUD />
      </div>
    </UIContext.Provider>
  );
};
