/* eslint-disable react/no-unknown-property */
import { useMemo } from "react";
import * as THREE from "three";
import { PLAZA_RADIUS, WORLD_RADIUS, TOTEM_RING_RADIUS } from "../layout";

/**
 * The board: a dark plane the size of the world, a faint tile grid, the plaza
 * disc where totems stand, and a bright rim at the world's edge so the
 * contract's OutOfWorld() has a visible reason.
 */
export function Ground() {
  const size = WORLD_RADIUS * 2 + 1;
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(size, size, 0x1d2537, 0x141a29);
    g.position.y = 0.01;
    return g;
  }, [size]);
  const plazaSize = PLAZA_RADIUS * 2 + 1;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color="#0c1020" roughness={0.95} metalness={0.05} />
      </mesh>
      <primitive object={grid} />
      {/* plaza */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[plazaSize, plazaSize]} />
        <meshStandardMaterial color="#151b31" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[TOTEM_RING_RADIUS - 0.15, TOTEM_RING_RADIUS + 0.15, 64]} />
        <meshBasicMaterial color="#2a3558" transparent opacity={0.8} />
      </mesh>
      {/* world rim */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[size / 2 - 0.1, size / 2 + 0.25, 4, 1, Math.PI / 4]} />
        <meshBasicMaterial color="#39457a" transparent opacity={0.9} />
      </mesh>
    </group>
  );
}
