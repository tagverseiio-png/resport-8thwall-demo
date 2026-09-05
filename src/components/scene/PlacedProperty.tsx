import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { ARAnchorData } from "@/ar/types";
import type { LoadedModel } from "@/ar/ARModelLoader";
import type { HotspotData } from "@/models/Hotspot";
import {
  AUTO_ORBIT_RAD_PER_SEC,
  collectWaterMaterials,
  isInteractionIdle,
  prefersReducedMotion,
  restoreWaterMaterials,
  updateWaterShimmer,
  type WaterEntry,
} from "@/ar/motion";
import { HotspotMarkers } from "./HotspotMarkers";
import { PropertyPlaceholder } from "./PropertyPlaceholder";
import { ResortPlaceholder } from "./ResortPlaceholder";
import { ARVideoPlane } from "./ARVideoPlane";

type PlacedPropertyProps = {
  anchor: ARAnchorData;
  model: LoadedModel | null;
  showPlaceholder: boolean;
  /** "resort" renders the island massing, otherwise the tower massing. */
  placeholder?: "building" | "resort";
  size: number;
  hotspots: HotspotData[];
  activeHotspotId: string | null;
  onSelectHotspot: (hotspot: HotspotData) => void;
  /**
   * Native XRAnchor minted at placement (Hit Test with Anchors). While set,
   * the outer group follows the tracker's per-frame anchor pose; the user's
   * yaw/scale stay on the inner group. Null = frozen app-anchor position.
   */
  nativeAnchor?: XRAnchor | null;
  videoSrc?: string;
  videoVisible: boolean;
  soundOn: boolean;
};

/**
 * The anchored content. The outer group is the world lock (native anchor pose
 * when available, app-anchor position otherwise); only the user's local
 * yaw/scale live on the inner group. The model is always a child of the
 * anchor, never of the camera.
 */
export function PlacedProperty({
  anchor,
  model,
  showPlaceholder,
  placeholder = "building",
  size,
  hotspots,
  activeHotspotId,
  onSelectHotspot,
  nativeAnchor = null,
  videoSrc,
  videoVisible,
  soundOn,
}: PlacedPropertyProps) {
  const outerRef = useRef<Group>(null);
  const innerRef = useRef<Group>(null);
  const autoAngle = useRef(0);
  const lastAnchorId = useRef<string | null>(null);
  const water = useRef<WaterEntry[]>([]);
  const reducedMotion = useRef<boolean | null>(null);

  useEffect(() => {
    if (!model) return;
    model.scene.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
  }, [model]);

  // Water materials are identified per loaded model; restored on swap/unmount
  // because the GLB cache keeps the scene (and its materials) alive.
  useEffect(() => {
    restoreWaterMaterials(water.current);
    water.current = model ? collectWaterMaterials(model.scene) : [];
    return () => restoreWaterMaterials(water.current);
  }, [model]);

  // Outside an XR session `frame` is undefined and this is a no-op.
  useFrame((state, _delta, frame) => {
    const group = outerRef.current;
    if (!group || !nativeAnchor || !frame) return;
    const refSpace = state.gl.xr.getReferenceSpace();
    if (!refSpace) return;
    const pose = frame.getPose(nativeAnchor.anchorSpace, refSpace);
    if (!pose) return;
    group.position.set(
      pose.transform.position.x,
      pose.transform.position.y,
      pose.transform.position.z,
    );
    group.quaternion.set(
      pose.transform.orientation.x,
      pose.transform.orientation.y,
      pose.transform.orientation.z,
      pose.transform.orientation.w,
    );
  });

  // Presentation turntable + water shimmer. Delta-timed so 41 fps and 60 fps
  // devices spin identically; paused while the user interacts, resumed after
  // idle; fully decoupled clocks so the two never compound.
  useFrame((state, delta) => {
    if (reducedMotion.current === null) reducedMotion.current = prefersReducedMotion();
    const inner = innerRef.current;
    if (inner) {
      if (anchor.id !== lastAnchorId.current) {
        lastAnchorId.current = anchor.id;
        autoAngle.current = 0;
      }
      if (!reducedMotion.current && isInteractionIdle()) {
        autoAngle.current += AUTO_ORBIT_RAD_PER_SEC * Math.min(delta, 0.1);
      }
      inner.rotation.y = anchor.rotationY + autoAngle.current;
    }
    if (water.current.length > 0) updateWaterShimmer(water.current, state.clock.elapsedTime);
  });

  return (
    <group ref={outerRef} position={[anchor.position.x, anchor.position.y, anchor.position.z]}>
      <group ref={innerRef} rotation-y={anchor.rotationY} scale={anchor.scale}>
        {model ? (
          <group
            position={[
              model.baseOffset.x * model.fitScale,
              model.baseOffset.y * model.fitScale,
              model.baseOffset.z * model.fitScale,
            ]}
            scale={model.fitScale}
          >
            <primitive object={model.scene} />
          </group>
        ) : showPlaceholder ? (
          placeholder === "resort" ? (
            <ResortPlaceholder size={size} />
          ) : (
            <PropertyPlaceholder size={size} />
          )
        ) : null}

        <mesh rotation-x={-Math.PI / 2} position-y={0.001} receiveShadow>
          <circleGeometry args={[size * 0.75, 48]} />
          <shadowMaterial transparent opacity={0.35} />
        </mesh>

        <HotspotMarkers
          hotspots={hotspots}
          activeId={activeHotspotId}
          size={size}
          onSelect={onSelectHotspot}
        />

        {videoSrc && videoVisible ? (
          <ARVideoPlane src={videoSrc} muted={!soundOn} width={size * 0.9} />
        ) : null}
      </group>
    </group>
  );
}
