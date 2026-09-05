export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  return /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua) || touch;
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

export function hasCameraApi(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export async function supportsWebXRAR(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr?.isSessionSupported) return false;
  try {
    return await xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

/** Very rough device tier used to scale render quality. */
export function devicePerformanceTier(): "low" | "medium" | "high" {
  if (typeof navigator === "undefined") return "medium";
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (cores <= 4 || memory <= 2) return "low";
  if (cores >= 8) return "high";
  return "medium";
}

export function maxPixelRatio(): number {
  const tier = devicePerformanceTier();
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const cap = tier === "low" ? 1 : tier === "medium" ? 1.5 : 2;
  return Math.min(dpr, cap);
}
