import { checkXR8Compatible } from "./xr8";

/**
 * What kind of AR this device can *actually* do.
 *
 * - `eighthwall` the 8th Wall engine (SLAM world tracking) runs here — every
 *                compatible mobile browser on iOS and Android, including
 *                in-app webviews. Custom UI and hotspots work.
 * - `preview`    the engine cannot run here. In-page 3D only. Never call it AR.
 */
export type ARCapability = "eighthwall" | "preview";

export async function detectARCapability(): Promise<ARCapability> {
  // The single gate for every device: the engine's own compatibility check.
  // The engine bundle loads here (cached for the session start later).
  const { compatible } = await checkXR8Compatible();
  return compatible ? "eighthwall" : "preview";
}

/** True only when the device runs the 8th Wall SLAM engine. */
export function hasWorldTracking(capability: ARCapability): boolean {
  return capability === "eighthwall";
}
