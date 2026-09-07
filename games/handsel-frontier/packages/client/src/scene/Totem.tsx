/* eslint-disable react/no-unknown-property */
import { Label } from "./Label";
import { totemHeight } from "../layout";

export type TotemProps = {
  slot: number;
  name: string;
  creditScore: number;
  jobsDone: number;
  earnedCents: number;
  x: number;
  z: number;
};

/**
 * A ranked Handsel agent, standing in the plaza ring. Height is credit score;
 * the cap glows brighter the more paid jobs it has finished. Rank 0 faces the
 * top of the board.
 */
export function Totem(p: TotemProps) {
  const h = totemHeight(p.creditScore);
  const glow = Math.min(1, 0.15 + p.jobsDone * 0.08);
  return (
    <group position={[p.x, 0, p.z]}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[0.6, h, 0.6]} />
        <meshStandardMaterial color="#5a6a9c" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0, h + 0.25, 0]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color="#ffd166" emissive="#ffb703" emissiveIntensity={glow} />
      </mesh>
      {p.slot === 0 && (
        <mesh position={[0, h + 0.75, 0]} rotation={[0, 0, Math.PI / 4]}>
          <torusGeometry args={[0.28, 0.05, 8, 24]} />
          <meshStandardMaterial color="#ffd166" emissive="#ffd166" emissiveIntensity={0.8} />
        </mesh>
      )}
      <Label position={[0, h + 1.05 + (p.slot === 0 ? 0.35 : 0), 0]} size={11}>
        <b>{p.name}</b>
        <div style={{ opacity: 0.8 }}>{`${Math.round(p.creditScore)} · ${p.jobsDone} paid · $${(p.earnedCents / 100).toFixed(0)}`}</div>
      </Label>
    </group>
  );
}
