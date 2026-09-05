import { ARAnchorStore } from "./ARAnchor";
import { detectARCapability, hasWorldTracking } from "./capabilities";
import type {
  ARAnchorData,
  ARCapabilities,
  ARError,
  ARErrorCode,
  ARFlowState,
  ScanStats,
  SurfaceHit,
  Vec3,
} from "./types";
import { hasCameraApi, isMobileDevice } from "@/utils/device";

const ERRORS: Record<ARErrorCode, Omit<ARError, "code">> = {
  CAMERA_DENIED: {
    title: "Camera access blocked",
    message:
      "AR needs the camera to see your room. Allow camera access for this site in your browser settings, then try again.",
    actionLabel: "Try again",
    retryState: "CAMERA_PERMISSION",
  },
  CAMERA_UNAVAILABLE: {
    title: "Camera unavailable",
    message:
      "We could not reach a rear camera on this device. Close other apps using the camera and try again.",
    actionLabel: "Retry",
    retryState: "CAMERA_PERMISSION",
  },
  AR_UNSUPPORTED: {
    title: "AR is not available on this device",
    message:
      "This device or browser cannot run the AR engine. You can still explore the building in 3D here.",
    actionLabel: "Explore in 3D",
    retryState: "PREVIEW",
  },
  ENGINE_ERROR: {
    title: "AR engine couldn't start",
    message:
      "The tracking engine didn't finish loading. This is usually a dropped connection during its large one-time download.",
    actionLabel: "Try again",
    retryState: "AR_INITIALIZING",
  },
  MODEL_LOAD_FAILED: {
    title: "The project model didn't load",
    message: "Something went wrong while loading the 3D building. Check your connection and retry.",
    actionLabel: "Retry loading",
    retryState: "MODEL_LOADING",
  },
  NETWORK_ERROR: {
    title: "Connection lost",
    message: "Your network dropped while loading the experience. Reconnect and try again.",
    actionLabel: "Retry",
    retryState: "AR_INITIALIZING",
  },
  TRACKING_LOST: {
    title: "Tracking lost",
    message: "Move your phone slowly over the surface to pick tracking back up.",
    actionLabel: "Retry tracking",
    retryState: "SURFACE_SCANNING",
  },
  SURFACE_NOT_DETECTED: {
    title: "No surface found",
    message:
      "Point the camera at a well-lit table, bench or floor and move your phone slowly from side to side.",
    actionLabel: "Scan again",
    retryState: "SURFACE_SCANNING",
  },
  LOW_PERFORMANCE: {
    title: "Device under strain",
    message: "We reduced the visual quality to keep the experience smooth on this device.",
    actionLabel: "Continue",
    retryState: "AR_EXPLORATION",
  },
  UNKNOWN: {
    title: "Something went wrong",
    message: "The experience hit an unexpected problem. Restarting usually fixes it.",
    actionLabel: "Restart",
    retryState: "INTRO",
  },
};

export type ARManagerState = {
  flow: ARFlowState;
  capabilities: ARCapabilities | null;
  /** Latest real hit-test result. Null whenever the tracker has nothing. */
  surfaceHit: SurfaceHit | null;
  /**
   * Placement strictness. `strict` (default) only plants the model on a
   * confident DETECTED/ESTIMATED surface. `assisted` lets one tap plant it on
   * any hit estimate — the escape hatch for tables/printed plans where SLAM
   * sees texture but never converges a plane. Consumed on placement.
   */
  placementMode: "strict" | "assisted";
  /**
   * Incremented to request camera-forward fallback placement (used when even
   * assisted taps find no hit data). The engine view consumes the change.
   */
  fallbackSignal: number;
  /** What the scanner actually saw while looking for a surface. */
  scanStats: ScanStats | null;
  /** Live WebXR plane-detection count. 0 when unsupported or idle. */
  planesDetected: number;
  anchor: ARAnchorData | null;
  error: ARError | null;
  /** True while the 8th Wall engine loop owns the camera. */
  sessionActive: boolean;
};

/**
 * Owns the flow state machine and the world anchor.
 *
 * Deliberately has no tracking engine of its own: world poses and hit tests
 * come from the 8th Wall SLAM engine via `reportSurfaceHit`, and nothing else
 * is allowed to synthesise a surface. Devices where the engine cannot run get
 * the honest 3D `PREVIEW` instead of a fake AR mode.
 */
