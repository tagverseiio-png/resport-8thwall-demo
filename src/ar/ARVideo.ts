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
 */
export function createARVideo(
  src: string,
  options: { loop?: boolean; muted?: boolean } = {},
): ARVideoHandle {
  const video = document.createElement("video");
  video.src = src;
  video.crossOrigin = "anonymous";
  video.loop = options.loop ?? true;
  video.muted = options.muted ?? true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("playsinline", "true");

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
      video.pause();
      video.removeAttribute("src");
      video.load();
      texture.dispose();
    },
  };
}
