import * as THREE from "three";

/**
 * Shared ambient-motion rules for both renderers (XR8 vanilla scene and the
 * R3F preview): a slow turntable orbit that never fights the user, plus an
 * independent water shimmer. Orbit and shimmer run on separate clocks/phases
 * so they never compound — pausing one never pauses the other.
 */

/** Gentle presentation spin: 10°/s → one full turn every 36 s. */
export const AUTO_ORBIT_RAD_PER_SEC = (10 * Math.PI) / 180;

/** model-viewer pattern: resume auto-orbit after this long without input. */
export const AUTO_ORBIT_IDLE_MS = 3000;

let lastInteractionAt = 0;

/** Call from every user gesture (touch, tap, buttons, panels). */
export function notifyUserInteraction(): void {
  lastInteractionAt = Date.now();
}

export function isInteractionIdle(idleMs = AUTO_ORBIT_IDLE_MS): boolean {
  return Date.now() - lastInteractionAt >= idleMs;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type WaterEntry = {
  mat: THREE.MeshStandardMaterial;
  baseEmissive: THREE.Color;
  baseIntensity: number;
  phase: number;
};

const WATER_TINT = new THREE.Color("#37d3e8");
const scratch = { h: 0, s: 0, l: 0 };

function isWaterColor(color: THREE.Color): boolean {
  color.getHSL(scratch);
  if (scratch.h < 0.45 || scratch.h > 0.7 || scratch.s < 0.2) return false;
  // Blue-dominant in linear space (catches pools/sea, skips sand/stone).
  return color.b > color.r && color.b > color.g;
}

/**
 * Collects water-like materials under root for the shimmer loop. Conservative
 * on purpose: unknown rigs (palm sway etc.) are left alone rather than
 * guessed at — a wrong guess would visibly corrupt the model.
 */
export function collectWaterMaterials(root: THREE.Object3D): WaterEntry[] {
  const entries: WaterEntry[] = [];
  const seen = new Set<THREE.Material>();
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      const std = material as THREE.MeshStandardMaterial;
      if (!std.isMeshStandardMaterial || seen.has(std)) continue;
      seen.add(std);
      if (!isWaterColor(std.color)) continue;
      entries.push({
        mat: std,
        baseEmissive: std.emissive.clone(),
        baseIntensity: std.emissiveIntensity,
        phase: entries.length * 0.9,
      });
    }
  });
  return entries;
}

/** Subtle emissive breathing, decoupled from the orbit clock. */
export function updateWaterShimmer(entries: WaterEntry[], elapsedSec: number): void {
  for (const entry of entries) {
    const k = 0.5 + 0.5 * Math.sin(elapsedSec * 1.4 + entry.phase);
    entry.mat.emissive.copy(entry.baseEmissive).lerp(WATER_TINT, 0.05 + 0.25 * k);
    entry.mat.emissiveIntensity = entry.baseIntensity;
  }
}

export function restoreWaterMaterials(entries: WaterEntry[]): void {
  for (const entry of entries) {
    entry.mat.emissive.copy(entry.baseEmissive);
    entry.mat.emissiveIntensity = entry.baseIntensity;
  }
}
