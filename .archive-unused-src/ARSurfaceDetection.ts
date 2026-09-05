import type { Vec3 } from "./types";
import type { ARTracking } from "./ARTracking";

export type SurfaceHit = {
  /** World-space point the reticle sits on. */
  position: Vec3;
  /** True once the detector is confident about a horizontal plane. */
  confident: boolean;
};

type Listener = (hit: SurfaceHit | null) => void;

/**
 * DEMO surface detection.
 *
 * It does NOT do computer vision. It requires the user to actually tilt the
 * phone downwards (real gyroscope data) and to keep scanning for a moment, then
 * proposes a horizontal plane at a plausible distance in front of the device.
 * The real plane detection lives in the WebXR / 8th Wall providers.
 */
export class ARSurfaceDetection {
  private listeners = new Set<Listener>();
  private raf = 0;
  private startedAt = 0;
  private confidence = 0;
  private lastTick = 0;
  private lastEmittedConfident: boolean | undefined;
  private lastEmitAt = 0;
  private unsubscribe?: () => void;
  private tracking: ARTracking | undefined;

  start(tracking?: ARTracking): void {
    // Cancel any previous RAF loop — otherwise every retry leaks another
    // 60fps emitter that patches React state forever (log/render loop).
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.tracking = tracking;
    this.startedAt = performance.now();
    this.lastTick = performance.now();
    this.confidence = 0;
    this.lastEmittedConfident = undefined;
    this.lastEmitAt = 0;
    const tick = () => {
      const elapsed = (performance.now() - this.startedAt) / 1000;
      const sample = this.tracking?.sample;
      // Looking down at a table/floor => beta between 20 and 80 degrees.
      const tiltedDown = sample ? sample.beta > 15 && sample.beta < 85 : true;
      const scanned = elapsed > 1.2;
      // Time-based so slow devices are not penalised.
      const gain = (tiltedDown && scanned ? 0.6 : 0.12) * Math.min(0.1, (performance.now() - this.lastTick) / 1000);
      this.lastTick = performance.now();
      this.confidence = Math.min(1, this.confidence + gain);
      const distance = 1.4;
      const confident = this.confidence > 0.6;
      // Throttle: position is static, so only notify when confidence flips
      // or every 250ms as a heartbeat — not 60x/sec.
      const now = performance.now();
      if (confident !== this.lastEmittedConfident || now - this.lastEmitAt > 250) {
        this.lastEmittedConfident = confident;
        this.lastEmitAt = now;
        const hit: SurfaceHit = {
          position: { x: 0, y: -0.65, z: -distance },
          confident,
        };
        this.emit(hit);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.unsubscribe?.();
    this.listeners.clear();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(hit: SurfaceHit | null) {
    this.listeners.forEach((listener) => listener(hit));
  }
}
