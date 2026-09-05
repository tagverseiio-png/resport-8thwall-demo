/**
 * Device-orientation world tracking used by the DEMO provider.
 *
 * This gives real rotational tracking (3DoF) from the gyroscope. It cannot give
 * translation — that requires WebXR or 8th Wall SLAM. The important invariant
 * still holds: the camera moves, the anchored model never does.
 */
export type OrientationSample = {
  alpha: number;
  beta: number;
  gamma: number;
  /** Rough motion energy, used by the demo surface detector. */
  energy: number;
};

type Listener = (sample: OrientationSample) => void;

export class ARTracking {
  private listeners = new Set<Listener>();
  private last: OrientationSample = { alpha: 0, beta: 0, gamma: 0, energy: 0 };
  private running = false;
  private received = false;
  private handler = (event: DeviceOrientationEvent) => {
    // Some browsers/emulators emit empty events; those are not real tracking data.
    if (event.alpha === null && event.beta === null && event.gamma === null) return;
    const alpha = event.alpha ?? 0;
    const beta = event.beta ?? 0;
    const gamma = event.gamma ?? 0;
    const delta =
      Math.abs(alpha - this.last.alpha) +
      Math.abs(beta - this.last.beta) +
      Math.abs(gamma - this.last.gamma);
    const energy = this.last.energy * 0.9 + Math.min(delta, 20) * 0.1;
    this.received = true;
    this.last = { alpha, beta, gamma, energy };
    this.listeners.forEach((listener) => listener(this.last));
  };

  get sample(): OrientationSample {
    return this.last;
  }

  /** True once real gyroscope data has arrived (false on desktop). */
  get hasData(): boolean {
    return this.received;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running || typeof window === "undefined") return;
    window.addEventListener("deviceorientation", this.handler, true);
    this.running = true;
  }

  stop(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("deviceorientation", this.handler, true);
    }
    this.running = false;
    this.received = false;
    this.listeners.clear();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
