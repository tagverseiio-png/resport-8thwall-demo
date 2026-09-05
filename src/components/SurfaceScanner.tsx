import { CheckCircle2, ScanSearch, Smartphone } from "lucide-react";
import type { ScanStats } from "@/ar/types";

type SurfaceScannerProps = {
  detected: boolean;
  /** Live plane-detection count. Shown as reassurance while still scanning. */
  planesDetected?: number;
  /** What the SLAM hit test actually produced — drives live guidance. */
  scanStats?: ScanStats | null;
  /** Assisted mode: any tap plants the model, no converged plane needed. */
  assisted?: boolean;
};

/** Screens 04–05 overlay: scanning prompt, then "surface detected / tap to place". */
export function SurfaceScanner({
  detected,
  planesDetected = 0,
  scanStats = null,
  assisted = false,
}: SurfaceScannerProps) {
  // Live diagnosis while scanning: tracker errors, slipped surface, texture
  // visible but no plane yet, or nothing at all.
  const scanningHint = (() => {
    if (detected) return null;
    if (assisted) {
      return "Assisted mode: tap the table or plan where you want the resort.";
    }
    if (!scanStats) return null;
    if (scanStats.hitTestErrors > 2) {
      return "The tracker is struggling — move into brighter light, then keep sweeping.";
    }
    if (scanStats.confidentHit) {
      return "Surface slipped — sweep back over it slowly to lock on again.";
    }
    if (scanStats.anyHit) {
      if (
        (scanStats.hitTestCalls > 180 && scanStats.pointsRate < 5) ||
        (scanStats.hitTestCalls > 400 && !scanStats.confidentHit)
      ) {
        return "Reflections confuse tracking — avoid glossy tile; try a rug, wood table, or newspaper.";
      }
      return "Good — texture visible. Keep sweeping slowly to lock a plane.";
    }
    if (scanStats.hitTestCalls > 90) {
      return "Still looking — point at a textured table or floor, not blank white.";
    }
    return null;
  })();
  // Confidence-gated lock meter: red = flatlined, amber = converging,
  // gold = locked. Driven by lock streak AND world-point growth rate, so a
  // tracker that sees texture but never maps anything reads red, not stuck.
  const lockProgress =
    !detected && scanStats && scanStats.lockRequired > 0
      ? Math.min(1, scanStats.lockStreak / scanStats.lockRequired)
      : 0;
  const showMeter =
    !detected && scanStats !== null && (scanStats.anyHit || scanStats.hitTestCalls > 30);
  const climbing = (scanStats?.pointsRate ?? 0) > 20;
  const flatlined =
    !detected && (scanStats?.hitTestCalls ?? 0) > 180 && (scanStats?.pointsRate ?? 0) < 5;
  const meterColor = lockProgress >= 1 ? "bg-primary" : climbing ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center px-8 pt-24 text-center">
      {detected ? (
        <>
          <span className="glass-panel flex items-center gap-2 rounded-full px-4 py-2 text-sm text-success">
            <CheckCircle2 className="size-4" />
            Surface detected
          </span>
          <h2 className="mt-5 font-display text-3xl">Tap to place</h2>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Tap the glowing ring to set the property down.
          </p>
        </>
      ) : (
        <>
          <span className="glass-panel relative flex size-16 items-center justify-center overflow-hidden rounded-2xl">
            <ScanSearch className="size-6 text-primary" />
            <span className="gold-surface animate-scan-line absolute inset-x-2 h-0.5 rounded-full opacity-70" />
          </span>
          <h2 className="mt-6 font-display text-3xl">Find a flat surface</h2>
          {/* Animated sweep guide: the exact phone motion that locks a plane. */}
          <div className="mt-4 flex h-10 w-44 items-center justify-center overflow-hidden rounded-full border border-border bg-card/60">
            <Smartphone className="animate-sweep-phone size-5 text-primary" />
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Sweep side to side, slowly, over ~50 cm.
          </p>
          {showMeter ? (
            <div className="mt-3 w-44">
              <div className="h-1.5 overflow-hidden rounded-full bg-border">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${meterColor}`}
                  style={{ width: `${Math.round(lockProgress * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[0.65rem] tracking-[0.18em] text-muted-foreground uppercase">
                {lockProgress >= 1
                  ? "Locked"
                  : flatlined
                    ? "No mapping — try another surface"
                    : climbing
                      ? `Getting there… ${scanStats?.lockStreak ?? 0}/${scanStats?.lockRequired ?? 8}`
                      : `Locking plane… ${scanStats?.lockStreak ?? 0}/${scanStats?.lockRequired ?? 8}`}
              </p>
            </div>
          ) : null}
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            {scanningHint ??
              (planesDetected > 0
                ? `${planesDetected} ${planesDetected === 1 ? "surface" : "surfaces"} mapped — keep moving slowly.`
                : "Point your camera at a table, floor or bench.")}
          </p>
        </>
      )}
    </div>
  );
}
