/**
 * 8th Wall engine access — the single AR engine for every device.
 *
 * The engine binary (SLAM included) loads from the official CDN as an
 * unmodified bundle, which is exactly what the XR Engine License Agreement
 * requires for compliance (copyright header intact, inspectable in devtools).
 * See `public/THIRD-PARTY-NOTICES.txt` and the in-app credits.
 *
 * Pattern follows https://8thwall.org/docs/engine/overview (script tag +
 * `xrloaded` event). No API key is needed since the platform went open source.
 */

const XR8_CDN = "https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1/dist/xr.js";

/** One hit estimate from `XR8.XrController.hitTest(x, y)`. */
export type XR8HitEstimate = {
  type: "FEATURE_POINT" | "ESTIMATED_SURFACE" | "DETECTED_SURFACE" | "UNSPECIFIED" | string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  distance: number;
};

export type XR8SceneHandle = {
  scene: import("three").Scene;
  camera: import("three").PerspectiveCamera;
  renderer: import("three").WebGLRenderer;
};

type XR8PipelineModule = {
  name: string;
  onStart?: (args: {
    canvas: HTMLCanvasElement;
    canvasWidth: number;
    canvasHeight: number;
  }) => void;
  onUpdate?: (args: { processCpuResult: unknown }) => void;
  listeners?: Array<{ event: string; process: (args: { name: string; detail: unknown }) => void }>;
};

/** Minimal surface of the XR8 global that this app touches. */
export type XR8Instance = {
  addCameraPipelineModules: (modules: XR8PipelineModule[]) => void;
  clearCameraPipelineModules: () => void;
  run: (config: { canvas: HTMLCanvasElement; cameraConfig?: { direction: string } }) => void;
  stop: () => void;
  loadChunk: (name: "slam" | "face") => Promise<void>;
  XrConfig: {
    camera: () => { BACK: string; FRONT: string };
  };
  GlTextureRenderer: { pipelineModule: () => XR8PipelineModule };
  Threejs: {
    pipelineModule: () => XR8PipelineModule;
    xrScene: () => XR8SceneHandle;
  };
  XrController: {
    pipelineModule: () => XR8PipelineModule;
    configure: (config: Record<string, unknown>) => void;
    hitTest: (x: number, y: number, includedTypes?: string[]) => XR8HitEstimate[];
    updateCameraProjectionMatrix: (args: {
      origin: { x: number; y: number; z: number };
      facing: { x: number; y: number; z: number; w: number };
    }) => void;
    recenter: () => void;
  };
  XrDevice: {
    isDeviceBrowserCompatible: (options?: Record<string, unknown>) => boolean;
    incompatibleReasons: () => string[];
    incompatibleReasonDetails: () => Array<Record<string, unknown>>;
  };
};

declare global {
  interface Window {
    XR8?: XR8Instance;
    THREE?: unknown;
  }
}

let loadPromise: Promise<XR8Instance | null> | null = null;

/**
 * Loads the engine once per page lifetime. Resolves null when the CDN is
 * unreachable or the load times out — callers treat that as "no AR".
 */
export function loadXR8(timeoutMs = 25_000): Promise<XR8Instance | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.XR8) return Promise.resolve(window.XR8);
  if (!loadPromise) {
    loadPromise = new Promise((resolve) => {
      let settled = false;
      const done = (value: XR8Instance | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      };
      const timer = window.setTimeout(() => done(null), timeoutMs);
      const onLoaded = () => done(window.XR8 ?? null);
      if (window.XR8) {
        onLoaded();
        return;
      }
      window.addEventListener("xrloaded", onLoaded, { once: true });
      const script = document.createElement("script");
      script.src = XR8_CDN;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset["preloadChunks"] = "slam";
      script.onerror = () => done(null);
      document.head.appendChild(script);
    });
  }
  return loadPromise;
}

export type XR8Compat = { compatible: boolean; reasons: string[] };

/**
 * The one gate for every device: `XR8.XrDevice.isDeviceBrowserCompatible()`.
 * Covers native mobile browsers AND in-app webviews on iOS + Android.
 * False (or engine unloadable) → the honest Three.js orbit fallback.
 */
export async function checkXR8Compatible(): Promise<XR8Compat> {
  const xr8 = await loadXR8();
  if (!xr8) return { compatible: false, reasons: ["engine-load-failed"] };
  try {
    if (xr8.XrDevice.isDeviceBrowserCompatible()) return { compatible: true, reasons: [] };
    let reasons: string[] = ["incompatible"];
    try {
      reasons = xr8.XrDevice.incompatibleReasons();
    } catch {
      /* keep generic reason */
    }
    return { compatible: false, reasons };
  } catch {
    return { compatible: false, reasons: ["compat-check-failed"] };
  }
}

export type SlamChunkResult = { ok: true } | { ok: false; error: string };

/**
 * Awaits the SLAM WASM chunk explicitly BEFORE run(). Without this, a failed
 * or stalled chunk download leaves a crippled session behind — live camera,
 * dead tracking, zero hits, and no error anywhere. That failure mode looks
 * exactly like "surface mapping not working".
 */
export async function ensureSlamChunk(
  xr8: XR8Instance,
  timeoutMs = 45_000,
): Promise<SlamChunkResult> {
  try {
    await Promise.race([
      xr8.loadChunk("slam"),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("slam-chunk-timeout")), timeoutMs);
      }),
    ]);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
