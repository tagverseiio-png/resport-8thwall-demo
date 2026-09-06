import { useEffect, useState } from "react";
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
    let cancelled = false;
    const video = createARVideo(src, {
      loop: true,
      muted: true,
      // Missing/unplayable file: unmount instead of showing a black quad.
      onError: () => {
        if (cancelled) return;
        video.dispose();
        setHandle(null);
      },
    });
    setHandle(video);
    void video.play();
    return () => {
      cancelled = true;
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
      {/* FrontSide only: from behind the panel vanishes instead of floating
          as a dark billboard next to the model. */}
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={handle.texture} toneMapped={false} />
      </mesh>
      <mesh position-z={-0.004}>
        <planeGeometry args={[width * 1.04, height * 1.07]} />
        <meshBasicMaterial color="#e5bd72" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}
