// Unit test for src/ar/labelLayout.ts — run with: node scripts/label-layout.test.mjs
// Fails loudly (non-zero exit) on any overlap or line-through-text.
import { layoutLabels } from "../src/ar/labelLayout.ts";

let failures = 0;
const check = (name, cond, extra = "") => {
  if (!cond) {
    failures += 1;
    console.error(`FAIL: ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    console.log(`ok: ${name}`);
  }
};

const rectOf = (p, byId) => {
  const src = byId.get(p.id);
  return {
    x0: p.labelCx - src.w / 2,
    x1: p.labelCx + src.w / 2,
    y0: p.labelCy - src.h / 2,
    y1: p.labelCy + src.h / 2,
  };
};

// Segment (x1,y1)-(x2,y2) strictly through rect interior (touching edge = ok).
const segCrossesRect = (x1, y1, x2, y2, r) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0.05;
  let tmax = 0.95;
  if (Math.abs(dx) < 1e-9) {
    if (x1 <= r.x0 || x1 >= r.x1) return false;
  } else {
    let t1 = (r.x0 - x1) / dx;
    let t2 = (r.x1 - x1) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y1 <= r.y0 || y1 >= r.y1) return false;
  } else {
    let t1 = (r.y0 - y1) / dy;
    let t2 = (r.y1 - y1) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
};

// Elbow polyline vs every non-own pill.
const elbowCrossings = (out, byId) => {
  let crossings = 0;
  for (const p of out) {
    if (!p.line) continue;
    const pts = p.line.points;
    for (let s = 0; s + 1 < pts.length; s++) {
      for (const q of out) {
        if (q.id === p.id) continue;
        if (segCrossesRect(pts[s].x, pts[s].y, pts[s + 1].x, pts[s + 1].y, rectOf(q, byId))) {
          crossings += 1;
        }
      }
    }
  }
  return crossings;
};

const W = 390;
const H = 700;
const mk = (id, x, y, opts = {}) => ({
  id,
  x,
  y,
  w: 120,
  h: 24,
  camDist: 2,
  centerDist: Math.hypot(x - W / 2, y - H / 2) / 500,
  active: false,
  ...opts,
});

// Case 1: the reported failure — 5 hotspots stacked on one screen point.
{
  const items = [
    mk("a", 200, 300),
    mk("b", 205, 305),
    mk("c", 195, 298),
    mk("d", 202, 302),
    mk("e", 198, 301),
  ];
  const out = layoutLabels(items, { viewportW: W, viewportH: H });
  const byId = new Map(items.map((i) => [i.id, i]));
  check("cluster: max 3 labels", out.length === 3, `got ${out.length}`);
  const rects = out.map((p) => rectOf(p, byId));
  let minGap = Infinity;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const A = rects[i];
      const B = rects[j];
      const overlapX = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
      const overlapY = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
      if (overlapX > 0 && overlapY > 0) minGap = Math.min(minGap, -Math.min(overlapX, overlapY));
      else minGap = Math.min(minGap, overlapX > 0 ? -overlapY : overlapY > 0 ? -overlapX : 0);
    }
  }
  check("cluster: no pill overlap (≥8px gaps)", minGap >= 7.9, `minGap=${minGap.toFixed(1)}`);
  const crossings = elbowCrossings(out, byId);
  check("cluster: no leader line crosses another pill", crossings === 0, `${crossings} crossings`);
  const inside = out.every(
    (p) => p.labelCx - 60 >= 0 && p.labelCx + 60 <= W && p.labelCy - 12 >= 0 && p.labelCy + 12 <= H,
  );
  check("cluster: pills inside viewport", inside);
}

// Case 2: active hotspot far from center is still shown.
{
  const items = [mk("near", 200, 350), mk("far", 30, 60, { active: true, centerDist: 5 })];
  const out = layoutLabels(items, { viewportW: W, viewportH: H });
  check(
    "active always shown",
    out.some((p) => p.id === "far"),
  );
}

// Case 3: out-of-range hotspots excluded.
{
  const items = [mk("near", 200, 350), mk("far", 200, 360, { camDist: 30 })];
  const out = layoutLabels(items, { viewportW: W, viewportH: H });
  check("out-of-range excluded", out.length === 1 && out[0].id === "near");
}

// Case 4: already-separated labels are untouched (no lines).
{
  const items = [mk("a", 100, 200), mk("b", 300, 500)];
  const out = layoutLabels(items, { viewportW: W, viewportH: H });
  check(
    "separated: no offsets, no lines",
    out.every((p) => Math.abs(p.dx) < 1 && Math.abs(p.dy) < 1 && p.line === null),
  );
}

// Case 5: vertical stack shares one outside trunk (no zigzag columns).
{
  const items = [mk("a", 200, 300), mk("b", 200, 305), mk("c", 200, 310)];
  const out = layoutLabels(items, { viewportW: W, viewportH: H });
  const byId = new Map(items.map((i) => [i.id, i]));
  const crossings = elbowCrossings(out, byId);
  check("stack: trunk elbows, zero crossings", crossings === 0, `${crossings} crossings`);
  const trunkXs = new Set();
  for (const p of out) {
    if (p.line) trunkXs.add(Math.round(p.line.points[1].x));
  }
  check("stack: single shared trunk", trunkXs.size === 1, `trunks=${[...trunkXs]}`);
}

// Case 6: fixed UI chrome is treated as blockers (right-edge controls).
{
  const items = [mk("a", 340, 400), mk("b", 345, 410), mk("c", 335, 420)];
  const zone = { x0: 330, y0: 380, x1: 390, y1: 660 }; // zoom/rotate column
  const out = layoutLabels(items, { viewportW: W, viewportH: H, excluded: [zone] });
  const byId = new Map(items.map((i) => [i.id, i]));
  let hitsZone = 0;
  for (const p of out) {
    const src = byId.get(p.id);
    const r = {
      x0: p.labelCx - src.w / 2,
      x1: p.labelCx + src.w / 2,
      y0: p.labelCy - src.h / 2,
      y1: p.labelCy + src.h / 2,
    };
    if (r.x0 < zone.x1 && r.x1 > zone.x0 && r.y0 < zone.y1 && r.y1 > zone.y0) hitsZone += 1;
  }
  check("zones: no pill overlaps fixed chrome", hitsZone === 0, `${hitsZone} pills in zone`);
  const crossings = elbowCrossings(out, byId);
  check("zones: elbows still crossing-free", crossings === 0, `${crossings} crossings`);
}

// Case 7: 16px safe margins on every edge.
{
  const items = [mk("edge", 5, 5), mk("corner", 385, 695)];
  const out = layoutLabels(items, { viewportW: W, viewportH: H });
  const byId = new Map(items.map((i) => [i.id, i]));
  const ok = out.every((p) => {
    const src = byId.get(p.id);
    return (
      p.labelCx - src.w / 2 >= 16 - 0.5 &&
      p.labelCx + src.w / 2 <= W - 16 + 0.5 &&
      p.labelCy - src.h / 2 >= 16 - 0.5 &&
      p.labelCy + src.h / 2 <= H - 16 + 0.5
    );
  });
  check("margins: 16px safe inset on all edges", ok);
}

// Case 8: anchor off-screen → no labels at all (dots stay, layer owner's call).
{
  const items = [mk("a", 200, 300), mk("b", 210, 310)];
  const out = layoutLabels(items, { viewportW: W, viewportH: H, anchorVisible: false });
  check("offscreen anchor: zero labels", out.length === 0, `got ${out.length}`);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("\nall label-layout tests pass");
}
