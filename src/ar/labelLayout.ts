/**
 * Hotspot label de-overlap — pure math, no DOM. Tested directly with node
 * (see scripts/label-layout.test.mjs); the view only applies the result.
 *
 * Rules, in order:
 * 1. No labels at all when the anchor itself is off-screen (a floating
 *    cluster of edge-clipped pills with no visible model is worse than none).
 * 2. Dots always render (handled by the caller). Labels show for the tapped
 *    hotspot plus the N nearest-to-center ones within range.
 * 3. Pills stay inside a safe viewport margin and are spread vertically so no
 *    two pill rects overlap, then routed around fixed UI chrome (treated as
 *    static occupied rects in the same greedy pass).
 * 4. Elbow connectors ride one outside trunk: dot row across, down/up the
 *    trunk, into the pill side edge. Zero text crossings by construction.
 */

export type LabelInput = {
  id: string;
  /** Anchor (dot) position, px. */
  x: number;
  y: number;
  /** Measured pill size, px. */
  w: number;
  h: number;
  /** metres, camera → hotspot. */
  camDist: number;
  /** NDC distance from screen centre. */
  centerDist: number;
  active: boolean;
};

export type LabelPlaced = {
  id: string;
  /** Translation to apply to the pill (px). */
  dx: number;
  dy: number;
  /** Final pill centre (px). */
  labelCx: number;
  labelCy: number;
  /**
   * Elbow connector dot → trunk → pill edge, as polyline points. Null when
   * the pill sits naturally (no line needed).
   */
  line: { points: Array<{ x: number; y: number }> } | null;
};

export type ExclusionZone = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type LayoutOptions = {
  viewportW: number;
  viewportH: number;
  maxLabels?: number;
  maxDistanceM?: number;
  dotRadius?: number;
  dotGap?: number;
  minGap?: number;
  /** Safe inset from every screen edge (px). */
  margin?: number;
  /** Fixed UI chrome rects (canvas-relative px) pills must avoid. */
  excluded?: ExclusionZone[];
  /** False when the anchor itself is off-screen → no labels at all. */
  anchorVisible?: boolean;
};

const DEFAULTS = {
  maxLabels: 3,
  maxDistanceM: 6,
  dotRadius: 10,
  dotGap: 4,
  minGap: 8,
  margin: 16,
} as const;

type Working = LabelInput & { cx: number; cy: number };

function rectsOverlap(
  ax0: number,
  ay0: number,
  ax1: number,
  ay1: number,
  zone: ExclusionZone,
): boolean {
  return ax0 < zone.x1 && ax1 > zone.x0 && ay0 < zone.y1 && ay1 > zone.y0;
}

function pillRect(cx: number, cy: number, w: number, h: number) {
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
}

