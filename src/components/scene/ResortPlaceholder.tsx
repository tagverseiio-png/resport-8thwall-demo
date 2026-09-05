/**
 * Stylised resort island shown until `resort.glb` is supplied.
 * Layout matches `aurelia-resort.ts` hotspot positions so anchors stay valid
 * when the real model lands — see docs/resort-model-pipeline.md.
 *
 * Ocean → sand → lobby / villas / pool / restaurant / spa / palms.
 * Deliberately low-poly; never presented as the final model.
 */
export function ResortPlaceholder({ size = 1.2 }: { size?: number }) {
  const R = size * 0.55;
  const sandY = 0.012;

  const palms: Array<[number, number, number]> = [
    [-0.38, 0.22],
    [-0.3, -0.28],
    [0.18, -0.3],
    [0.4, 0.28],
    [-0.08, 0.34],
    [0.34, -0.02],
  ].map(([x = 0, z = 0]) => [x * size, sandY, z * size] as [number, number, number]);

  const Villa = ({
    x,
    z,
    w = 0.09,
    d = 0.07,
    h = 0.05,
    roof = "#8a5a3b",
  }: {
    x: number;
    z: number;
    w?: number;
    d?: number;
    h?: number;
    roof?: string;
  }) => (
    <group position={[x * size, sandY, z * size]}>
      {/* body */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w * size, h * size, d * size]} />
        <meshStandardMaterial color="#e8dcc4" roughness={0.8} />
      </mesh>
      {/* pitched roof */}
      <mesh position={[0, h * size + 0.018 * size, 0]} rotation-y={Math.PI / 4} castShadow>
        <coneGeometry args={[w * size * 0.78, 0.05 * size, 4]} />
        <meshStandardMaterial color={roof} roughness={0.7} />
      </mesh>
      {/* warm windows */}
      <mesh position={[0, h * size * 0.45, (d * size) / 2 + 0.001]}>
        <planeGeometry args={[w * size * 0.6, h * size * 0.4]} />
        <meshStandardMaterial color="#ffd489" emissive="#ff9d3c" emissiveIntensity={0.7} />
      </mesh>
    </group>
  );

  const Palm = ({ position }: { position: [number, number, number] }) => (
    <group position={position}>
      <mesh position={[0, 0.05 * size, 0]} castShadow>
        <cylinderGeometry args={[0.006 * size, 0.009 * size, 0.1 * size, 6]} />
        <meshStandardMaterial color="#7a5230" roughness={0.9} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 0.022 * size, 0.105 * size, Math.sin(a) * 0.022 * size]}
            rotation-z={Math.cos(a) * 0.7}
            rotation-x={Math.sin(a) * 0.7}
            castShadow
          >
            <coneGeometry args={[0.012 * size, 0.055 * size, 5]} />
            <meshStandardMaterial color="#3f7d3a" roughness={0.8} />
          </mesh>
        );
      })}
    </group>
  );

  return (
    <group>
      {/* ocean */}
      <mesh position={[0, 0, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[R * 1.45, 48]} />
        <meshStandardMaterial color="#1d7d99" roughness={0.55} metalness={0.1} />
      </mesh>
      {/* lagoon ring */}
      <mesh position={[0, 0.004, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <ringGeometry args={[R * 0.98, R * 1.18, 48]} />
        <meshStandardMaterial color="#4fb3c9" roughness={0.6} transparent opacity={0.9} />
      </mesh>
      {/* sand island */}
      <mesh position={[0, sandY, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[R, 48]} />
        <meshStandardMaterial color="#e9d9ae" roughness={0.95} />
      </mesh>
      {/* jetty to water villas */}
      <mesh position={[-0.19 * size, sandY + 0.008, 0.38 * size]} rotation-y={0.35} receiveShadow>
        <boxGeometry args={[0.03 * size, 0.012 * size, 0.3 * size]} />
        <meshStandardMaterial color="#9a6b42" roughness={0.85} />
      </mesh>

      {/* main lobby — centre */}
      <Villa x={-0.05} z={0.05} w={0.16} d={0.12} h={0.07} roof="#5d4030" />
      {/* restaurant — back right */}
      <Villa x={0.3} z={-0.18} w={0.12} d={0.09} h={0.06} />
      {/* spa — back */}
      <Villa x={-0.02} z={-0.34} w={0.1} d={0.08} h={0.055} roof="#6b4a35" />
      {/* beach villas — right */}
      <Villa x={0.42} z={0.02} w={0.09} d={0.07} h={0.05} />
      <Villa x={0.36} z={0.14} w={0.08} d={0.06} h={0.045} />
      {/* water villas — over lagoon */}
      <Villa x={-0.2} z={0.42} w={0.09} d={0.07} h={0.05} roof="#4a3325" />
      <Villa x={-0.32} z={0.36} w={0.08} d={0.06} h={0.045} roof="#4a3325" />

      {/* infinity pool — centre front */}
      <group position={[0.05 * size, sandY + 0.006, 0.18 * size]}>
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[0.16 * size, 0.1 * size]} />
          <meshStandardMaterial color="#2fb3d8" roughness={0.15} metalness={0.25} />
        </mesh>
        <mesh position={[0, 0.004, 0]}>
          <boxGeometry args={[0.17 * size, 0.008 * size, 0.11 * size]} />
          <meshStandardMaterial color="#f2ead6" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.009, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.15 * size, 0.09 * size]} />
          <meshStandardMaterial color="#35c0e8" roughness={0.1} metalness={0.3} />
        </mesh>
      </group>

      {palms.map((p, i) => (
        <Palm key={i} position={p} />
      ))}
    </group>
  );
}
