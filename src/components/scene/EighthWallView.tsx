import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { arManager } from "@/ar/ARManager";
import { PlaneLockTracker } from "@/ar/planeLock";
import { layoutLabels, type ExclusionZone, type LabelInput } from "@/ar/labelLayout";
import {
  AUTO_ORBIT_RAD_PER_SEC,
  collectWaterMaterials,
  isInteractionIdle,
  notifyUserInteraction,
  prefersReducedMotion,
  restoreWaterMaterials,
  updateWaterShimmer,
  type WaterEntry,
} from "@/ar/motion";
import { ensureSlamChunk, loadXR8, type XR8HitEstimate, type XR8Instance } from "@/ar/xr8";
import {
  clearDebugSnapshot,
  describeDevice,
  installRuntimeErrorCapture,
  pushAnchorEvent,
  pushDebugSnapshot,
  readAnchorEvents,
  readRuntimeErrors,
  type DebugHit,
  type TrackingState,
  type ViewGeometry,
} from "@/ar/debug";
import { createARVideo, type ARVideoHandle } from "@/ar/ARVideo";
import type { LoadedModel } from "@/ar/ARModelLoader";
import type { ProjectConfig } from "@/models/Project";
import type { HotspotData } from "@/models/Hotspot";
import { HOTSPOT_TYPE_LABEL } from "@/models/Hotspot";
import type { ARAnchorData, ARFlowState, Vec3 } from "@/ar/types";

type EighthWallViewProps = {
  project: ProjectConfig;
  flow: ARFlowState;
  anchor: import("@/ar/types").ARAnchorData | null;
  model: LoadedModel | null;
  showPlaceholder: boolean;
  activeHotspotId: string | null;
  onSelectHotspot: (hotspot: HotspotData) => void;
  videoVisible: boolean;
  soundOn: boolean;
  /** Tap with a fresh SLAM hit — no reliance on the center reticle state. */
  onPlaceAt: (position: Vec3, via?: ARAnchorData["placedVia"]) => void;
  /** SLAM debug layer (world points, hit estimates, HUD feed). Off in prod. */
  debug: boolean;
  /** Incremented to force camera-forward fallback placement. Consumed once. */
  fallbackSignal: number;
};

const HIT_PRIORITY: Record<string, number> = {
  DETECTED_SURFACE: 3,
  ESTIMATED_SURFACE: 2,
  FEATURE_POINT: 1,
};

/** Marker colours for the debug hit-estimate spheres. */
const HIT_COLORS: Record<string, string> = {
  DETECTED_SURFACE: "#22ff88",
  ESTIMATED_SURFACE: "#ffcc33",
  FEATURE_POINT: "#8899aa",
};

/** Max SLAM points / hit markers rendered in debug mode. */
const MAX_DEBUG_POINTS = 1500;
const MAX_DEBUG_HITS = 8;

/**
 * Fallback anchor floor: nearer than this is near-field clutter (hand, foot,
 * lens smudge), never a table — fall through to the fixed default instead.
 */
const MIN_FALLBACK_DEPTH_M = 0.8;

/**
 * Label declutter now lives in the unit-tested pure module
 * (`src/ar/labelLayout.ts`): nearest-to-center selection, vertical spread,
 * elbow leader lines. Dots always render; only pills are culled.
 */
/** Fixed overlay chrome as canvas-relative exclusion rects for pills. */
const CHROME_ZONE_IDS = [
  "ar-chrome-header",
  "ar-chrome-zoom",
  "ar-chrome-rotate",
  "ar-chrome-nav",
  "ar-dbg-chip",
];

function readChromeZones(canvas: HTMLCanvasElement): ExclusionZone[] {
  if (typeof document === "undefined") return [];
  const crect = canvas.getBoundingClientRect();
  if (crect.width === 0 || crect.height === 0) return [];
  const zones: ExclusionZone[] = [];
  for (const id of CHROME_ZONE_IDS) {
    const el = document.getElementById(id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    zones.push({
      x0: r.left - crect.left,
      y0: r.top - crect.top,
      x1: r.right - crect.left,
      y1: r.bottom - crect.top,
    });
  }
  return zones;
}

/** Leader-path pool size (max shown labels incl. forced-active + margin). */
const MAX_LEADER_LINES = 5;
/** Estimated pill size when not yet measured (px). */
const FALLBACK_LABEL_SIZE = { w: 120, h: 24 };

function bestHit(results: XR8HitEstimate[], minDistance = 0.25): XR8HitEstimate | null {
  // Estimates closer than minDistance are hand/lens artefacts, not tables —
  // planting on one floats the model in your face (seen live on device).
  let best: XR8HitEstimate | null = null;
  let bestScore = -1;
  for (const hit of results) {
    if (!(hit.distance >= minDistance)) continue;
    const score = HIT_PRIORITY[hit.type] ?? -1;
    if (score > bestScore) {
      bestScore = score;
      best = hit;
    }
  }
  return bestScore >= 0 ? best : null;
}

function hasValidRotation(rotation: { x: number; y: number; z: number; w: number }): boolean {
  // Feature-point hits sometimes carry a zero quaternion; applying it would
  // collapse the reticle/grid orientation instead of aligning it.
  const { x, y, z, w } = rotation;
  return x * x + y * y + z * z + w * w > 1e-6;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** Shape of `processCpuResult.reality.worldPoints` (defensive — engine-owned). */
function extractWorldPoints(
  source: unknown,
): { positions: ArrayLike<number>; count: number } | null {
  const pickList = (value: unknown): ArrayLike<number> | null => {
    if (Array.isArray(value)) return value;
    if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as { length?: unknown }).length === "number"
    ) {
      return value as ArrayLike<number>;
    }
    return null;
  };
  const reality = asRecord(asRecord(source)?.["reality"]);
  const direct = reality ? asRecord(reality["worldPoints"]) : null;
  if (!direct) return null;
  // Primary shape: { positions: Float32Array|number[], count?: number }.
  const positions = pickList(direct["positions"]);
  if (positions) {
    const count =
      typeof direct["count"] === "number"
        ? Math.floor(direct["count"])
        : Math.floor(positions.length / 3);
    return { positions, count };
  }
  // Fallback shape: array of {x,y,z} points.
  const raw = Array.isArray(direct) ? (direct as unknown[]) : (direct["points"] as unknown[]);
  if (Array.isArray(raw)) {
    const flat: number[] = [];
    for (const p of raw) {
      const r = asRecord(p);
      if (r && typeof r["x"] === "number") {
        flat.push(
          r["x"] as number,
          typeof r["y"] === "number" ? (r["y"] as number) : 0,
          typeof r["z"] === "number" ? (r["z"] as number) : 0,
        );
      }
    }
    if (flat.length > 0) return { positions: flat, count: Math.floor(flat.length / 3) };
  }
  return null;
}

type DebugTiming = {
  lastSnapshotAt: number;
  lastHitAt: number;
  emaMs: number;
  points: number;
  lastTrailAt: number;
  lastDrop: Vec3 | null;
  lastTap: { type: string; position: Vec3 } | null;
};

