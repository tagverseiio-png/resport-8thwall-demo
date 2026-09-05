import { createXRStore } from "@react-three/xr";

/**
 * The single WebXR store for the app.
 *
 * - `hitTest: "required"` — without a real hit test there is no real plane to
 *   place on, and this app falls back to the honest 3D preview rather than
 *   inventing a surface. A device that cannot hit-test rejects `requestSession`.
 * - `offerSession: false` — the session may only start from our own flow, never
 *   from the browser offering it behind our back.
 * - `emulate: false` — the default emulates a Quest on localhost, which would
 *   make a desktop dev machine report real world tracking.
 *
 * `depthSensing` is deliberately off: @pmndrs/xr requests it with an empty
 * `dataFormatPreference`, which can never match a supported format, so real
 * occlusion would silently not work while the UI implied that it did.
 *
 * - `anchors: true` — optional WebXR Anchors Module feature. Lets placement
 *   create a *native* XRAnchor from the hit-test result (the
 *   immersive-web/webxr-samples "Hit Test with Anchors" technique), so the
 *   model rides along when the tracker refines the world. Devices that do not
 *   support anchors still get a session; see `ar/xrAnchor.ts` for the fallback.
 * - `planeDetection: true` — optional WebXR Plane Detection API. Feeds the
 *   plane count into the scanner UI (`useXRPlanes`). Likewise non-blocking.
 */
export const xrStore = createXRStore({
  hitTest: "required",
  anchors: true,
  planeDetection: true,
  hand: false,
  controller: false,
  offerSession: false,
  emulate: false,
});
