# Reference tech → this codebase

Single-engine rule: **8th Wall for AR on every device**, Three.js orbit
viewer as the only fallback. No WebXR/Quick Look/Scene Viewer split.

```text
Load page → QR / intro (React, no AR yet)
  → XR8.XrDevice.isDeviceBrowserCompatible()   [src/ar/xr8.ts → capabilities.ts]
     ├─ compatible → 8th Wall session (native + in-app browsers, iOS + Android)
     │    → Tilt phone, detect surface (ARInstructions + SurfaceScanner)
     │    → Tap to place → world anchor saved (ARManager.placeModel)
     │    → Resort GLB renders at anchor, walk-around AR (EighthWallView)
     │    → Hotspot overlay (React, engine-agnostic)
     │         ├─ Tap Rooms/Villa → swap to villa.glb, SAME anchor
     │         ├─ Tap Pool → swap to pool.glb, SAME anchor
     │         ├─ Map / Gallery → 2D panels
     │         └─ AR Video → HTML5 video plane in place
     │    → Book / Call / WhatsApp / Share + lead form → serverless fn
     │    → Funnel analytics: scan → place → hotspot tap → booking
     └─ not compatible → Three.js orbit viewer, no camera (ARCanvas)
```

## 1. 8th Wall engine binary (SLAM) — the only tracker

- `src/ar/xr8.ts` — loads the unmodified official bundle
  (`cdn.jsdelivr.net/npm/@8thwall/engine-binary@1`, `data-preload-chunks="slam"`)
  and exposes `checkXR8Compatible()`. No API key (not needed post-open-source).
- `src/components/scene/EighthWallView.tsx` — the documented three.js pattern
  (GlTextureRenderer + Threejs + XrController pipeline modules) with the app's
  own three.js instance (`window.THREE`). Center-screen SLAM hit test drives
  the reticle; tap does a fresh hit test at the tap point. Hotspot markers are
  DOM nodes projected from world space each frame, so all React UI
  (cards, panels, booking) works untouched above the engine canvas.
- License: binary-only XR Engine License Agreement. Compliance = unmodified
  bundle (copyright header intact) + `public/THIRD-PARTY-NOTICES.txt` + the
  in-app credit in `ProjectInfo`. Docs: https://8thwall.org/docs/open-source

## 2. Tilt / surface coaching — custom UI, not the package (deliberate)

`@8thwall/coaching-overlay` (MIT) only covers Absolute Scale and Sky Effects
prompts — not world-tracking surface scanning. `ARInstructions` (tilt phone)
+ `SurfaceScanner` (surface prompts) already do exactly what the plan's box
needs, styled to the app and wired into the flow machine. Revisit only if
8th Wall ships a world-tracking coaching package.

## 3. One session, swappable GLB scene states (plan footer rule)

- `src/models/Project.ts` (`ProjectScene`) + `HotspotData.sceneId`.
- `aurelia-resort.ts` scenes: resort (default) / villa / pool.
- `ARViewer` keeps `sceneId` state; tapping a hotspot with `sceneId` swaps the
  `useModel` URL. `placeModel` is never called on swap — the anchor, the
  session and the SLAM map are untouched. "Back to resort" (card button) and
  Exterior reset restore the default scene.
- Models (CC-BY, see `public/assets/models/*.LICENSE.txt`):
  resort = SeaSide Villa (Yogoshimo 2.0), villa = Small House (Jarlan Perez),
  pool = Above ground swimming pool (Poly by Google).

## 4. Booking → lead form → serverless function

- `src/components/LeadForm.tsx` (name/phone/interest + scene context) →
  `submitLead` server function in `src/lib/lead.ts` (zod-validated; forwards
  to `LEAD_WEBHOOK_URL` when set, else server-logged with an id).
- `ContactPanel` keeps Book-a-visit / Contact / Call / WhatsApp / Share links.

## 5. Funnel analytics (no third-party SDK)

- `src/ar/analytics.ts` — `trackEvent("scan_started" | "surface_detected" |
  "model_placed" | "hotspot_tap" | "scene_swap" | "panel_open" |
  "booking_click" | "lead_submitted")`. In-memory log + `aurelia-analytics`
  window event + optional `VITE_ANALYTICS_WEBHOOK_URL` beacon. Wired in
  `ARViewer`, `ContactPanel`, `LeadForm`.

## 6. SLAM debug mode (diagnosing "where is the surface?")

- Enable: `?ar-debug=1` or the DBG chip in the AR view (persisted).
- `XR8.XrController.configure({ enableWorldPoints: true })` streams the
  tracker's feature-point cloud; `EighthWallView` renders it as cyan points,
  every center-screen hit estimate as a colour-coded sphere (green =
  DETECTED_SURFACE, yellow = ESTIMATED, grey = FEATURE_POINT), and pushes a
  ~4 Hz snapshot (`src/ar/debug.ts`) to the `ARDebugPanel` HUD (fps, camera
  pose, hit list with distances, anchor, hit age).
- Off by default: zero extra processing, meshes or traffic in production.

## 7. Surface lock (plane grid + confident placement)

- The reticle carries a 1 m plane grid aligned to the hit-estimate rotation,
  so the detected surface is visible before you tap.
- Promotion requires consensus (`PlaneLockTracker`: same confident position
  within 2 cm across 8 consecutive frames) — single lucky frames never lock.
  The reticle/meter read grey (noise) → amber (converging) → gold (locked),
  and the meter is driven by both lock streak and world-point growth rate
  (red/flatlined → glossy-surface tip fires early, not at timeout).
