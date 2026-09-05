import { requestXRAnchor } from "@react-three/xr";
import { xrStore } from "./xrStore";

/**
 * Native WebXR anchor layer — the immersive-web/webxr-samples "Hit Test with
 * Anchors" technique.
 *
 * The app-level anchor (`ARAnchorStore`) is a frozen position captured at
 * tap time. A *native* XRAnchor additionally lets the tracker's own pose
 * refinements move the model, so it stays glued to the table as the SLAM map
 * improves. Both describe the same placement:
 *
 * - placement writes the app anchor (works everywhere, instant),
 * - then we try to also mint a native anchor from the raw hit-test result and
 *   drive the scene graph from its per-frame pose,
 * - if the device has no Anchors Module support (or minting fails), the app
 *   anchor position is used as-is — placement never fails because of this.
 */

let latestHitTestResult: XRHitTestResult | null = null;

/** Called every hit-test frame by `XRHitTestBridge`. */
export function stashHitTestResult(result: XRHitTestResult | null): void {
  latestHitTestResult = result;
}

/** Consumes the stashed result for anchor minting. Single-shot by design. */
export function takeHitTestResult(): XRHitTestResult | null {
  const result = latestHitTestResult;
  latestHitTestResult = null;
  return result;
}

type Listener = () => void;

class NativeAnchorStore {
  private anchor: XRAnchor | null = null;
  private listeners = new Set<Listener>();

  getState = (): XRAnchor | null => this.anchor;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  /** Mint a native anchor at the placement hit. Null when unsupported. */
  async createFromHitTest(result: XRHitTestResult): Promise<XRAnchor | null> {
    try {
      const anchor =
        (await requestXRAnchor(xrStore, {
          relativeTo: "hit-test-result",
          hitTestResult: result,
        })) ?? null;
      if (anchor) {
        this.delete();
        this.anchor = anchor;
        this.emit();
      }
      return anchor;
    } catch {
      // Anchors Module missing, tracking lost mid-tap, stale result, …
      // The app-level anchor already placed the model; nothing to do.
      return null;
    }
  }

  delete(): void {
    if (!this.anchor) return;
    try {
      this.anchor.delete();
    } catch {
      /* already gone with the session */
    }
    this.anchor = null;
    this.emit();
  }
}

export const nativeAnchorStore = new NativeAnchorStore();
