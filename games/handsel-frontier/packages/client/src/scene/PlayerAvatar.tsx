/* eslint-disable react/no-unknown-property */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Label } from "./Label";
import * as THREE from "three";
import { colorFromEntity, shortAddress } from "../layout";

export type PlayerAvatarProps = {
  entity: string;
  x: number;
  z: number;
  spark: number;
  isMe: boolean;
};

/** A wallet on the board. Movement is interpolated between on-chain tiles so
 *  a one-tile transaction reads as a step rather than a teleport. */
export function PlayerAvatar(p: PlayerAvatarProps) {
  const group = useRef<THREE.Group>(null);
  const target = useRef(new THREE.Vector3(p.x, 0, p.z));
  target.current.set(p.x, 0, p.z);

  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.position.lerp(target.current, Math.min(1, dt * 8));
  });

  const color = p.isMe ? "#ffffff" : colorFromEntity(p.entity);
  return (
    <group ref={group} position={[p.x, 0, p.z]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <capsuleGeometry args={[0.25, 0.6, 4, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={p.isMe ? 0.35 : 0.15} />
      </mesh>
      {p.isMe && (
        <mesh position={[0, 3, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 4, 6]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.25} />
        </mesh>
      )}
      <Label position={[0, 1.45, 0]} color={color} size={11}>
        {(p.isMe ? "you · " : "") + shortAddress(p.entity) + ` · ✦${p.spark}`}
      </Label>
    </group>
  );
}
