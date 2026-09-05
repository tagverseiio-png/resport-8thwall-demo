import { Suspense, useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { ARAnchorData, Vec3 } from "@/ar/types";
import type { LoadedModel } from "@/ar/ARModelLoader";
import type { ProjectConfig } from "@/models/Project";
import type { HotspotData } from "@/models/Hotspot";
import { maxPixelRatio } from "@/utils/device";
import { notifyUserInteraction } from "@/ar/motion";
import { PlacedProperty } from "./PlacedProperty";

type ARCanvasProps = {
  project: ProjectConfig;
  anchor: ARAnchorData | null;
  model: LoadedModel | null;
  showPlaceholder: boolean;
  activeHotspotId: string | null;
  onSelectHotspot: (hotspot: HotspotData) => void;
  videoVisible: boolean;
  soundOn: boolean;
  /** Bumping this re-frames the in-page 3D preview. */
  previewResetKey?: number;
};

/** Soft golden disc + rings marking the surface the model stands on. */
function GroundPlane({
  position,
  radius,
  opacity = 1,
}: {
  position: Vec3;
  radius: number;
  opacity?: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
      gradient.addColorStop(0, "rgba(229,189,114,0.50)");
      gradient.addColorStop(0.55, "rgba(229,189,114,0.20)");
      gradient.addColorStop(0.85, "rgba(229,189,114,0.06)");
      gradient.addColorStop(1, "rgba(229,189,114,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  useEffect(
    () => () => {
      texture.dispose();
    },
    [texture],
  );

  return (
    <group position={[position.x, position.y + 0.002, position.z]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.001} renderOrder={1}>
        <circleGeometry args={[radius, 48]} />
        <meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.002} renderOrder={2}>
        <ringGeometry args={[radius * 0.96, radius, 64]} />
        <meshBasicMaterial
          color="#e5bd72"
          transparent
          opacity={0.55 * opacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.003} renderOrder={2}>
        <ringGeometry args={[radius * 0.66, radius * 0.68, 64]} />
        <meshBasicMaterial
          color="#e5bd72"
          transparent
          opacity={0.28 * opacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/** Frames the in-page 3D preview and re-frames it on demand. */
function PreviewRig({ size, resetKey }: { size: number; resetKey: number }) {
  const camera = useThree((state) => state.camera as THREE.PerspectiveCamera);
  const viewport = useThree((state) => state.size);
  const controls = useThree((state) => state.controls) as {
    target: THREE.Vector3;
    update: () => void;
  } | null;

  useEffect(() => {
    // Frame a sphere around the model using the narrower FOV axis — on a portrait
    // phone that is the horizontal one, and ignoring it clips the building.
    const radius = size * 0.72;
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const distance = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.06;

    const direction = new THREE.Vector3(0.42, 0.42, 0.84).normalize();
    camera.position.copy(direction.multiplyScalar(distance));
    const target = new THREE.Vector3(0, size * 0.22, 0);
    camera.position.add(target);
    if (controls) {
      controls.target.copy(target);
      controls.update();
    } else {
      camera.lookAt(target);
    }
  }, [camera, controls, size, resetKey, viewport.width, viewport.height]);

  return null;
}

/**
 * The non-AR fallback viewer: orbit/zoom around the anchored model with the
 * same hotspots, video plane and UI as the AR session. AR itself renders in
 * `EighthWallView` on the engine's own canvas.
 */
export function ARCanvas(props: ARCanvasProps) {
  const {
    project,
    anchor,
    model,
    showPlaceholder,
    activeHotspotId,
    onSelectHotspot,
    videoVisible,
    soundOn,
    previewResetKey = 0,
  } = props;

  const size = project.realWorldSize;

  return (
    <Canvas
      className="absolute inset-0"
      shadows
      dpr={[1, maxPixelRatio()]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [size * 1.4, size * 1.4, size * 2.8], fov: 40, near: 0.01, far: 100 }}
      onPointerDown={() => notifyUserInteraction()}
    >
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
        minDistance={size * 0.9}
        maxDistance={size * 12}
        minPolarAngle={0.12}
        maxPolarAngle={Math.PI / 2 - 0.04}
      />
      <PreviewRig size={size} resetKey={previewResetKey} />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[1.4, 2.6, 1.2]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <Environment>
        <Lightformer intensity={1.6} position={[0, 4, 0]} scale={[8, 8, 1]} />
        <Lightformer
          intensity={0.9}
          color="#f0dcb4"
          position={[-4, 1, -1]}
          rotation-y={Math.PI / 2}
          scale={[12, 2, 1]}
        />
      </Environment>

      {anchor ? (
        <Suspense fallback={null}>
          <GroundPlane position={anchor.position} radius={size * 1.1} opacity={1} />
          <PlacedProperty
            anchor={anchor}
            model={model}
            showPlaceholder={showPlaceholder}
            placeholder={project.slug.includes("resort") ? "resort" : "building"}
            size={size}
            hotspots={project.hotspots}
            activeHotspotId={activeHotspotId}
            onSelectHotspot={onSelectHotspot}
            {...(project.arVideoUrl ? { videoSrc: project.arVideoUrl } : {})}
            videoVisible={videoVisible}
            soundOn={soundOn}
          />
        </Suspense>
      ) : null}
    </Canvas>
  );
}