/** Throttled HUD feed (~4 Hz) — never per-frame React traffic. */
function maybePushSnapshot(args: {
  ctx: SceneCtx;
  dbg: DebugTiming;
  results: XR8HitEstimate[];
  anchorPos: Vec3 | null;
  scan: { calls: number; errors: number; lastError: string | null };
  slamReady: boolean | null;
  canvas: HTMLCanvasElement | null;
  tracking: TrackingState;
  placement: { via: string; verified: boolean | null } | null;
  labels: { shown: number; overlap: number };
}): void {
  const { ctx, dbg, results, anchorPos, scan, slamReady, canvas, tracking, placement, labels } =
    args;
  const now = performance.now();
  if (now - dbg.lastSnapshotAt < 250) return;
  dbg.lastSnapshotAt = now;
  const hits: DebugHit[] = results.slice(0, MAX_DEBUG_HITS).map((h) => ({
    type: h.type,
    position: { ...h.position },
    distance: h.distance,
  }));
  const best = bestHit(results);
  pushDebugSnapshot({
    fps: Math.round(1000 / Math.max(1, dbg.emaMs)),
    camera: { x: ctx.camera.position.x, y: ctx.camera.position.y, z: ctx.camera.position.z },
    hits,
    worldPoints: dbg.points,
    anchor: anchorPos,
    lastHitAgeMs: dbg.lastHitAt > 0 ? Math.round(now - dbg.lastHitAt) : null,
    rotation: best ? { ...best.rotation } : null,
    lastTap: dbg.lastTap ? { type: dbg.lastTap.type, position: { ...dbg.lastTap.position } } : null,
    scanCalls: scan.calls,
    scanErrors: scan.errors,
    scanLastError: scan.lastError,
    slamReady,
    runtimeErrors: readRuntimeErrors(),
    device: describeDevice(),
    view: readViewGeometry(ctx, canvas),
    tracking,
    anchorEvents: readAnchorEvents(),
    placement,
    labelsShown: labels.shown,
    labelOverlapPx: labels.overlap,
  });
}

/** Canvas/camera/renderer geometry — catches feed-vs-marker mismatches. */
function readViewGeometry(ctx: SceneCtx, canvas: HTMLCanvasElement | null): ViewGeometry | null {
  if (!canvas || typeof window === "undefined") return null;
  const rect = canvas.getBoundingClientRect();
  const vv = window.visualViewport;
  const size = new THREE.Vector2();
  try {
    ctx.renderer.getSize(size);
  } catch {
    /* renderer owned by engine */
  }
  let renPr = 0;
  try {
    renPr = ctx.renderer.getPixelRatio();
  } catch {
    /* ignore */
  }
  return {
    cssW: Math.round(rect.width),
    cssH: Math.round(rect.height),
    bufW: canvas.width,
    bufH: canvas.height,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    vvW: Math.round(vv?.width ?? 0),
    vvH: Math.round(vv?.height ?? 0),
    vvScale: vv?.scale ?? 0,
    dpr: window.devicePixelRatio ?? 0,
    camAspect: ctx.camera.aspect,
    camFov: ctx.camera.fov,
    renW: Math.round(size.x),
    renH: Math.round(size.y),
    renPr,
  };
}

type SceneCtx = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  holder: THREE.Group;
  userGroup: THREE.Group;
  reticle: THREE.Group;
  /** Plane grid riding on the reticle, aligned to the surface normal. */
  grid: THREE.GridHelper;
  disposables: THREE.Object3D[];
  videoHandle: ARVideoHandle | null;
  /** Preallocated SLAM feature-point cloud (debug only). */
  points: THREE.Points;
  pointsPositions: Float32Array;
  /** Pooled spheres visualising every hit estimate (debug only). */
  hitMarkers: THREE.Mesh[];
  /** Fading rings marking mapped plane coverage while scanning. */
  trail: THREE.Mesh[];
  trailIndex: number;
};

/**
 * The 8th Wall AR view — the only AR renderer in the app, on every device.
 *
 * XR8 owns the camera loop, the feed quad and SLAM tracking on its own
 * canvas (the documented three.js pattern: GlTextureRenderer + Threejs +
 * XrController pipeline modules). React owns everything else: the flow state
 * machine, the loaded GLB, the HTML overlay UI, and the hotspot markers,
 * which are DOM nodes projected from world space each frame.
 *
 * Placement writes the app anchor exactly like the old WebXR path did, so
 * rotate/scale gestures, panels, booking and audio keep working unchanged —
 * only the tracking substrate moved from WebXR to XR8 SLAM.
 */
