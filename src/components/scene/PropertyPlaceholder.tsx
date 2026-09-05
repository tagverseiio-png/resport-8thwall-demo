/**
 * Shown when `property.glb` has not been supplied yet. It is deliberately a
 * clearly-labelled massing block, never presented as the real model.
 */
export function PropertyPlaceholder({ size = 1 }: { size?: number }) {
  const w = size * 0.55;
  const d = size * 0.42;

  return (
    <group>
      <mesh position={[0, 0.004, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[size * 1.15, size * 0.95]} />
        <meshStandardMaterial color="#2c2a25" roughness={0.9} />
      </mesh>
      {[0, 1, 2].map((level) => {
        const h = size * (0.34 - level * 0.07);
        const scale = 1 - level * 0.22;
        const y = size * (0.17 + level * 0.26);
        return (
          <mesh key={level} position={[0, y, 0]} castShadow receiveShadow>
            <boxGeometry args={[w * scale, h, d * scale]} />
            <meshStandardMaterial
              color={level === 1 ? "#c9bda6" : "#ded4c2"}
              roughness={0.45}
              metalness={0.12}
            />
          </mesh>
        );
      })}
      <mesh position={[0, size * 0.78, 0]} castShadow>
        <cylinderGeometry args={[size * 0.02, size * 0.02, size * 0.16, 12]} />
        <meshStandardMaterial color="#e5bd72" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}
