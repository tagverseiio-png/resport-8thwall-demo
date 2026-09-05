import type { CameraPermissionState } from "@/ar/types";

export async function queryCameraPermission(): Promise<CameraPermissionState> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "unavailable";
  }
  try {
    const status = await navigator.permissions?.query({
      name: "camera" as PermissionName,
    });
    if (status?.state === "granted") return "granted";
    if (status?.state === "denied") return "denied";
    return "prompt";
  } catch {
    return "prompt";
  }
}

/** Some mobile browsers only expose device orientation after an explicit grant. */
export async function requestOrientationPermission(): Promise<boolean> {
  const anyDeviceOrientation = (
    globalThis as unknown as {
      DeviceOrientationEvent?: { requestPermission?: () => Promise<"granted" | "denied"> };
    }
  ).DeviceOrientationEvent;
  if (!anyDeviceOrientation?.requestPermission) return true;
  try {
    return (await anyDeviceOrientation.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function isSecureAREnvironment(): boolean {
  if (typeof window === "undefined") return true;
  return window.isSecureContext || window.location.hostname === "localhost";
}