export class ARManager {
  readonly anchors = new ARAnchorStore();

  private state: ARManagerState = {
    flow: "INTRO",
    capabilities: null,
    surfaceHit: null,
    placementMode: "strict",
    fallbackSignal: 0,
    scanStats: null,
    planesDetected: 0,
    anchor: null,
    error: null,
    sessionActive: false,
  };
  private listeners = new Set<() => void>();
  private unsubscribeAnchor?: () => void;

  getState = (): ARManagerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private patch(patch: Partial<ARManagerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  /** Resolve what this device can really do. No env override, no guessing. */
  async detectCapabilities(): Promise<ARCapabilities> {
    const mode = await detectARCapability();
    const capabilities: ARCapabilities = {
      isMobile: isMobileDevice(),
      hasCameraApi: hasCameraApi(),
      mode,
      hasWorldTracking: hasWorldTracking(mode),
    };
    this.patch({ capabilities });
    return capabilities;
  }

  setFlow(flow: ARFlowState): void {
    this.patch({ flow, error: flow === "ERROR" ? this.state.error : null });
  }

  fail(code: ARErrorCode, detail?: string): void {
    this.patch({ flow: "ERROR", error: { code, ...ERRORS[code], ...(detail ? { detail } : {}) } });
  }

  /** Intro CTA. Where it goes depends on the resolved capability. */
  beginExperience(): void {
    if (this.state.capabilities?.mode === "eighthwall") {
      this.patch({ flow: "CAMERA_PERMISSION", error: null });
      return;
    }
    // Preview has no camera and no tracking.
    this.enterPreview();
  }

  /**
   * In-page 3D. Not AR: no camera feed, no world tracking, and the UI says so.
   * A display anchor at the origin lets the same scene graph render the model.
   */
  enterPreview(): void {
    this.unsubscribeAnchor?.();
    const anchor = this.anchors.create({ x: 0, y: 0, z: 0 }, 1, "preview");
    this.unsubscribeAnchor = this.anchors.subscribe((next) => this.patch({ anchor: next }));
    this.patch({ flow: "PREVIEW", anchor, surfaceHit: null, error: null, sessionActive: false });
  }

  /** The explainer was acknowledged — mount the engine view, which starts XR8. */
  acceptCameraNotice(): void {
    this.patch({ flow: "AR_INITIALIZING", error: null });
  }

  /** The engine camera loop is running (8th Wall session owns the camera). */
  sessionStarted(): void {
    this.patch({
      sessionActive: true,
      flow: "SCAN_INSTRUCTIONS",
      planesDetected: 0,
      scanStats: null,
      placementMode: "strict",
    });
  }

  /** The XR session ended (browser UI, backgrounding, or our own exit). */
  sessionEnded(): void {
    if (!this.state.sessionActive && this.state.flow === "INTRO") return;
    this.anchors.remove();
    this.patch({
      sessionActive: false,
      flow: "INTRO",
      surfaceHit: null,
      scanStats: null,
      placementMode: "strict",
      planesDetected: 0,
      anchor: null,
      error: null,
    });
  }

  /**
   * Enter scanning. There is nothing to start here on purpose — the reticle only
   * appears once the SLAM engine returns a real hit test through `reportSurfaceHit`.
   */
  startSurfaceScan(): void {
    this.patch({
      flow: "SURFACE_SCANNING",
      surfaceHit: null,
      error: null,
      scanStats: {
        hitTestCalls: 0,
        hitTestErrors: 0,
        anyHit: false,
        confidentHit: false,
        lastError: null,
        lockStreak: 0,
        lockRequired: 8,
        pointsRate: 0,
      },
    });
  }

  /**
   * Scanner diagnostics from the engine view (throttled to ~1 Hz there, so
   * this never re-renders the UI at frame rate).
   */
  reportScanStats(patch: Partial<ScanStats>): void {
    const prev = this.state.scanStats ?? {
      hitTestCalls: 0,
      hitTestErrors: 0,
      anyHit: false,
      confidentHit: false,
      lastError: null,
      lockStreak: 0,
      lockRequired: 8,
      pointsRate: 0,
    };
    const next = { ...prev, ...patch };
    const same =
      next.hitTestCalls === prev.hitTestCalls &&
      next.hitTestErrors === prev.hitTestErrors &&
      next.anyHit === prev.anyHit &&
      next.confidentHit === prev.confidentHit &&
      next.lastError === prev.lastError &&
      next.lockStreak === prev.lockStreak &&
      next.lockRequired === prev.lockRequired &&
      next.pointsRate === prev.pointsRate;
    if (!same) this.patch({ scanStats: next });
  }

  /** Live plane count pushed by the WebXR Plane Detection API. */
  reportPlanes(count: number): void {
    if (count === this.state.planesDetected) return;
    this.patch({ planesDetected: Math.max(0, Math.floor(count)) });
  }

  /** Reticle position pushed by a real hit test. Never synthesised. */
  reportSurfaceHit(hit: SurfaceHit | null): void {
    // Hit tests fire every frame — skip redundant patches so React does not
    // re-render 60-90x/sec with an identical hit.
    const prev = this.state.surfaceHit;
    const same =
      (prev === null && hit === null) ||
      (prev !== null &&
        hit !== null &&
        prev.confident === hit.confident &&
        Math.abs(prev.position.x - hit.position.x) < 0.001 &&
        Math.abs(prev.position.y - hit.position.y) < 0.001 &&
        Math.abs(prev.position.z - hit.position.z) < 0.001);
    if (same) return;
    const promote = hit?.confident && this.state.flow === "SURFACE_SCANNING";
    const demote = !hit && this.state.flow === "SURFACE_DETECTED";
    this.patch({
      surfaceHit: hit,
      ...(promote ? { flow: "SURFACE_DETECTED" as ARFlowState } : {}),
      ...(demote ? { flow: "SURFACE_SCANNING" as ARFlowState } : {}),
    });
  }

  /** Tap to place. Writes the world anchor exactly once, at the hit-test point. */
  placeModel(
    position?: Vec3,
    baseScale = 1,
    via: ARAnchorData["placedVia"] = "strict",
  ): ARAnchorData | null {
    const target = position ?? this.state.surfaceHit?.position;
    if (!target) return null;
    const anchor = this.anchors.create(target, baseScale, via);
    this.unsubscribeAnchor?.();
    this.unsubscribeAnchor = this.anchors.subscribe((next) => this.patch({ anchor: next }));
    this.patch({ anchor, surfaceHit: null, flow: "MODEL_LOADING", placementMode: "strict" });
    return anchor;
  }

  /**
   * Escape hatch for tables/printed plans: the next tap plants the model on
   * whatever the tracker sees, even without a converged plane. SLAM still
   * world-locks the anchor afterwards — worst case the height/depth is
   * slightly off, never a dead-end error screen.
   */
  allowAssistedPlacement(): void {
    this.patch({ placementMode: "assisted" });
  }

  /**
   * Last-resort placement: plants the model even when hit tests return no
   * data at all (camera-forward point). Consumed once by the engine view.
   */
  requestFallbackPlacement(): void {
    this.patch({ fallbackSignal: this.state.fallbackSignal + 1 });
  }

  modelReady(): void {
    if (this.state.flow === "MODEL_LOADING") this.patch({ flow: "AR_EXPLORATION" });
  }

  /** Local-only transforms — anchor position is intentionally immutable. */
  transformModel(patch: { rotationY?: number; scale?: number }): void {
    this.anchors.transform(patch);
  }

  removeAnchor(): void {
    this.anchors.remove();
    this.patch({ anchor: null });
  }

  /** Pick the model back up and scan for a new surface (or reset the preview). */
  restart(): void {
    if (this.state.flow === "PREVIEW") {
      this.anchors.transform({ rotationY: 0, scale: 1 });
      return;
    }
    this.anchors.remove();
    this.patch({
      flow: "SCAN_INSTRUCTIONS",
      surfaceHit: null,
      anchor: null,
      error: null,
    });
  }

  /** Leave the experience entirely and go back to the intro. */
  stopAR(): void {
    this.unsubscribeAnchor?.();
    delete this.unsubscribeAnchor;
    this.anchors.remove();
    this.patch({
      flow: "INTRO",
      surfaceHit: null,
      scanStats: null,
      placementMode: "strict",
      planesDetected: 0,
      anchor: null,
      sessionActive: false,
      error: null,
    });
  }
}

export const arManager = new ARManager();
