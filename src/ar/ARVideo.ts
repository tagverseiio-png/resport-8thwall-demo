import * as THREE from "three";

export type ARVideoHandle = {
  video: HTMLVideoElement;
  texture: THREE.VideoTexture;
  play: () => Promise<void>;
  pause: () => void;
  setMuted: (muted: boolean) => void;
  dispose: () => void;
};

/**
 * Creates a VideoTexture that can be mapped onto a plane inside the AR scene, so
 * the video stays spatially anchored with the property instead of being pinned
 * to the screen.
 *
 * `onError` fires when the file 404s or the codec is rejected. Callers must
 * tear the panel down there — an unloaded VideoTexture renders solid black,
 * which reads as a floating black slab once the user orbits behind the model.
 */
export function createARVideo(
  src: string,
  options: { loop?: boolean; muted?: boolean; onError?: () => void } = {},
): ARVideoHandle {
  const video = document.createElement("video");
  video.src = src;
  video.crossOrigin = "anonymous";
  video.loop = options.loop ?? true;
  video.muted = options.muted ?? true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("playsinline", "true");

  const handleError = () => options.onError?.();
  video.addEventListener("error", handleError);

  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  return {
    video,
    texture,
    play: async () => {
      try {
        await video.play();
      } catch {
        // Autoplay blocked — the UI exposes an explicit play control.
      }
    },
    pause: () => video.pause(),
    setMuted: (muted: boolean) => {
      video.muted = muted;
    },
    dispose: () => {
      video.removeEventListener("error", handleError);
      video.pause();
      video.removeAttribute("src");
      video.load();
      texture.dispose();
    },
  };
}

/** True when the film file actually exists — guards the Play button. */
export async function videoExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) return false;
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("text/html")) return false;
    return true;
  } catch {
    return false;
  }
}