- While scanning, fading gold rings drop on locked hits, visualising mapped
  plane coverage. Placement is accepted only on a locked plane — taps on raw
  feature points show a "still mapping" hint instead of planting a model that
  would swim. Hits closer than 25 cm are discarded as lens/hand artefacts.
  The tracking origin/facing passed to `updateCameraProjectionMatrix` are
  clones, never live references.
- Two escape hatches guarantee a table/plan is always placeable: assisted
  mode (any tap plants, via "Place on table anyway") and, when hit tests
  return no data at all, camera-forward fallback placement ("Place anyway"
  button while scanning — prefers the last feature-point depth, else 1.5 m
  ahead at waist height). SLAM still world-locks the anchor afterwards.
- Weak GPUs fail faster on purpose: earlier fallback button, 10 s timeout
  (vs 22 s) with one automatic assisted retry. See `docs/device-matrix.md`
  for the per-device test log.

## 8. Engine honesty (no silent crippled sessions)

- The SLAM WASM chunk is awaited explicitly (`ensureSlamChunk`) before
  `run()` — a failed download now raises ENGINE_ERROR with a connection
  message instead of a live-camera/dead-tracking session that looks like
  "surface mapping not working".
- Window errors + unhandled rejections are captured into the debug snapshot;
  the panel's Copy diagnostics button exports device, SLAM state, hits,
  anchor and errors as JSON for remote diagnosis.

## 9. Ambient motion (orbit, pulse, shimmer — all decoupled)
- Turntable: `AUTO_ORBIT_RAD_PER_SEC` (10°/s) applied to the model root every
  frame with render-loop delta time (`src/ar/motion.ts`), so 41 fps and
  60 fps devices spin identically. Starts on placement, resets per anchor.
- model-viewer pattern: any touch/tap/button/panel notifies a shared idle
  bus; orbit pauses instantly and resumes after 3 s idle. Honors
  `prefers-reduced-motion`.
- Hotspot pulse: 1.0→1.08 scale, 1.5 s cycle, per-marker phase offset (R3F),
  CSS pulse on DOM dots (XR8 view) — draws the eye without moving the model.
- Water shimmer: blue-dominant materials get an independent emissive-breathing
  loop (own phase/frequency); unknown rigs are deliberately left alone rather
  than guessed at. Materials restore on model swap/unmount (GLB cache).

## 10. Placement hardening (distance clamp, fixed scale, declutter)
- Fallback anchor floor (`MIN_FALLBACK_DEPTH_M = 0.8`): a center estimate
  nearer than this is near-field clutter, never a table — the fallback falls
  through to the fixed 1.5 m / waist-height default instead. (Direct taps keep
  the 0.25 m lens-artefact filter; explicit user aim.)
- Scale is fixed once at load, not per frame: `ARModelLoader` fits every GLB
  (`Box3.setFromObject` → longest dimension = `project.realWorldSize`,
  1.2 m) for resort/villa/pool alike, so pan-up retests hold size.
- Label declutter: dots always render; text pills show only for the 3
  nearest-to-screen-center hotspots within 6 m (tapped one always).
  Fixes the stacked-text screenshots.

## 11. Anchor stability (drift/disappear guard)
- Architectural fact: the app anchor is an immutable Vec3 written once at
  placement (`ARAnchorStore` — position never touched afterwards). Nothing in
  app code can drag it with the camera. Post-placement motion on screen can
  only come from the SLAM world frame jumping (relocalization) or garbage
  camera poses — both are now detected, not guessed at.
- `placedVia` (`strict | assisted | fallback | preview`) is recorded on the
  anchor. Assisted/fallback placements get a 2.5 s re-verification window: a
  confident hit within 20 cm while the phone holds still upgrades them to
  confirmed; a miss keeps the original placement and flags it unconfirmed.
- Health monitor (every frame, ~2 Hz sampling): camera NaN check, per-frame
  teleport detection (>0.75 m in one frame), hit recency. Tracking state
  `ok | degraded | lost` feeds the HUD; on `lost`, hotspot markers freeze
  (hidden) and a "Tracking lost — point back at the table" cue appears. The
  3D model is never moved — it stays at last-known-good by construction.
- Anchor lifecycle ring buffer (`created … via=… @ …` / `removed …`) in the
  debug snapshot proves whether the anchor ever nulled mid-session.
- Tracking transitions (`unknown → ok → degraded → lost`) are logged into the
  same ring buffer, so "was it lost at that moment?" is answerable after the
  fact from Copy diagnostics.
- Labels deconflict with tested geometry (`src/ar/labelLayout.ts`, proven by
  `scripts/label-layout.test.mjs`): nearest-to-center selection, 16px safe
  margins, vertical spread with 8px gaps, elbow leader lines routed outside
  every pill rect so they cannot cross text. Fixed UI chrome (header, zoom,
  rotate, nav, DBG) acts as static blockers; labels route around it. Anchor
  off-screen hides all labels rather than edge-clustering them. Live
  `labelsShown` + `labelOverlapPx` in the HUD prove it on device.
- Keyed scene rebuilds: the holder only rebuilds when anchor id, GLB scene
  object, placeholder state, or project actually changes. A model that is
  still loading never clears the old one — labels can never render without
  their model, and the label layer additionally requires rendered content
  (`contentReady`) plus good tracking.
