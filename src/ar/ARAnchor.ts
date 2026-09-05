import type { ARAnchorData, Vec3 } from "./types";

/**
 * World-space anchor store.
 *
 * The anchor position is written ONCE at placement time and is never touched by
 * camera movement. User gestures only change `rotationY` / `scale`, which are
 * local transforms applied below the anchor — so the model can never drift or
 * follow the camera.
 */
export class ARAnchorStore {
  private anchor: ARAnchorData | null = null;
  private listeners = new Set<(anchor: ARAnchorData | null) => void>();

  get current(): ARAnchorData | null {
    return this.anchor;
  }

  create(position: Vec3, baseScale = 1, via: ARAnchorData["placedVia"] = "strict"): ARAnchorData {
    this.anchor = {
      id: `anchor-${Date.now()}`,
      position: { ...position },
      rotationY: 0,
      scale: baseScale,
      placedVia: via,
    };
    this.emit();
    return this.anchor;
  }

  /** Local-only transform update. Position stays frozen on purpose. */
  transform(patch: { rotationY?: number; scale?: number }): void {
    if (!this.anchor) return;
    this.anchor = {
      ...this.anchor,
      rotationY: patch.rotationY ?? this.anchor.rotationY,
      scale: patch.scale ?? this.anchor.scale,
    };
    this.emit();
  }

  remove(): void {
    this.anchor = null;
    this.emit();
  }

  subscribe(listener: (anchor: ARAnchorData | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((listener) => listener(this.anchor));
  }
}
