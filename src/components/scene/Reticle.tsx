import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Vec3 } from "@/ar/types";

type ReticleProps = {
  position: Vec3;
  confident: boolean;
};

/** Ground ring that marks where the property will be placed. */
export function Reticle({ position, confident }: ReticleProps) {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 3) * (confident ? 0.06 : 0.02);
    group.current.scale.setScalar(pulse);
  });

  return (
    <group ref={group} position={[position.x, position.y + 0.002, position.z]}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.16, 0.19, 64]} />
        <meshBasicMaterial
          color={confident ? "#e5bd72" : "#8a8577"}
          transparent
          opacity={confident ? 0.95 : 0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.001}>
        <circleGeometry args={[0.155, 48]} />
        <meshBasicMaterial
          color={confident ? "#e5bd72" : "#6f6a5e"}
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
