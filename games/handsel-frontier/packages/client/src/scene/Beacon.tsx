/* eslint-disable react/no-unknown-property */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Label } from "./Label";
import * as THREE from "three";
import { beaconHeight, STATUS_COMPLETED, STATUS_LIVE, VERIFICATION_COLOR } from "../layout";

export type BeaconProps = {
  jobId: bigint;
  x: number;
  z: number;
  status: number;
  verification: number;
  rewardCents: number;
  scoutCount: number;
  selected: boolean;
  scoutedByMe: boolean;
  inRange: boolean;
  title?: string;
  onSelect: (jobId: bigint) => void;
};

/**
 * One Handsel job, standing on its tile. Height follows the bounty, colour
 * follows who grades it, and behaviour follows status: a live job spins and
 * glows, a completed job sinks into a green monument, a cancelled or refunded
 * one goes dark. Small sparks orbit for each scout who staked on it.
 */
export function Beacon(p: BeaconProps) {
  const crystal = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const live = STATUS_LIVE.has(p.status);
  const done = p.status === STATUS_COMPLETED;
  const color = live || done ? VERIFICATION_COLOR[p.verification] ?? "#8b93a7" : "#3b4152";
  const h = done ? beaconHeight(p.rewardCents) * 0.45 : beaconHeight(p.rewardCents);
  const emissive = done ? "#1f8f5a" : color;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (crystal.current) {
      crystal.current.rotation.y = live ? t * 0.6 : 0;
      crystal.current.position.y = h / 2 + (live ? Math.sin(t * 1.5 + p.x) * 0.08 : 0);
    }
    if (ring.current) {
      const s = p.selected ? 1 + Math.sin(t * 4) * 0.08 : 1;
      ring.current.scale.set(s, s, s);
    }
  });

  const usd = (p.rewardCents / 100).toFixed(2);
  const label = `#${p.jobId.toString()} · $${usd}`;

  return (
    <group position={[p.x, 0, p.z]}>
      <mesh
        ref={crystal}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          p.onSelect(p.jobId);
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "default")}
      >
        {done ? <cylinderGeometry args={[0.35, 0.5, h, 6]} /> : <octahedronGeometry args={[0.5, 0]} />}
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={live ? 0.9 : done ? 0.5 : 0.05}
          roughness={0.25}
          metalness={0.3}
          transparent={!live && !done}
          opacity={!live && !done ? 0.55 : 1}
        />
      </mesh>
      {/* stretch the crystal to its height */}
      {!done && (
        <mesh position={[0, h / 2, 0]} scale={[1, h, 1]}>
          <octahedronGeometry args={[0.45, 0]} />
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={live ? 0.35 : 0.03}
            transparent
            opacity={live ? 0.35 : 0.15}
            depthWrite={false}
          />
        </mesh>
      )}
      {/* base ring: selection / range / my stake */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[0.55, 0.75, 32]} />
        <meshBasicMaterial
          color={p.selected ? "#ffffff" : p.scoutedByMe ? "#ffd166" : p.inRange ? color : "#222a3f"}
          transparent
          opacity={p.selected || p.scoutedByMe || p.inRange ? 0.95 : 0.5}
        />
      </mesh>
      {/* one orbiting spark per scout */}
      {Array.from({ length: Math.min(p.scoutCount, 12) }).map((_, i) => (
        <Spark key={i} index={i} count={Math.min(p.scoutCount, 12)} height={h} />
      ))}
      {live && <pointLight color={color} intensity={p.selected ? 2.5 : 1.2} distance={6} position={[0, h * 0.7, 0]} />}
      <Label position={[0, h + 0.8, 0]} color={live ? "#e6e9f2" : "#9aa3ba"} size={13}>
        <b>{label}</b>
        {p.selected && p.title && (
          <div style={{ color: "#ffd166", fontSize: 11, maxWidth: 220, whiteSpace: "normal" }}>{p.title}</div>
        )}
      </Label>
    </group>
  );
}

function Spark({ index, count, height }: { index: number; count: number; height: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 0.9 + (index / count) * Math.PI * 2;
    if (ref.current) {
      ref.current.position.set(Math.cos(t) * 0.9, 0.4 + (height * 0.5) * (0.5 + 0.5 * Math.sin(t * 0.7)), Math.sin(t) * 0.9);
    }
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.07, 8, 8]} />
      <meshBasicMaterial color="#ffd166" />
    </mesh>
  );
}
