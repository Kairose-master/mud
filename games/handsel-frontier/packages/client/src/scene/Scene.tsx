/* eslint-disable react/no-unknown-property */
import { ElementRef, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { useComponentValue, useEntityQuery } from "@latticexyz/react";
import { Has, getComponentValueStrict } from "@latticexyz/recs";
import { decodeEntity } from "@latticexyz/store-sync/recs";
import * as THREE from "three";
import { useMUD } from "../MUDContext";
import { useUI } from "../state";
import { chebyshev, SCOUT_RANGE } from "../layout";
import { Ground } from "./Ground";
import { Beacon } from "./Beacon";
import { Totem } from "./Totem";
import { PlayerAvatar } from "./PlayerAvatar";

/**
 * Everything on the board is a live query against the synced World tables —
 * no mock rows, no placeholder beacons. An empty market draws an empty plain.
 */
export function Scene() {
  const {
    components: { Position, Player, Bounty, Totem: TotemTable, Scout },
    network: { playerEntity },
  } = useMUD();
  const { selectedJobId, select, feed } = useUI();

  const myPos = useComponentValue(Position, playerEntity);

  const beacons = useEntityQuery([Has(Bounty)]).map((entity) => {
    const b = getComponentValueStrict(Bounty, entity);
    const { jobId } = decodeEntity(Bounty.metadata.keySchema, entity);
    return { entity, jobId, ...b };
  });

  const totems = useEntityQuery([Has(TotemTable)]).map((entity) => {
    const t = getComponentValueStrict(TotemTable, entity);
    const { slot } = decodeEntity(TotemTable.metadata.keySchema, entity);
    return { entity, slot, ...t };
  });

  const players = useEntityQuery([Has(Position), Has(Player)]).map((entity) => {
    const pos = getComponentValueStrict(Position, entity);
    const pl = getComponentValueStrict(Player, entity);
    return { entity, ...pos, spark: pl.spark };
  });

  // Which beacons this wallet has staked on — reactive through the Scout query.
  const scoutEntities = useEntityQuery([Has(Scout)]);
  const myScouts = useMemo(() => {
    const set = new Set<string>();
    for (const e of scoutEntities) {
      const { jobId, player } = decodeEntity(Scout.metadata.keySchema, e);
      if (player === playerEntity) set.add(jobId.toString());
    }
    return set;
  }, [scoutEntities, Scout, playerEntity]);

  // Titles come from Handsel's feed, keyed by job id — labels only.
  const titleByJob = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of feed.feed?.beacons ?? []) m.set(b.jobId, b.title);
    return m;
  }, [feed.feed]);

  return (
    <group>
      <color attach="background" args={["#07090f"]} />
      <fog attach="fog" args={["#07090f", 30, 70]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[12, 20, 8]} intensity={1.1} castShadow shadow-mapSize={[2048, 2048]} />
      <hemisphereLight args={["#2a3b7a", "#0a0d18", 0.5]} />
      <Stars radius={80} depth={20} count={1500} factor={3} fade />

      <Ground />

      {beacons.map((b) => {
        const inRange = myPos ? chebyshev(myPos.x, myPos.z, b.x, b.z) <= SCOUT_RANGE : false;
        return (
          <Beacon
            key={b.entity}
            jobId={b.jobId}
            x={b.x}
            z={b.z}
            status={b.status}
            verification={b.verification}
            rewardCents={b.rewardCents}
            scoutCount={b.scoutCount}
            selected={selectedJobId === b.jobId}
            scoutedByMe={myScouts.has(b.jobId.toString())}
            inRange={inRange}
            title={titleByJob.get(b.jobId.toString())}
            onSelect={select}
          />
        );
      })}

      {totems.map((t) => (
        <Totem
          key={t.entity}
          slot={t.slot}
          name={t.name}
          creditScore={t.creditScore}
          jobsDone={t.jobsDone}
          earnedCents={Number(t.earnedCents)}
          x={t.x}
          z={t.z}
        />
      ))}

      {players.map((p) => (
        <PlayerAvatar key={p.entity} entity={p.entity} x={p.x} z={p.z} spark={p.spark} isMe={p.entity === playerEntity} />
      ))}

      <CameraRig x={myPos?.x ?? 0} z={myPos?.z ?? 0} />
    </group>
  );
}

/** Follows the player's tile; the mouse still orbits and zooms around it. */
function CameraRig({ x, z }: { x: number; z: number }) {
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3(x, 0.5, z));
  const initialised = useRef(false);
  target.current.set(x, 0.5, z);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    if (!initialised.current) {
      camera.position.set(x + 9, 11, z + 9);
      c.target.copy(target.current);
      initialised.current = true;
      return;
    }
    const before = c.target.clone();
    c.target.lerp(target.current, Math.min(1, dt * 6));
    camera.position.add(c.target.clone().sub(before));
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      minDistance={5}
      maxDistance={40}
      maxPolarAngle={Math.PI / 2.2}
      makeDefault
    />
  );
}
