import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import type * as THREE from "three";
import type { HotspotData, HotspotType } from "@/models/Hotspot";
import { prefersReducedMotion } from "@/ar/motion";

/** Per-type marker colours. Default gold when a hotspot has no type. */
const TYPE_COLORS: Record<HotspotType, string> = {
  room: "#f2d69a",
  villa: "#e5bd72",
  beach: "#7fd4c1",
  pool: "#5cc8ee",
  restaurant: "#f0a35e",
  spa: "#c4a7f5",
  gallery: "#f5a7c4",
  map: "#9ed67e",
};

const DEFAULT_COLOR = "#e5bd72";

type HotspotMarkersProps = {
  hotspots: HotspotData[];
  activeId: string | null;
  /** Real-world size of the model in metres — hotspot coords are fractions of it. */
  size: number;
  onSelect: (hotspot: HotspotData) => void;
};

/**
 * Tappable in-scene markers. These are real meshes in model-local space, not
 * screen-space HTML, so they stay on the building as the camera moves.
 */
export function HotspotMarkers({ hotspots, activeId, size, onSelect }: HotspotMarkersProps) {
  const dot = size * 0.018;
  return (
    <group>
      {hotspots.map((hotspot, index) => (
        <PulseMarker
          key={hotspot.id}
          hotspot={hotspot}
          dot={dot}
          size={size}
          index={index}
          active={hotspot.id === activeId}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

const PULSE_PERIOD_SEC = 1.5;

/** One marker with a gentle attention pulse (scale 1.0 → 1.08, 1.5 s cycle). */
function PulseMarker({
  hotspot,
  dot,
  size,
  index,
  active,
  onSelect,
}: {
  hotspot: HotspotData;
  dot: number;
  size: number;
  index: number;
  active: boolean;
  onSelect: (hotspot: HotspotData) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const reduced = useRef<boolean | null>(null);
  const color = hotspot.type ? TYPE_COLORS[hotspot.type] : DEFAULT_COLOR;

  useFrame(({ clock }) => {
    const node = group.current;
    if (!node) return;
    if (reduced.current === null) reduced.current = prefersReducedMotion();
    if (reduced.current) {
      if (node.scale.x !== 1) node.scale.setScalar(1);
      return;
    }
    // Own phase per marker so the pulse travels instead of blinking in sync.
    const wave =
      0.5 + 0.5 * Math.sin((clock.elapsedTime * 2 * Math.PI) / PULSE_PERIOD_SEC + index * 0.7);
    node.scale.setScalar((active ? 1.15 : 1) * (1 + 0.08 * wave));
  });

  return (
    <Billboard
      position={[hotspot.position.x * size, hotspot.position.y * size, hotspot.position.z * size]}
    >
      <group ref={group}>
        <mesh
          onClick={(event) => {
            event.stopPropagation();
            onSelect(hotspot);
          }}
        >
          <circleGeometry args={[dot, 24]} />
          <meshBasicMaterial color={active ? "#ffffff" : color} transparent opacity={0.95} />
        </mesh>
        <mesh position-z={-0.001}>
          <ringGeometry args={[dot * 1.14, dot * 1.6, 32]} />
          <meshBasicMaterial color={color} transparent opacity={active ? 0.9 : 0.35} />
        </mesh>
      </group>
    </Billboard>
  );
}
