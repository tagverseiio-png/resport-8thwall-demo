/**
 * AR abstraction layer — types only.
 * The UI depends on these types, never on a concrete AR engine.
 */

export type Vec3 = { x: number; y: number; z: number };

/**
 * Which tracking implementation is active. Resolved from real feature detection
 * only — see `ar/capabilities.ts`. There is deliberately no "simulated AR" mode:
 * a device either runs the 8th Wall engine or it gets the 3D preview.
 */
export type ARMode = "eighthwall" | "preview";

/** Single source of truth for the guided experience. */
export type ARFlowState =
  | "INTRO"
  /** In-page 3D. The only state on devices without real world tracking. */
  | "PREVIEW"
  /** WebXR only — explains the prompt the browser is about to show. */
  | "CAMERA_PERMISSION"
  | "AR_INITIALIZING"
  | "SCAN_INSTRUCTIONS"
  | "SURFACE_SCANNING"
  | "SURFACE_DETECTED"
  | "PLACEMENT"
  | "MODEL_LOADING"
  | "AR_EXPLORATION"
  | "CONTACT"
  | "ERROR";

/** A reticle position pushed by a real hit test. Never synthesised. */
export type SurfaceHit = {
  /** World-space point the reticle sits on. */
  position: Vec3;
  /** True once the tracker is confident about the plane. */
  confident: boolean;
};

/**
 * Scanner diagnostics: what the SLAM hit test actually produced while
 * looking for a surface. Powers live guidance + the timeout error detail.
 */
export type ScanStats = {
  hitTestCalls: number;
  hitTestErrors: number;
  /** Any estimate at all (even a raw feature point). */
  anyHit: boolean;
  /** A DETECTED/ESTIMATED surface was seen (may have slipped since). */
  confidentHit: boolean;
  lastError: string | null;
  /** Consecutive stable frames toward plane lock (see PlaneLockTracker). */
  lockStreak: number;
  /** Frames required for lock. */
  lockRequired: number;
  /** World-point growth, points/sec over the trailing ~2.5 s window. */
  pointsRate: number;
};

export type ARErrorCode =
  | "CAMERA_DENIED"
  | "CAMERA_UNAVAILABLE"
  | "AR_UNSUPPORTED"
  | "ENGINE_ERROR"
  | "MODEL_LOAD_FAILED"
  | "NETWORK_ERROR"
  | "TRACKING_LOST"
  | "SURFACE_NOT_DETECTED"
  | "LOW_PERFORMANCE"
  | "UNKNOWN";

export interface ARError {
  code: ARErrorCode;
  title: string;
  message: string;
  /** Label for the recovery button. */
  actionLabel: string;
  /** Which flow state to retry from. */
  retryState: ARFlowState;
  /** Diagnostic detail appended when the failure is data-driven (e.g. scan). */
  detail?: string;
}

/** A world-space anchor. The model is a child of the anchor, never of the camera. */
export interface ARAnchorData {
  id: string;
  /** World-space position, in metres, captured at placement time. */
  position: Vec3;
  /** Local yaw applied by the user (does not move the anchor). */
  rotationY: number;
  /** Local uniform scale applied by the user (does not move the anchor). */
  scale: number;
  /** How this anchor was planted — drives post-placement verification. */
  placedVia: "strict" | "assisted" | "fallback" | "preview";
}

export interface ARCapabilities {
  isMobile: boolean;
  hasCameraApi: boolean;
  /** Resolved mode after capability checks. */
  mode: ARMode;
  /** True only when the device runs the 8th Wall SLAM engine. */
  hasWorldTracking: boolean;
}

export type CameraPermissionState = "unknown" | "prompt" | "granted" | "denied" | "unavailable";

export interface ModelLoadProgress {
  loaded: number;
  total: number;
  /** 0..1, -1 when indeterminate. */
  ratio: number;
}
