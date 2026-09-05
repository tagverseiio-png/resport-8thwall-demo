import type { Vec3 } from "./types";

/**
 * SLAM debug mode — shows what the tracker actually sees: feature-point
 * cloud, every hit-test estimate, camera pose and placement math.
 *
 * Enable with `?ar-debug=1` (or the DBG chip in the AR view, persisted to
 * localStorage). Production is untouched when it is off: no world-points
 * processing, no extra meshes, no HUD.
 */

const PARAM = "ar-debug";
const STORAGE_KEY = "aurelia-ar-debug";

export function isARDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get(PARAM) === "1") return true;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setARDebugEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    const url = new URL(window.location.href);
    if (on) url.searchParams.set(PARAM, "1");
    else url.searchParams.delete(PARAM);
    window.history.replaceState(null, "", url.toString());
  } catch {
    /* private mode — debug simply won't persist */
  }
}

export type DebugHit = {
  type: string;
  position: Vec3;
  distance: number;
};

export type TrackingState = "ok" | "degraded" | "lost" | "unknown";

export type DebugSnapshot = {
  fps: number;
  camera: Vec3 | null;
  /** Every estimate from the latest center-screen hit test (not just the best). */
  hits: DebugHit[];
  worldPoints: number;
  anchor: Vec3 | null;
  /** ms since the last successful hit test, null when never. */
  lastHitAgeMs: number | null;
  /** Surface orientation of the best center hit — floor ≈ yaw-only. */
  rotation: { x: number; y: number; z: number; w: number } | null;
  /** Last tap's hit (placement uses it only when confident). */
  lastTap: { type: string; position: Vec3 } | null;
  /** Scanner hit-test counters (match ARManager.scanStats). */
  scanCalls: number;
  scanErrors: number;
  scanLastError: string | null;
  /** SLAM chunk state: null = not attempted yet. */
  slamReady: boolean | null;
  /** Recent window errors / unhandled rejections (engine + app). */
  runtimeErrors: string[];
  /** UA + screen + DPR, captured once per snapshot. */
  device: string;
  /** Canvas/camera geometry — exposes feed-vs-marker coordinate mismatches. */
  view: ViewGeometry | null;
  /** Post-placement SLAM health (see EighthWallView health monitor). */
  tracking: TrackingState;
  /** Anchor lifecycle ring buffer — proves whether the anchor ever nulled. */
  anchorEvents: string[];
  /** Assisted/fallback placement re-verification status. */
  placement: { via: string; verified: boolean | null } | null;
  /** Labels currently shown + worst pill overlap px (deconfliction proof). */
  labelsShown: number;
  labelOverlapPx: number;
};

export type ViewGeometry = {
  /** Canvas CSS size. */
  cssW: number;
  cssH: number;
  /** Canvas drawing-buffer size. */
  bufW: number;
  bufH: number;
  innerW: number;
  innerH: number;
  vvW: number;
  vvH: number;
  vvScale: number;
  dpr: number;
  camAspect: number;
  camFov: number;
  renW: number;
  renH: number;
  renPr: number;
};

const EMPTY: DebugSnapshot = {
  fps: 0,
  camera: null,
  hits: [],
  worldPoints: 0,
  anchor: null,
  lastHitAgeMs: null,
  rotation: null,
  lastTap: null,
  scanCalls: 0,
  scanErrors: 0,
  scanLastError: null,
  slamReady: null,
  runtimeErrors: [],
  device: "",
  view: null,
  tracking: "unknown",
  anchorEvents: [],
  placement: null,
  labelsShown: 0,
  labelOverlapPx: 0,
};

let snapshot: DebugSnapshot = EMPTY;
const listeners = new Set<() => void>();

export function pushDebugSnapshot(next: DebugSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function subscribeDebugSnapshot(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDebugSnapshot(): DebugSnapshot {
  return snapshot;
}

export function clearDebugSnapshot(): void {
  snapshot = EMPTY;
  listeners.forEach((listener) => listener());
}

const runtimeErrors: string[] = [];
let captureInstalled = false;

function recordRuntimeError(message: string): void {
  const line = message.slice(0, 160);
  if (runtimeErrors[runtimeErrors.length - 1] === line) return;
  runtimeErrors.push(line);
  if (runtimeErrors.length > 8) runtimeErrors.shift();
}

/** Window error + rejection tap. Idempotent — safe to call per mount. */
export function installRuntimeErrorCapture(): void {
  if (captureInstalled || typeof window === "undefined") return;
  captureInstalled = true;
  window.addEventListener("error", (event) => {
    recordRuntimeError(`error: ${event.message || "unknown"}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    recordRuntimeError(`rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  });
}

export function readRuntimeErrors(): string[] {
  return [...runtimeErrors];
}

const anchorEvents: string[] = [];

/** Anchor lifecycle log — answers "did the anchor ever null out?" definitively. */
export function pushAnchorEvent(text: string): void {
  const stamp = new Date().toISOString().slice(11, 23);
  anchorEvents.push(`${stamp} ${text}`);
  if (anchorEvents.length > 8) anchorEvents.shift();
}

export function readAnchorEvents(): string[] {
  return [...anchorEvents];
}

export function describeDevice(): string {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "";
  const w = window.screen?.width ?? 0;
  const h = window.screen?.height ?? 0;
  const dpr = window.devicePixelRatio ?? 0;
  return `${navigator.userAgent.slice(0, 110)} | ${w}x${h}@${dpr}`;
}