export function layoutLabels(items: LabelInput[], options: LayoutOptions): LabelPlaced[] {
  const {
    viewportW: W,
    viewportH: H,
    maxLabels = DEFAULTS.maxLabels,
    maxDistanceM = DEFAULTS.maxDistanceM,
    dotRadius = DEFAULTS.dotRadius,
    dotGap = DEFAULTS.dotGap,
    minGap = DEFAULTS.minGap,
    margin = DEFAULTS.margin,
    excluded = [],
    anchorVisible = true,
  } = options;

  if (!anchorVisible) return [];

  // 1 — selection: active always, then nearest-to-center within range.
  const byCenter = [...items].sort((a, b) => a.centerDist - b.centerDist);
  const picked: LabelInput[] = [];
  const active = byCenter.find((item) => item.active);
  if (active) picked.push(active);
  for (const item of byCenter) {
    if (picked.length >= maxLabels + (active ? 1 : 0)) break;
    if (item.active) continue;
    if (item.camDist > maxDistanceM) continue;
    picked.push(item);
  }

  // 2 — natural pill centres (column under the dot), clamped to safe area.
  const clampX = (x: number, w: number) =>
    Math.min(Math.max(x, w / 2 + margin), Math.max(w / 2 + margin, W - w / 2 - margin));
  const working: Working[] = picked.map((item) => ({
    ...item,
    cx: clampX(item.x, item.w),
    cy: item.y + dotRadius + dotGap + item.h / 2,
  }));

  // 3 — greedy vertical spread. `top` is the lowest allowed TOP edge (not a
  // center floor — mixing those under-spaces pills by half a height, the bug
  // this rewrite fixes). Fixed chrome acts as static blockers in the same
  // pass. Pills that overflow the bottom AND fit above their dot flip upward
  // for round 2 (e.g. dots near the bottom edge).
  working.sort((a, b) => a.cy - b.cy);
  const naturalBelow = (item: Working) => item.y + dotRadius + dotGap + item.h / 2;
  const naturalAbove = (item: Working) => item.y - dotRadius - dotGap - item.h / 2;
  const fitsAbove = (item: Working) => naturalAbove(item) - item.h / 2 >= margin;
  const flipped = new Set<string>();
  const resolveBlockers = (item: Working) => {
    for (let iter = 0; iter < 4; iter++) {
      const r = pillRect(item.cx, item.cy, item.w, item.h);
      const blocker = excluded.find(
        (zone) =>
          item.cx + item.w / 2 > zone.x0 &&
          item.cx - item.w / 2 < zone.x1 &&
          rectsOverlap(r.x0, r.y0, r.x1, r.y1, zone),
      );
      if (!blocker) return;
      // Prefer horizontal escape: preserves y (and everyone else's gaps).
      const leftCx = blocker.x0 - item.w / 2 - minGap;
      if (leftCx - item.w / 2 >= margin) {
        item.cx = leftCx;
        continue;
      }
      const rightCx = blocker.x1 + item.w / 2 + minGap;
      if (rightCx + item.w / 2 <= W - margin) {
        item.cx = rightCx;
        continue;
      }
      item.cy = blocker.y1 + item.h / 2 + minGap;
    }
  };
  for (let round = 0; round < 2; round++) {
    let top = margin;
    for (const item of working) {
      const natural = flipped.has(item.id) ? naturalAbove(item) : naturalBelow(item);
      item.cy = Math.max(natural, top + item.h / 2);
      resolveBlockers(item);
      top = item.cy + item.h / 2 + minGap;
    }
    const last = working[working.length - 1];
    const overflow = last ? last.cy + last.h / 2 - (H - margin) : 0;
    if (overflow <= 0) break;
    let flippedAny = false;
    for (const item of working) {
      if (item.cy + item.h / 2 > H - margin && !flipped.has(item.id) && fitsAbove(item)) {
        flipped.add(item.id);
        flippedAny = true;
      }
    }
    if (!flippedAny) {
      const first = working[0];
      if (first) {
        const shift = Math.min(overflow, first.cy - first.h / 2 - margin);
        if (shift > 0) {
          for (const item of working) item.cy -= shift;
        }
      }
      break;
    }
  }
  // Final sweep: the up-shift above can nudge pills back into chrome.
  for (const item of working) {
    resolveBlockers(item);
  }

  // 4 — elbow connectors on one outside trunk (see module docstring).
  const dotY =
    working.length > 0 ? working.reduce((sum, item) => sum + item.y, 0) / working.length : 0;
  const minLeft = working.reduce((m, item) => Math.min(m, item.cx - item.w / 2), Infinity);
  const maxRight = working.reduce((m, item) => Math.max(m, item.cx + item.w / 2), -Infinity);
  const trunkLeft = minLeft - margin >= W - margin - maxRight;
  const trunkX = trunkLeft ? Math.max(4, minLeft - 10) : Math.min(W - 4, maxRight + 10);
  return working.map((item) => {
    // item.cx already carries clamp + blocker resolution — never recompute
    // from item.x here, or chrome avoidance is silently discarded.
    const labelCx = item.cx;
    const dx = labelCx - item.x;
    const naturalCy = item.y + dotRadius + dotGap + item.h / 2;
    const dy = item.cy - naturalCy;
    const moved = Math.abs(dx) > 1 || Math.abs(dy) > 1;
    if (!moved) {
      return { id: item.id, dx: 0, dy: 0, labelCx, labelCy: item.cy, line: null };
    }
    const edgeX = trunkLeft ? labelCx - item.w / 2 : labelCx + item.w / 2;
    return {
      id: item.id,
      dx,
      dy,
      labelCx,
      labelCy: item.cy,
      line: {
        points: [
          { x: item.x, y: dotY },
          { x: trunkX, y: dotY },
          { x: trunkX, y: item.cy },
          { x: edgeX, y: item.cy },
        ],
      },
    };
  });
}