export function EighthWallView(props: EighthWallViewProps) {
  const {
    project,
    anchor,
    model,
    showPlaceholder,
    activeHotspotId,
    onSelectHotspot,
    videoVisible,
    soundOn,
    onPlaceAt,
    debug,
    fallbackSignal,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markersRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const leaderRef = useRef<SVGSVGElement>(null);
  /** Measured label pill sizes (per hotspot id) for leader-line math. */
  const measureCache = useRef(new Map<string, { w: number; h: number }>());
  /** Pooled SVG leader paths (max simultaneously shown labels + active). */
  const leaderLines = useRef<SVGPathElement[]>([]);
  /** Fixed UI chrome rects (canvas-relative) that pills must avoid. */
  const zoneCache = useRef<ExclusionZone[]>([]);
  const ctxRef = useRef<SceneCtx | null>(null);
  const runningRef = useRef(false);
  const xr8Ref = useRef<XR8Instance | null>(null);
  /** Frame timing + snapshot throttle (debug only, never React state). */
  const dbgRef = useRef({
    lastFrameAt: 0,
    emaMs: 16,
    lastSnapshotAt: 0,
    lastHitAt: 0,
    points: 0,
    pointsRate: 0,
    pointSamples: [] as Array<{ t: number; n: number }>,
    lastTrailAt: 0,
    lastDrop: null as Vec3 | null,
    lastTap: null as { type: string; position: Vec3 } | null,
  });
  /** Scanner diagnostics (always collected — drives guidance, not just debug). */
  const scanRef = useRef({
    calls: 0,
    errors: 0,
    anyHit: false,
    confidentHit: false,
    lastError: null as string | null,
    lastReportAt: 0,
  });

  // Mutable mirrors for the per-frame engine callbacks (no React state churn).
  const flowRef = useRef(props.flow);
  flowRef.current = props.flow;
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const projectRef = useRef(project);
  projectRef.current = project;
  const onPlaceAtRef = useRef(onPlaceAt);
  onPlaceAtRef.current = onPlaceAt;
  const onSelectHotspotRef = useRef(onSelectHotspot);
  onSelectHotspotRef.current = onSelectHotspot;
  const activeHotspotRef = useRef(activeHotspotId);
  activeHotspotRef.current = activeHotspotId;
  const videoRef = useRef({ videoVisible, soundOn });
  videoRef.current = { videoVisible, soundOn };
  const debugRef = useRef(debug);
  debugRef.current = debug;

  /* Refs to the latest prop snapshots used inside the mount effect below. */
  const modelRef = useRef(model);
  modelRef.current = model;
  const showPlaceholderRef = useRef(showPlaceholder);
  showPlaceholderRef.current = showPlaceholder;
  const syncSceneRef = useRef<() => void>(() => undefined);
  const syncVideoRef = useRef<() => void>(() => undefined);
  const paintActiveMarkerRef = useRef<() => void>(() => undefined);
  /** SLAM chunk state. null until explicitly verified before run(). */
  const slamRef = useRef<boolean | null>(null);
  /** Presentation turntable state (reset per anchor, paused on interaction). */
  const orbitAngle = useRef(0);
  const orbitAnchorId = useRef<string | null>(null);
  const waterEntries = useRef<WaterEntry[]>([]);
  const reducedMotion = useRef<boolean | null>(null);
  /** Latest center-screen estimates of any type (fallback placement source). */
  const centerHitsRef = useRef<XR8HitEstimate[]>([]);
  /** Transient "not mappable yet" hint after an unconfident tap. */
  const [placeHint, setPlaceHint] = useState(false);
  const hintTimer = useRef(0);
  /** Last built content key — rebuilds only happen when this changes. */
  const builtKeyRef = useRef("");
  /** True while the holder actually renders model or placeholder content. */
  const contentReadyRef = useRef(false);

  const flashPlaceHint = () => {
    setPlaceHint(true);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setPlaceHint(false), 2400);
  };

  /* ---------- engine lifecycle (mount / unmount) ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    // Capture for cleanup (refs may point elsewhere by unmount time).
    const markersLayer = markersRef.current;
    const cueEl = cueRef.current;
    const leaderSvg = leaderRef.current;
    // Pooled leader paths (created once, repositioned per frame).
    const leaderPool: SVGPathElement[] = [];
    if (leaderSvg) {
      const NS = "http://www.w3.org/2000/svg";
      for (let i = 0; i < MAX_LEADER_LINES; i++) {
        const path = document.createElementNS(NS, "path");
        path.setAttribute("stroke", "rgba(229,189,114,0.75)");
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("fill", "none");
        path.style.display = "none";
        leaderSvg.appendChild(path);
        leaderPool.push(path);
      }
    }
    leaderLines.current = leaderPool;
    if (runningRef.current) return;
    runningRef.current = true;
    let cancelled = false;
    let xr8: XR8Instance | null = null;
    let videoHandle: ARVideoHandle | null = null;

    // The engine renders with the app's own three.js instance.
    window.THREE = THREE;
    installRuntimeErrorCapture();
    reducedMotion.current = prefersReducedMotion();

    // Anchor lifecycle log: proves whether the anchor ever nulled or got
    // recreated mid-session (vs the world frame jumping under a frozen one).
    const unsubscribeAnchorLog = arManager.anchors.subscribe((next) => {
      if (cancelled) return;
      const prev = anchorRef.current;
      if (next && (!prev || prev.id !== next.id)) {
        pushAnchorEvent(
          `created ${next.id} via=${next.placedVia} @ (${next.position.x.toFixed(2)},${next.position.y.toFixed(2)},${next.position.z.toFixed(2)})`,
        );
        verifyState = {
          via: next.placedVia,
          at: performance.now(),
          done: next.placedVia === "strict",
          ok: next.placedVia === "strict",
          cam0: null,
          recent: [],
        };
      } else if (!next && prev) {
        pushAnchorEvent(`removed ${prev.id}`);
        verifyState = null;
        trackingState = "unknown";
      }
    });

    // Canvas geometry: belt and suspenders. The engine sizes its renderer and
    // camera from the canvas backing store, while marker projection and tap
    // mapping use its CSS box — every side must agree on fullscreen, or the
    // feed renders as a strip and markers land in blackness. Inline styles
    // (not just classes) so nothing in the cascade can collapse the box, and
    // the backing store is re-asserted after engine start because run() may
    // reset the attributes on some devices.
    const paintCanvasFullScreen = () => {
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
    };
    const syncBackingStore = () => {
      paintCanvasFullScreen();
      const cssW = canvas.clientWidth || container.clientWidth || window.innerWidth;
      const cssH = canvas.clientHeight || container.clientHeight || window.innerHeight;
      if (!cssW || !cssH) {
        // Layout not settled yet — retry on the next frame.
        requestAnimationFrame(() => {
          if (!cancelled) syncBackingStore();
        });
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(cssW * dpr));
      const h = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    syncBackingStore();
    const delayedResync = window.setTimeout(() => {
      if (!cancelled) syncBackingStore();
    }, 800);
    const onViewportChange = () => syncBackingStore();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);
    window.visualViewport?.addEventListener("resize", onViewportChange);
    // Prevent scroll/pinch gestures on the canvas (official example pattern).
    const blockGesture = (event: TouchEvent) => {
      event.preventDefault();
    };

    const makeRadialTexture = () => {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const g = c.getContext("2d");
      if (g) {
        const gradient = g.createRadialGradient(128, 128, 8, 128, 128, 128);
        gradient.addColorStop(0, "rgba(229,189,114,0.50)");
        gradient.addColorStop(0.55, "rgba(229,189,114,0.20)");
        gradient.addColorStop(0.85, "rgba(229,189,114,0.06)");
        gradient.addColorStop(1, "rgba(229,189,114,0)");
        g.fillStyle = gradient;
        g.fillRect(0, 0, 256, 256);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    const syncScene = () => {
      const ctx = ctxRef.current;
      const currentAnchor = anchorRef.current;
      const currentProject = projectRef.current;
      if (!ctx) return;
      // Keyed rebuild: only rebuild when the anchor identity, the actual GLB
      // scene object, the placeholder state, or the project changes. In
      // particular a model that is still LOADING (null) must never clear the
      // old one — that gap renders labels with no model, the reported bug.
      const currentModel = modelRef.current;
      const key = currentAnchor
        ? `${currentAnchor.id}|${currentModel ? currentModel.scene.uuid : `none:${showPlaceholderRef.current}`}|${currentProject.slug}`
        : "";
      if (!currentAnchor) {
        // Teardown: clear everything, including the key.
        for (const child of [...ctx.userGroup.children]) ctx.userGroup.remove(child);
        for (const child of [...ctx.holder.children]) {
          if (child !== ctx.userGroup) ctx.holder.remove(child);
        }
        ctx.disposables.forEach((obj) => {
          obj.traverse?.((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.geometry?.dispose();
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach((m) => {
                const std = m as THREE.MeshStandardMaterial;
                std.map?.dispose?.();
                m?.dispose?.();
              });
            }
          });
        });
        ctx.disposables = [];
        if (videoHandle) {
          videoHandle.dispose();
          videoHandle = null;
          ctx.videoHandle = null;
        }
        if (markersRef.current) markersRef.current.replaceChildren();
        builtKeyRef.current = "";
        contentReadyRef.current = false;
        return;
      }
      if (key === builtKeyRef.current) return; // Nothing new — keep rendering.
      builtKeyRef.current = key;
      // Rebuild anchored content. The loaded GLB belongs to the model cache —
      // detach, never dispose.
      for (const child of [...ctx.userGroup.children]) ctx.userGroup.remove(child);
      for (const child of [...ctx.holder.children]) {
        if (child !== ctx.userGroup) ctx.holder.remove(child);
      }
      ctx.disposables.forEach((obj) => {
        obj.traverse?.((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry?.dispose();
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((m) => {
              const std = m as THREE.MeshStandardMaterial;
              std.map?.dispose?.();
              m?.dispose?.();
            });
          }
        });
      });
      ctx.disposables = [];
      if (videoHandle) {
        videoHandle.dispose();
        videoHandle = null;
        ctx.videoHandle = null;
      }
      if (markersRef.current) markersRef.current.replaceChildren();

      const s = currentProject.realWorldSize;
      ctx.holder.position.set(
        currentAnchor.position.x,
        currentAnchor.position.y,
        currentAnchor.position.z,
      );
      ctx.userGroup.rotation.set(0, currentAnchor.rotationY, 0);
      ctx.userGroup.scale.setScalar(currentAnchor.scale);

      // Ground disc under the placement.
      const discTex = makeRadialTexture();
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(s * 1.1, 48),
        new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.002;
      disc.renderOrder = 1;
      ctx.holder.add(disc);
      ctx.disposables.push(disc);

      contentReadyRef.current = Boolean(currentModel || showPlaceholderRef.current);
      if (currentModel) {
        const offset = new THREE.Group();
        offset.position.set(
          currentModel.baseOffset.x * currentModel.fitScale,
          currentModel.baseOffset.y * currentModel.fitScale,
          currentModel.baseOffset.z * currentModel.fitScale,
        );
        offset.scale.setScalar(currentModel.fitScale);
        currentModel.scene.traverse((child) => {
          child.castShadow = true;
          child.receiveShadow = true;
        });
        offset.add(currentModel.scene);
        ctx.userGroup.add(offset);
      } else if (showPlaceholderRef.current) {
        const massing = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: "#ded4c2", roughness: 0.6 });
        const gold = new THREE.MeshStandardMaterial({
          color: "#e5bd72",
          roughness: 0.4,
          metalness: 0.4,
        });
        const w = s * 0.5;
        const d = s * 0.38;
        [0, 1, 2].forEach((level) => {
          const h = s * (0.3 - level * 0.06);
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(w * (1 - level * 0.2), h, d * (1 - level * 0.2)),
            level === 1 ? gold : mat,
          );
          box.position.y = s * 0.15 + level * s * 0.24;
          box.castShadow = true;
          massing.add(box);
        });
        ctx.userGroup.add(massing);
        ctx.disposables.push(massing);
      }

      // HTML hotspot markers, projected every frame in onUpdate.
      const layer = markersRef.current;
      if (layer) {
        for (const hotspot of currentProject.hotspots) {
          const el = document.createElement("button");
          el.type = "button";
          el.dataset["hotspotId"] = hotspot.id;
          el.setAttribute("aria-label", hotspot.title);
          el.className =
            "pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1";
          el.innerHTML =
            `<span data-dot class="hotspot-pulse block size-5 rounded-full border-2 border-[#e5bd72] bg-[#e5bd72]/80 shadow-[0_0_12px_rgba(229,189,114,0.8)]"></span>` +
            `<span data-label class="glass-panel rounded-full px-2 py-0.5 text-[0.6rem] whitespace-nowrap text-foreground">${
              hotspot.type ? `${HOTSPOT_TYPE_LABEL[hotspot.type]} · ` : ""
            }${hotspot.label}</span>`;
          el.addEventListener("click", (event) => {
            event.stopPropagation();
            notifyUserInteraction();
            onSelectHotspotRef.current(hotspot);
          });
          layer.appendChild(el);
        }
        paintActiveMarker();
        // Measure pill sizes once (static content) for leader-line math.
        // Falls back to estimates until fonts/layout settle.
        requestAnimationFrame(() => {
          const live = markersRef.current;
          if (!live) return;
          live.querySelectorAll<HTMLElement>("[data-label]").forEach((label) => {
            const btn = label.closest<HTMLElement>("[data-hotspot-id]");
            const id = btn?.dataset["hotspotId"];
            if (!id || measureCache.current.has(id)) return;
            const w = label.offsetWidth;
            const h = label.offsetHeight;
            if (w > 0 && h > 0) measureCache.current.set(id, { w, h });
          });
        });
      }

      syncVideo();
    };
    syncSceneRef.current = syncScene;

    const syncVideo = () => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const { videoVisible: show, soundOn: audible } = videoRef.current;
      const src = projectRef.current.arVideoUrl;
      if (videoHandle) {
        videoHandle.dispose();
        videoHandle = null;
        ctx.videoHandle = null;
        ctx.userGroup.children
          .filter((c) => c.userData["isVideoPlane"])
          .forEach((c) => ctx.userGroup.remove(c));
      }
      if (!show || !src || !anchorRef.current) return;
      const s = projectRef.current.realWorldSize;
      const width = s * 0.9;
      const height = width * 0.5625;
      videoHandle = createARVideo(src, { loop: true, muted: !audible });
      ctx.videoHandle = videoHandle;
      const holder = new THREE.Group();
      holder.userData["isVideoPlane"] = true;
      holder.position.set(0, 0.34, -0.32);
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({
          map: videoHandle.texture,
          toneMapped: false,
          side: THREE.DoubleSide,
        }),
      );
      const frame = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 1.04, height * 1.07),
        new THREE.MeshBasicMaterial({
          color: "#e5bd72",
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
        }),
      );
      frame.position.z = -0.004;
      holder.add(screen, frame);
      ctx.userGroup.add(holder);
      void videoHandle.play();
    };
    syncVideoRef.current = syncVideo;

    const paintActiveMarker = () => {
      const layer = markersRef.current;
      if (!layer) return;
      const activeId = activeHotspotRef.current;
      layer.querySelectorAll<HTMLElement>("[data-hotspot-id]").forEach((el) => {
        const dot = el.querySelector<HTMLElement>("[data-dot]");
        const on = el.dataset["hotspotId"] === activeId;
        if (dot) {
          // Active state via paint, not transform — the CSS pulse owns scale.
          dot.style.background = on ? "#fff" : "";
          dot.style.boxShadow = on ? "0 0 16px rgba(255,255,255,0.9)" : "";
        }
      });
    };
    paintActiveMarkerRef.current = paintActiveMarker;

    let lastResults: XR8HitEstimate[] = [];
    // Plane-lock consensus: a surface must hold still across consecutive
    // frames before it counts — kills jitter/false positives without ML.
    const lock = new PlaneLockTracker(8, 0.02);
    let frameNo = 0;
    const tmpAnchor = new THREE.Vector3();
    // Live label-deconfliction readout for the debug HUD.
    const lastLabelStats = { shown: 0, overlap: 0 };
    // --- post-placement tracking health (anchor-stability monitor) ---
    // The app anchor itself is immutable; what can move under it is the SLAM
    // world frame (relocalization jumps) or garbage camera poses. This block
    // detects both so the UI can freeze markers + cue recovery explicitly.
    let trackingState: TrackingState = "unknown";
    let prevTrackingState: TrackingState = "unknown";
    let healthLastAt = 0;
    let lastHitSeenAt = 0;
    let prevCamValid = false;
    const prevCam = new THREE.Vector3();
    const tmpCam = new THREE.Vector3();
    let verifyState: {
      via: string;
      at: number;
      done: boolean;
      ok: boolean;
      cam0: THREE.Vector3 | null;
      recent: Array<{ t: number; x: number; y: number; z: number }>;
    } | null = null;
    /** Feed one confident sample into the pending placement verification. */
    const noteVerificationSample = (x: number, y: number, z: number, t: number) => {
      if (!verifyState || verifyState.done) return;
      verifyState.recent.push({ t, x, y, z });
      while (verifyState.recent.length > 0) {
        const oldest = verifyState.recent[0];
        if (!oldest || t - oldest.t <= 3000) break;
        verifyState.recent.shift();
      }
    };
    // Previous frame timestamp for delta-timed ambient motion.
    let prevMotionT = 0;

    const worldModule = {
      name: "aurelia-resort-world",
      onStart: () => {
        if (!xr8 || cancelled) return;
        const { scene, camera, renderer } = xr8.Threejs.xrScene();
        try {
          renderer.shadowMap.enabled = true;
          renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        } catch {
          /* renderer owned by the engine — shadows are best effort */
        }
        scene.add(new THREE.HemisphereLight(0xfff6e6, 0x2c2a25, 0.9));
        const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
        sun.position.set(1.4, 2.6, 1.2);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        scene.add(sun);

        camera.position.set(0, 1.5, 0);
        // Pass copies: the engine must snapshot the start pose, and SLAM
        // rewrites the live camera transform every frame after this.
        xr8.XrController.updateCameraProjectionMatrix({
          origin: { ...camera.position },
          facing: {
            x: camera.quaternion.x,
            y: camera.quaternion.y,
            z: camera.quaternion.z,
            w: camera.quaternion.w,
          },
        });

        const holder = new THREE.Group();
        const userGroup = new THREE.Group();
        holder.add(userGroup);
        scene.add(holder);

        const reticle = new THREE.Group();
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.09, 0.11, 48),
          new THREE.MeshBasicMaterial({
            color: "#e5bd72",
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthTest: false,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        const dot = new THREE.Mesh(
          new THREE.CircleGeometry(0.02, 24),
          new THREE.MeshBasicMaterial({ color: "#f2d69a", depthTest: false, transparent: true }),
        );
        dot.rotation.x = -Math.PI / 2;
        dot.position.y = 0.001;
        reticle.add(ring, dot);
        reticle.visible = false;
        reticle.renderOrder = 10;
        scene.add(reticle);

        // Plane grid: rides on the reticle and aligns to the surface normal
        // from the hit estimate, so you see the exact plane you're placing on.
        const grid = new THREE.GridHelper(1, 10, "#e5bd72", "#e5bd72");
        const gridMat = grid.material as THREE.LineBasicMaterial;
        gridMat.transparent = true;
        gridMat.opacity = 0.35;
        gridMat.depthTest = false;
        grid.visible = false;
        grid.renderOrder = 10;
        reticle.add(grid);

        // Scanning trail: fading rings dropped on confident hits, visualising
        // the mapped plane coverage like native AR plane dots.
        const trail: THREE.Mesh[] = [];
        for (let i = 0; i < 12; i++) {
          const patch = new THREE.Mesh(
            new THREE.RingGeometry(0.12, 0.14, 32),
            new THREE.MeshBasicMaterial({
              color: "#e5bd72",
              transparent: true,
              opacity: 0,
              side: THREE.DoubleSide,
              depthWrite: false,
            }),
          );
          patch.visible = false;
          patch.renderOrder = 9;
          scene.add(patch);
          trail.push(patch);
        }

        // Debug layer: SLAM feature-point cloud + hit-estimate markers.
        const pointsPositions = new Float32Array(MAX_DEBUG_POINTS * 3);
        const pointsGeometry = new THREE.BufferGeometry();
        pointsGeometry.setAttribute("position", new THREE.BufferAttribute(pointsPositions, 3));
        pointsGeometry.setDrawRange(0, 0);
        const points = new THREE.Points(
          pointsGeometry,
          new THREE.PointsMaterial({
            color: "#33ddff",
            size: 0.02,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.85,
            depthTest: true,
          }),
        );
        points.frustumCulled = false;
        points.visible = debugRef.current;
        scene.add(points);
        const hitMarkers: THREE.Mesh[] = [];
        for (let i = 0; i < MAX_DEBUG_HITS; i++) {
          const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.025, 12, 12),
            new THREE.MeshBasicMaterial({ color: "#8899aa", depthTest: false, transparent: true }),
          );
          marker.visible = false;
          marker.renderOrder = 11;
          scene.add(marker);
          hitMarkers.push(marker);
        }
        try {
          xr8.XrController.configure({ enableWorldPoints: debugRef.current });
        } catch {
          /* older engine builds ignore unknown flags */
        }

        ctxRef.current = {
          scene,
          camera,
          renderer,
          holder,
          userGroup,
          reticle,
          grid,
          disposables: [],
          videoHandle: null,
          points,
          pointsPositions,
          hitMarkers,
          trail,
          trailIndex: 0,
        };
        syncScene();
        // Re-assert geometry now that the engine has initialised — run() may
        // have reset the canvas attributes on some devices.
        syncBackingStore();
        arManager.sessionStarted();
      },
      onUpdate: (frameArgs: { processCpuResult?: unknown }) => {
        if (!xr8 || cancelled) return;
        const ctx = ctxRef.current;
        if (!ctx) return;
        const now = performance.now();
        const dbg = dbgRef.current;
        dbg.emaMs = dbg.emaMs * 0.9 + Math.max(1, now - (dbg.lastFrameAt || now - 16)) * 0.1;
        dbg.lastFrameAt = now;
        const showDebug = debugRef.current;
        const placed = anchorRef.current !== null;
        const scanning =
          flowRef.current === "SURFACE_SCANNING" || flowRef.current === "SURFACE_DETECTED";
        if (!placed && scanning) {
          // hitTest can throw on early frames (tracking not ready) — a throw
          // is data too: it means the tracker gave us nothing, not a crash.
          // The documented source list is passed explicitly (see hitTest docs).
          let results: XR8HitEstimate[] = [];
          const scan = scanRef.current;
          try {
            scan.calls += 1;
            results = xr8.XrController.hitTest(0.5, 0.5, ["FEATURE_POINT"]);
          } catch (error) {
            scan.errors += 1;
            scan.lastError = error instanceof Error ? error.message : String(error);
            results = [];
          }
          lastResults = results;
          centerHitsRef.current = results;
          if (results.length > 0) scan.anyHit = true;
          const hit = bestHit(results);
          const typeConfident =
            !!hit && (hit.type === "DETECTED_SURFACE" || hit.type === "ESTIMATED_SURFACE");
          // Promotion requires consensus, not a single lucky frame.
          const locked = lock.push(hit ? hit.position : null, typeConfident);
          if (now - scan.lastReportAt > 1000) {
            scan.lastReportAt = now;
            arManager.reportScanStats({
              hitTestCalls: scan.calls,
              hitTestErrors: scan.errors,
              anyHit: scan.anyHit,
              confidentHit: scan.confidentHit,
              lastError: scan.lastError,
              lockStreak: lock.streakCount,
              lockRequired: lock.requiredCount,
              pointsRate: dbg.pointsRate,
            });
          }
          if (hit) {
            dbg.lastHitAt = now;
            if (locked) scan.confidentHit = true;
            ctx.reticle.visible = true;
            ctx.reticle.position.set(hit.position.x, hit.position.y, hit.position.z);
            // Align the reticle + plane grid to the surface orientation. For a
            // floor hit this is ~identity (grid lies flat); walls tilt it.
            // Feature-point hits may carry a zero quaternion — keep the last
            // orientation instead of collapsing.
            if (hasValidRotation(hit.rotation)) {
              ctx.reticle.quaternion.set(
                hit.rotation.x,
                hit.rotation.y,
                hit.rotation.z,
                hit.rotation.w,
              );
            }
            const mat = (ctx.reticle.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
            // Confidence-gated reticle: grey = noise, amber = converging,
            // gold = locked plane (promotion happens on this frame).
            mat.color.set(locked ? "#e5bd72" : typeConfident ? "#fbbf24" : "#8a8a8a");
            ctx.grid.visible = locked;
            arManager.reportSurfaceHit({ position: { ...hit.position }, confident: locked });
            if (typeConfident) {
              noteVerificationSample(hit.position.x, hit.position.y, hit.position.z, now);
            }
            if (locked) {
              // Drop a fading trail patch as the phone sweeps mapped planes.
              const prev = dbg.lastDrop;
              const moved =
                !prev ||
                Math.hypot(
                  hit.position.x - prev.x,
                  hit.position.y - prev.y,
                  hit.position.z - prev.z,
                ) > 0.06;
              if (moved && now - dbg.lastTrailAt > 500) {
                dbg.lastTrailAt = now;
                dbg.lastDrop = { ...hit.position };
                const patch = ctx.trail[ctx.trailIndex % ctx.trail.length];
                if (patch) {
                  patch.position.set(hit.position.x, hit.position.y + 0.005, hit.position.z);
                  patch.quaternion.copy(ctx.reticle.quaternion);
                  (patch.material as THREE.MeshBasicMaterial).opacity = 0.55;
                  patch.visible = true;
                }
                ctx.trailIndex += 1;
              }
            }
          } else {
            ctx.reticle.visible = false;
            ctx.grid.visible = false;
            arManager.reportSurfaceHit(null);
          }
          if (showDebug) {
            // Every estimate gets a colour-coded sphere: green = surface found,
            // yellow = estimated, grey = raw feature point.
            ctx.hitMarkers.forEach((marker, i) => {
              const estimate = results[i];
              if (!estimate) {
                marker.visible = false;
                return;
              }
              marker.visible = true;
              marker.position.set(estimate.position.x, estimate.position.y, estimate.position.z);
              (marker.material as THREE.MeshBasicMaterial).color.set(
                HIT_COLORS[estimate.type] ?? "#666666",
              );
            });
          }
        } else {
          ctx.reticle.visible = false;
          ctx.grid.visible = false;
          lock.reset();
          if (!placed) lastResults = [];
        }
        // --- tracking health (runs in every phase, ~2 Hz sampling) ---
        // The anchor Vec3 is immutable, so any post-placement motion on screen
        // comes from the SLAM frame (relocalization jumps) or garbage camera
        // poses — both are detected here, never by moving the model.
        if (now - healthLastAt > 500) {
          healthLastAt = now;
          let healthResults: XR8HitEstimate[] = [];
          try {
            healthResults = xr8.XrController.hitTest(0.5, 0.5, ["FEATURE_POINT"]);
          } catch {
            healthResults = [];
          }
          lastResults = healthResults;
          centerHitsRef.current = healthResults;
          if (healthResults.length > 0) lastHitSeenAt = now;
          const healthBest = bestHit(healthResults);
          if (
            healthBest &&
            (healthBest.type === "DETECTED_SURFACE" || healthBest.type === "ESTIMATED_SURFACE")
          ) {
            noteVerificationSample(
              healthBest.position.x,
              healthBest.position.y,
              healthBest.position.z,
              now,
            );
          }
        }
        const camPos = ctx.camera.position;
        const camFinite =
          Number.isFinite(camPos.x) && Number.isFinite(camPos.y) && Number.isFinite(camPos.z);
        let camJump = 0;
        if (prevCamValid && camFinite) {
          tmpCam.copy(camPos).sub(prevCam);
          camJump = tmpCam.length();
        }
        if (camFinite) {
          prevCam.copy(camPos);
          prevCamValid = true;
        } else {
          prevCamValid = false;
        }
        if (!camFinite) {
          trackingState = "lost";
        } else if (camJump > 0.75) {
          // Teleport in a single frame — relocalization jump, not a hand.
          trackingState = "lost";
        } else if (placed) {
          trackingState = now - lastHitSeenAt < 5000 ? "ok" : "degraded";
        } else {
          trackingState =
            lastHitSeenAt === 0 ? "unknown" : now - lastHitSeenAt < 2000 ? "ok" : "degraded";
        }
        // Log transitions once — this is what makes "was it lost at that
        // moment?" answerable after the fact from Copy diagnostics.
        if (trackingState !== prevTrackingState) {
          pushAnchorEvent(`tracking ${prevTrackingState} → ${trackingState}`);
          prevTrackingState = trackingState;
        }
        // Assisted/fallback verification: within ~2.5 s of planting, a
        // confident hit near the anchor while the phone holds still upgrades
        // the guess to confirmed. A miss keeps the original placement.
        if (verifyState && !verifyState.done && anchorRef.current) {
          const anchorPos = anchorRef.current.position;
          if (!verifyState.cam0 && camFinite) verifyState.cam0 = camPos.clone();
          const settled =
            now - verifyState.at > 2500 ||
            (verifyState.cam0 && camFinite && camPos.distanceTo(verifyState.cam0) > 0.5);
          if (settled) {
            verifyState.done = true;
            verifyState.ok = verifyState.recent.some(
              (sample) =>
                Math.hypot(sample.x - anchorPos.x, sample.y - anchorPos.y, sample.z - anchorPos.z) <
                0.2,
            );
          }
        }
        // Tracking cue + marker freeze. The model itself is never touched —
        // it stays rendered at its last-known-good world position.
        if (cueEl) {
          cueEl.style.display = trackingState === "lost" && placed ? "" : "none";
        }
        // Fade scanning-trail patches in every phase (they outlive scanning).
        for (const patch of ctx.trail) {
          if (!patch.visible) continue;
          const patchMat = patch.material as THREE.MeshBasicMaterial;
          patchMat.opacity -= (dbg.emaMs / 1000) * 0.14;
          if (patchMat.opacity <= 0) patch.visible = false;
        }
        // Point-cloud COUNT is tracked every frame (cheap property reads) so
        // the confidence meter sees growth rate in production; the GPU copy
        // below stays debug-gated.
        const cloud = extractWorldPoints(frameArgs?.processCpuResult);
        const target = cloud ? Math.min(cloud.count, MAX_DEBUG_POINTS) : 0;
        dbg.pointSamples.push({ t: now, n: target });
        while (dbg.pointSamples.length > 0) {
          const oldest = dbg.pointSamples[0];
          if (!oldest || now - oldest.t <= 2500) break;
          dbg.pointSamples.shift();
        }
        {
          const samples = dbg.pointSamples;
          const first = samples[0];
          const last = samples[samples.length - 1];
          const dt = first && last ? (last.t - first.t) / 1000 : 0;
          dbg.pointsRate =
            dt > 0.5 && first && last ? Math.max(0, Math.round((last.n - first.n) / dt)) : 0;
        }
        if (showDebug) {
          // SLAM feature-point cloud straight from the tracker (geometry copy
          // stays debug-gated; the count above feeds the meter in prod too).
          for (let i = 0; i < target; i++) {
            ctx.pointsPositions[i * 3] = cloud?.positions[i * 3] ?? 0;
            ctx.pointsPositions[i * 3 + 1] = cloud?.positions[i * 3 + 1] ?? 0;
            ctx.pointsPositions[i * 3 + 2] = cloud?.positions[i * 3 + 2] ?? 0;
          }
          ctx.points.geometry.setDrawRange(0, target);
          (ctx.points.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate =
            true;
          dbg.points = target;
          const anchorNow = anchorRef.current;
          const scan = scanRef.current;
          maybePushSnapshot({
            ctx,
            dbg,
            results: lastResults,
            anchorPos: anchorNow ? { ...anchorNow.position } : null,
            scan: { calls: scan.calls, errors: scan.errors, lastError: scan.lastError },
            slamReady: slamRef.current,
            canvas,
            tracking: trackingState,
            placement: verifyState
              ? { via: verifyState.via, verified: verifyState.done ? verifyState.ok : null }
              : null,
            labels: { ...lastLabelStats },
          });
        }
        // Project hotspot markers into screen space, measured against the
        // canvas itself (not the container) so CSS edge cases can't skew it.
        // Then ambient motion: turntable orbit + water shimmer on decoupled
        // clocks, both paused while the user interacts.
        const orbitAnchor = anchorRef.current;
        if (orbitAnchor) {
          if (orbitAnchor.id !== orbitAnchorId.current) {
            orbitAnchorId.current = orbitAnchor.id;
            orbitAngle.current = 0;
          }
          const dtS = prevMotionT > 0 ? Math.min(0.1, Math.max(0, (now - prevMotionT) / 1000)) : 0;
          if (!reducedMotion.current && isInteractionIdle()) {
            orbitAngle.current += AUTO_ORBIT_RAD_PER_SEC * dtS;
          }
          if (ctx) {
            ctx.userGroup.rotation.y = orbitAnchor.rotationY + orbitAngle.current;
          }
        }
        prevMotionT = now;
        if (waterEntries.current.length > 0) {
          updateWaterShimmer(waterEntries.current, now / 1000);
        }
        const layer = markersRef.current;
        // Markers freeze (hidden) when tracking is lost or the camera pose is
        // garbage — projecting them then is what makes UI "follow the camera".
        // The 3D model is never touched: it stays at its world position.
        const camP = ctx.camera.position;
        const showMarkers =
          placed &&
          contentReadyRef.current &&
          trackingState !== "lost" &&
          Number.isFinite(camP.x) &&
          Number.isFinite(camP.y) &&
          Number.isFinite(camP.z);
        if (layer) layer.style.display = showMarkers ? "" : "none";
        const leaderSvg = leaderRef.current;
        if (leaderSvg) leaderSvg.style.display = showMarkers ? "" : "none";
        if (!showMarkers) {
          lastLabelStats.shown = 0;
          lastLabelStats.overlap = 0;
        }
        if (layer && showMarkers) {
          const rect = canvas.getBoundingClientRect();
          const w = rect.width || 1;
          const h = rect.height || 1;
          const s = projectRef.current.realWorldSize;
          const v = new THREE.Vector3();
          // Pass 1: project everything, collect on-screen candidates.
          const candidates: Array<{
            el: HTMLElement;
            label: HTMLElement | null;
            centerDist: number;
            camDist: number;
          }> = [];
          for (const el of Array.from(layer.children) as HTMLElement[]) {
            const hotspot = projectRef.current.hotspots.find(
              (hot: HotspotData) => hot.id === el.dataset["hotspotId"],
            );
            if (!hotspot) {
              el.style.display = "none";
              continue;
            }
            v.set(hotspot.position.x * s, hotspot.position.y * s, hotspot.position.z * s);
            ctx.userGroup.localToWorld(v);
            const camDist = v.distanceTo(ctx.camera.position);
            v.project(ctx.camera);
            if (v.z > 1 || v.z < -1) {
              el.style.display = "none";
              continue;
            }
            el.style.display = "";
            el.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
            el.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
            candidates.push({
              el,
              label: el.querySelector<HTMLElement>("[data-label]"),
              // NDC distance from screen center — what the user is looking at.
              centerDist: Math.hypot(v.x, v.y),
              camDist,
            });
          }
          // Pass 2 — declutter through the unit-tested pure layout module:
          // nearest few, vertical spread, elbow leaders that cannot cross
          // text. Dots always stay; only pills are culled/moved.
          const activeId = activeHotspotRef.current;
          // Anchor off-screen → no labels at all (a floating edge cluster
          // with no visible model repeats the label/model desync confusion).
          const anchorNow2 = anchorRef.current;
          let anchorVisible = true;
          if (anchorNow2) {
            tmpAnchor.set(anchorNow2.position.x, anchorNow2.position.y, anchorNow2.position.z);
            tmpAnchor.project(ctx.camera);
            anchorVisible = !(
              tmpAnchor.z > 1 ||
              tmpAnchor.z < -1 ||
              tmpAnchor.x < -1.15 ||
              tmpAnchor.x > 1.15 ||
              tmpAnchor.y < -1.15 ||
              tmpAnchor.y > 1.15
            );
          }
          // Fixed UI chrome as exclusion zones (canvas-relative px), refreshed
          // ~2×/s — static DOM, no per-frame layout reads.
          frameNo += 1;
          if (frameNo % 30 === 0 || zoneCache.current.length === 0) {
            zoneCache.current = readChromeZones(canvas);
          }
          const inputs: LabelInput[] = [];
          for (const candidate of candidates) {
            const id = candidate.el.dataset["hotspotId"];
            if (!id || !candidate.label) continue;
            const measured = measureCache.current.get(id) ?? FALLBACK_LABEL_SIZE;
            const px = Number(candidate.el.style.left.replace("px", "")) || 0;
            const py = Number(candidate.el.style.top.replace("px", "")) || 0;
            inputs.push({
              id,
              x: px,
              y: py,
              w: measured.w,
              h: measured.h,
              camDist: candidate.camDist,
              centerDist: candidate.centerDist,
              active: activeId !== null && id === activeId,
            });
          }
          const placed2 = layoutLabels(inputs, {
            viewportW: w,
            viewportH: h,
            excluded: zoneCache.current,
            anchorVisible,
          });
          const placedById = new Map(placed2.map((p) => [p.id, p]));
          for (const candidate of candidates) {
            if (!candidate.label) continue;
            const id = candidate.el.dataset["hotspotId"];
            const chosen = id ? placedById.get(id) : undefined;
            candidate.label.style.display = chosen ? "" : "none";
            candidate.label.style.transform = "";
          }
          // Live overlap readout for the debug HUD — proves deconfliction.
          let maxOverlap = 0;
          const finalRects = placed2.map((p) => {
            const src = inputs.find((i) => i.id === p.id);
            const w2 = src?.w ?? 0;
            const h2 = src?.h ?? 0;
            return {
              x0: p.labelCx - w2 / 2,
              x1: p.labelCx + w2 / 2,
              y0: p.labelCy - h2 / 2,
              y1: p.labelCy + h2 / 2,
            };
          });
          for (let a = 0; a < finalRects.length; a++) {
            for (let b = a + 1; b < finalRects.length; b++) {
              const A = finalRects[a];
              const B = finalRects[b];
              if (!A || !B) continue;
              const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
              const oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
              if (ox > 0 && oy > 0) maxOverlap = Math.max(maxOverlap, Math.min(ox, oy));
            }
          }
          lastLabelStats.shown = placed2.length;
          lastLabelStats.overlap = Math.round(maxOverlap * 10) / 10;
          // Apply offsets + elbow leader paths.
          const paths = leaderLines.current;
          paths.forEach((path) => {
            path.style.display = "none";
          });
          placed2.forEach((p, i) => {
            const candidate = candidates.find((c) => c.el.dataset["hotspotId"] === p.id);
            const label = candidate?.label;
            if (label && (Math.abs(p.dx) > 1 || Math.abs(p.dy) > 1)) {
              label.style.transform = `translate(${p.dx.toFixed(1)}px, ${p.dy.toFixed(1)}px)`;
            }
            // Measure-on-show: cache real pill sizes the first frame each
            // label is visible (one forced layout per label per session —
            // never a per-frame read).
            if (label && !measureCache.current.has(p.id)) {
              const w = label.offsetWidth;
              const h = label.offsetHeight;
              if (w > 0 && h > 0) measureCache.current.set(p.id, { w, h });
            }
            const path = paths[i];
            if (path && p.line) {
              path.setAttribute(
                "d",
                `M${p.line.points.map((pt) => `${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" L")}`,
              );
              path.style.display = "";
            }
          });
        }
      },
    };

    // Tap-to-place with a hit test at the tap point (fresher than the reticle).
    // Placement requires a CONFIDENT surface — a raw feature point swims as
    // the map refines, which is exactly the "model drifts" failure.
    const onTouchEnd = (event: TouchEvent) => {
      if (anchorRef.current !== null) return;
      if (event.changedTouches.length !== 1) return;
      if (!xr8) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const rect = canvas.getBoundingClientRect();
      const x = (touch.clientX - rect.left) / rect.width;
      const y = (touch.clientY - rect.top) / rect.height;
      let tapResults: XR8HitEstimate[] = [];
      try {
        tapResults = xr8.XrController.hitTest(x, y, ["FEATURE_POINT"]);
      } catch (error) {
        const scan = scanRef.current;
        scan.errors += 1;
        scan.lastError = error instanceof Error ? error.message : String(error);
        flashPlaceHint();
        return;
      }
      const tapBest = bestHit(tapResults);
      if (!tapBest) {
        // Taps must never die silently — tell the user the tracker is blind.
        flashPlaceHint();
        return;
      }
      dbgRef.current.lastTap = { type: tapBest.type, position: { ...tapBest.position } };
      const confident = tapBest.type === "DETECTED_SURFACE" || tapBest.type === "ESTIMATED_SURFACE";
      // Assisted mode (user asked to place on a table/plan anyway) accepts any
      // estimate; strict mode keeps requiring a converged surface.
      const assisted = arManager.getState().placementMode === "assisted";
      if (!confident && !assisted) {
        flashPlaceHint();
        return;
      }
      onPlaceAtRef.current({ ...tapBest.position }, assisted ? "assisted" : "strict");
    };
    canvas.addEventListener("touchend", onTouchEnd);
    canvas.addEventListener("touchmove", blockGesture, { passive: false });
    // Any touch pauses the turntable; it resumes after idle (model-viewer pattern).
    const onTouchStart = () => notifyUserInteraction();
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });

    void (async () => {
      xr8 = await loadXR8();
      xr8Ref.current = xr8;
      if (cancelled) return;
      if (!xr8) {
        arManager.fail("AR_UNSUPPORTED");
        return;
      }
      // Verify the SLAM chunk explicitly. A half-loaded engine (camera live,
      // tracking dead) is otherwise indistinguishable from "no surface".
      const slam = await ensureSlamChunk(xr8);
      slamRef.current = slam.ok;
      if (cancelled) return;
      if (!slam.ok) {
        arManager.fail(
          "ENGINE_ERROR",
          `The tracking download didn't finish (${slam.error}). Reconnect to stable Wi-Fi or mobile data and try again.`,
        );
        return;
      }
      // Ask for feature points up front when debugging (also toggled live).
      if (debugRef.current) {
        try {
          xr8.XrController.configure({ enableWorldPoints: true });
        } catch {
          /* older engine builds ignore unknown flags */
        }
      }
      try {
        xr8.addCameraPipelineModules([
          xr8.GlTextureRenderer.pipelineModule(),
          xr8.Threejs.pipelineModule(),
          xr8.XrController.pipelineModule(),
          worldModule,
        ]);
        // Pin the rear camera explicitly. The default is BACK, but several
        // Android OEMs enumerate cameras in an order that opens the wrong
        // lens (selfie/ultrawide) unless forced. SLAM requires BACK.
        let back: string | null = null;
        try {
          back = xr8.XrConfig.camera().BACK;
        } catch {
          back = null;
        }
        xr8.run(back ? { canvas, cameraConfig: { direction: back } } : { canvas });
      } catch {
        arManager.fail("CAMERA_UNAVAILABLE");
      }
    })();

    return () => {
      cancelled = true;
      runningRef.current = false;
      unsubscribeAnchorLog();
      window.clearTimeout(hintTimer.current);
      window.clearTimeout(delayedResync);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchmove", blockGesture);
      canvas.removeEventListener("touchstart", onTouchStart);
      if (videoHandle) {
        videoHandle.dispose();
        videoHandle = null;
      }
      restoreWaterMaterials(waterEntries.current);
      waterEntries.current = [];
      ctxRef.current = null;
      xr8Ref.current = null;
      clearDebugSnapshot();
      markersLayer?.replaceChildren();
      try {
        xr8?.clearCameraPipelineModules();
      } catch {
        /* already torn down */
      }
      try {
        xr8?.stop();
      } catch {
        /* session already ended */
      }
    };
    // Engine owns its lifecycle per mount; React props flow in via refs/effects.
  }, []);

  /* Water materials are identified per loaded model; restored on swap and
     unmount because the GLB cache keeps the scene (and materials) alive. */
  useEffect(() => {
    restoreWaterMaterials(waterEntries.current);
    waterEntries.current = model ? collectWaterMaterials(model.scene) : [];
    return () => restoreWaterMaterials(waterEntries.current);
  }, [model]);

  /* Rebuild anchored content when placement / model changes. */
  useEffect(() => {
    syncSceneRef.current();
  }, [anchor, model, showPlaceholder, project]);

  /* Video visibility / mute. */
  useEffect(() => {
    syncVideoRef.current();
  }, [videoVisible, soundOn, anchor, model]);

  /* Marker highlight. */
  useEffect(() => {
    paintActiveMarkerRef.current();
  }, [activeHotspotId]);

  /* Debug layer toggle: world-points processing + cloud/marker visibility. */
  useEffect(() => {
    const ctx = ctxRef.current;
    const engine = xr8Ref.current;
    if (engine) {
      try {
        engine.XrController.configure({ enableWorldPoints: debug });
      } catch {
        /* older engine builds ignore unknown flags */
      }
    }
    if (ctx) {
      ctx.points.visible = debug;
      if (!debug) {
        ctx.points.geometry.setDrawRange(0, 0);
        ctx.hitMarkers.forEach((marker) => {
          marker.visible = false;
        });
        clearDebugSnapshot();
      }
    }
  }, [debug]);

  /* Local yaw/scale ride on the holder without rebuilding geometry. */
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !anchor) return;
    ctx.userGroup.rotation.set(0, anchor.rotationY, 0);
    ctx.userGroup.scale.setScalar(anchor.scale);
  }, [anchor]);

  /* Last-resort placement: last feature-point depth wins, else a fixed
     camera-forward point. Hard floor on depth: anything nearer than ~0.8 m
     is a hand/foot/lens artefact, never a table — fall through to the fixed
     default instead of anchoring onto it. */
  const fallbackSeen = useRef(fallbackSignal);
  useEffect(() => {
    if (fallbackSignal === fallbackSeen.current) return;
    fallbackSeen.current = fallbackSignal;
    if (anchorRef.current !== null) return;
    const ctx = ctxRef.current;
    const anyBest = bestHit(centerHitsRef.current);
    if (anyBest && ctx) {
      const depth = new THREE.Vector3(
        anyBest.position.x,
        anyBest.position.y,
        anyBest.position.z,
      ).distanceTo(ctx.camera.position);
      if (depth >= MIN_FALLBACK_DEPTH_M) {
        onPlaceAtRef.current({ ...anyBest.position }, "fallback");
        return;
      }
    }
    if (!ctx) return;
    // No usable depth data: 1.5 m ahead at waist height. SLAM still
    // world-locks the anchor afterwards.
    const dir = new THREE.Vector3();
    ctx.camera.getWorldDirection(dir);
    onPlaceAtRef.current(
      {
        x: ctx.camera.position.x + dir.x * 1.5,
        y: ctx.camera.position.y - 0.6,
        z: ctx.camera.position.z + dir.z * 1.5,
      },
      "fallback",
    );
  }, [fallbackSignal]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      {/* Leader lines under the pills (pool managed imperatively). */}
      <svg ref={leaderRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" />
      {/* Hotspot markers live in the DOM (projected each frame) so they stay
          tappable and accessible above the engine canvas. */}
      <div ref={markersRef} className="pointer-events-none absolute inset-0 z-10" />
      {/* Tracking cue: shown instead of silence when SLAM degrades. The model
          itself stays frozen at its last-known-good pose — only this speaks. */}
      <div
        ref={cueRef}
        style={{ display: "none" }}
        className="pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-center px-8"
      >
        <p className="rounded-xl border border-amber-300/50 bg-black/70 px-4 py-2 text-center text-xs text-amber-100 backdrop-blur">
          Tracking lost — point back at the table where you placed the resort.
        </p>
      </div>
      {placeHint ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-10 flex justify-center px-6">
          <p className="glass-panel rounded-xl px-4 py-2 text-center text-xs text-muted-foreground">
            Still mapping the surface — sweep slowly over texture, then tap the gold ring.
          </p>
        </div>
      ) : null}
    </div>
  );
}
