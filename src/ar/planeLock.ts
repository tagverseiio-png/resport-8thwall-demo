/**
 * Plane-lock consensus: never trust a plane the first frame it appears.
 *
 * SLAM hit estimates jitter — especially feature-point-sourced ones on tricky
 * surfaces. This tracker requires the confident hit position to stay within
 * `epsilon` metres for `required` consecutive frames before reporting locked.
 * A swimming/jumping estimate keeps resetting the streak, so only a truly
 * stable plane promotes the flow to SURFACE_DETECTED. Pure signal processing,
 * no ML: the engine remains the only tracker.
 */
export type LockSample = { x: number; y: number; z: number };

export class PlaneLockTracker {
  private streak = 0;
  private anchor: LockSample | null = null;

  constructor(
    private readonly required = 8,
    private readonly epsilon = 0.02,
  ) {}

  get streakCount(): number {
    return this.streak;
  }

  get requiredCount(): number {
    return this.required;
  }

  /** 0..1 progress toward lock (for the confidence meter). */
  get progress(): number {
    return Math.min(1, this.streak / this.required);
  }

  reset(): void {
    this.streak = 0;
    this.anchor = null;
  }

  /**
   * Feed one frame's best hit. Returns true once lock is achieved, and keeps
   * returning true while subsequent confident hits stay within epsilon.
   * Any null/unconfident sample or jump restarts the streak.
   */
  push(sample: LockSample | null, confident: boolean): boolean {
    if (!sample || !confident) {
      this.reset();
      return false;
    }
    if (!this.anchor) {
      this.anchor = { ...sample };
      this.streak = 1;
      return this.streak >= this.required;
    }
    const moved = Math.hypot(
      sample.x - this.anchor.x,
      sample.y - this.anchor.y,
      sample.z - this.anchor.z,
    );
    if (moved <= this.epsilon) {
      this.streak += 1;
      return this.streak >= this.required;
    }
    this.anchor = { ...sample };
    this.streak = 1;
    return this.streak >= this.required;
  }
}
