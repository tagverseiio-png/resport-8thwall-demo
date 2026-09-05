import { useEffect, useState } from "react";
import { DoubleSide } from "three";
import { createARVideo, type ARVideoHandle } from "@/ar/ARVideo";

type ARVideoPlaneProps = {
  src: string;
  muted: boolean;
  width?: number;
  position?: [number, number, number];
};

/** A spatially anchored film panel that sits beside the property. */
export function ARVideoPlane({
  src,
  muted,
  width = 0.5,
  position = [0, 0.34, -0.32],
}: ARVideoPlaneProps) {
  const [handle, setHandle] = useState<ARVideoHandle | null>(null);

  useEffect(() => {
    const video = createARVideo(src, { loop: true, muted: true });
    setHandle(video);
    void video.play();
    return () => {
      video.dispose();
      setHandle(null);
    };
  }, [src]);

  useEffect(() => {
    handle?.setMuted(muted);
  }, [handle, muted]);

  if (!handle) return null;
  const height = width * 0.5625;

  return (
    <group position={position}>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={handle.texture} toneMapped={false} side={DoubleSide} />
      </mesh>
      <mesh position-z={-0.004}>
        <planeGeometry args={[width * 1.04, height * 1.07]} />
        <meshBasicMaterial color="#e5bd72" transparent opacity={0.5} side={DoubleSide} />
      </mesh>
    </group>
  );
}
