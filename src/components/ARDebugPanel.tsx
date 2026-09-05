import { useState, useSyncExternalStore } from "react";
import { Check, Copy, X } from "lucide-react";
import { getDebugSnapshot, subscribeDebugSnapshot } from "@/ar/debug";

type ARDebugPanelProps = {
  onClose: () => void;
};

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "—");

/**
 * SLAM debug HUD: what the tracker sees right now. Read it like this:
 * - world points 0 while scanning → move the phone slowly over texture;
 *   blank walls/floors give SLAM nothing to hold onto.
 * - hits empty → no surface estimated at screen center; green DETECTED_SURFACE
 *   is what the gold reticle (and tap-to-place) uses.
 * - anchor set + camera moving = walk-around should hold the model in place.
 */
export function ARDebugPanel({ onClose }: ARDebugPanelProps) {
  const snapshot = useSyncExternalStore(subscribeDebugSnapshot, getDebugSnapshot, getDebugSnapshot);
  const [copied, setCopied] = useState(false);

  const copyDiagnostics = async () => {
    const payload = {
      at: new Date().toISOString(),
      url: typeof window !== "undefined" ? window.location.href : "",
      device: snapshot.device,
      slamReady: snapshot.slamReady,
      fps: snapshot.fps,
      camera: snapshot.camera,
      anchor: snapshot.anchor,
      worldPoints: snapshot.worldPoints,
      hits: snapshot.hits,
      rotation: snapshot.rotation,
      lastTap: snapshot.lastTap,
      lastHitAgeMs: snapshot.lastHitAgeMs,
      scanCalls: snapshot.scanCalls,
      scanErrors: snapshot.scanErrors,
      scanLastError: snapshot.scanLastError,
      runtimeErrors: snapshot.runtimeErrors,
    };
    try {
      await navigator.clipboard?.writeText(JSON.stringify(payload, null, 1));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — nothing to fall back to in-session */
    }
  };

  return (
    <div className="pointer-events-auto absolute top-16 left-3 z-30 w-60 rounded-2xl border border-cyan-400/40 bg-black/75 p-3 font-mono text-[10px] leading-relaxed text-cyan-100 backdrop-blur">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[0.6rem] tracking-[0.2em] text-cyan-300 uppercase">SLAM debug</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close debug panel"
          className="rounded-full border border-cyan-400/40 p-1 text-cyan-200"
        >
          <X className="size-3" />
        </button>
      </div>
      <dl className="space-y-0.5">
        <div className="flex justify-between gap-2">
          <dt className="text-cyan-400/70">slam chunk</dt>
          <dd>
            {snapshot.slamReady === null ? (
              "…"
            ) : snapshot.slamReady ? (
              <span className="text-green-300">ready</span>
            ) : (
              <span className="text-red-300">FAILED</span>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-cyan-400/70">fps</dt>
          <dd>{snapshot.fps || "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-cyan-400/70">world points</dt>
          <dd>{snapshot.worldPoints}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-cyan-400/70">camera</dt>
          <dd>
            {snapshot.camera
              ? `${fmt(snapshot.camera.x)}, ${fmt(snapshot.camera.y)}, ${fmt(snapshot.camera.z)}`
              : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-cyan-400/70">anchor</dt>
          <dd>
            {snapshot.anchor
              ? `${fmt(snapshot.anchor.x)}, ${fmt(snapshot.anchor.y)}, ${fmt(snapshot.anchor.z)}`
              : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-cyan-400/70">last hit</dt>
          <dd>{snapshot.lastHitAgeMs === null ? "never" : `${snapshot.lastHitAgeMs}ms ago`}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-cyan-400/70">surface rot</dt>
          <dd>
            {snapshot.rotation
              ? `${fmt(snapshot.rotation.x)},${fmt(snapshot.rotation.y)},${fmt(snapshot.rotation.z)},${fmt(snapshot.rotation.w)}`
              : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-cyan-400/70">last tap</dt>
          <dd>
            {snapshot.lastTap
              ? `${snapshot.lastTap.type} @ ${fmt(snapshot.lastTap.position.x)},${fmt(snapshot.lastTap.position.y)},${fmt(snapshot.lastTap.position.z)}`
              : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-cyan-400/70">hit tests</dt>
          <dd>
            {snapshot.scanCalls} calls / {snapshot.scanErrors} err
          </dd>
        </div>
        {snapshot.scanLastError ? (
          <div className="flex justify-between gap-2">
            <dt className="text-cyan-400/70">hit error</dt>
            <dd className="text-right text-red-300">{snapshot.scanLastError.slice(0, 60)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <dt className="text-cyan-400/70">tracking</dt>
          <dd
            className={
              snapshot.tracking === "ok"
                ? "text-green-300"
                : snapshot.tracking === "lost"
                  ? "text-red-300"
                  : snapshot.tracking === "degraded"
                    ? "text-yellow-300"
                    : "text-cyan-400/50"
            }
          >
            {snapshot.tracking}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-cyan-400/70">placement</dt>
          <dd>
            {snapshot.placement
              ? `${snapshot.placement.via} · ${snapshot.placement.verified === null ? "verifying…" : snapshot.placement.verified ? "confirmed" : "unconfirmed (kept)"}`
              : "—"}
          </dd>
        </div>
        {snapshot.anchorEvents.length > 0 ? (
          <div className="mt-1 border-t border-cyan-400/20 pt-1">
            <dt className="text-cyan-400/70">anchor lifecycle</dt>
            <ul className="mt-0.5 max-h-20 space-y-0.5 overflow-y-auto text-cyan-100/90">
              {snapshot.anchorEvents.map((event, i) => (
                <li key={`${i}-${event.slice(0, 20)}`}>• {event}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <dt className="text-cyan-400/70">labels</dt>
          <dd>
            {snapshot.labelsShown} shown / overlap {snapshot.labelOverlapPx.toFixed(1)}px
          </dd>
        </div>
        {snapshot.runtimeErrors.length > 0 ? (
          <div className="mt-1 border-t border-red-400/20 pt-1">
            <dt className="text-red-300/80">runtime errors</dt>
            <ul className="mt-0.5 max-h-20 space-y-0.5 overflow-y-auto text-red-200/90">
              {snapshot.runtimeErrors.map((message, i) => (
                <li key={`${i}-${message.slice(0, 24)}`}>• {message.slice(0, 90)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </dl>
      <p className="mt-1.5 border-t border-cyan-400/20 pt-1.5 text-cyan-400/70">
        center hits ({snapshot.hits.length})
      </p>
      {snapshot.hits.length === 0 ? (
        <p className="text-cyan-400/50">none — point at a textured surface</p>
      ) : (
        <ul className="max-h-28 space-y-0.5 overflow-y-auto">
          {snapshot.hits.map((hit, i) => (
            <li key={`${hit.type}-${i}`} className="flex justify-between gap-2">
              <span
                className={
                  hit.type === "DETECTED_SURFACE"
                    ? "text-green-300"
                    : hit.type === "ESTIMATED_SURFACE"
                      ? "text-yellow-300"
                      : "text-slate-400"
                }
              >
                {hit.type}
              </span>
              <span>
                {fmt(hit.position.x)},{fmt(hit.position.y)},{fmt(hit.position.z)} ·{" "}
                {fmt(hit.distance)}m
              </span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={copyDiagnostics}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-cyan-400/40 px-3 py-1.5 text-[10px] tracking-widest text-cyan-200 uppercase"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? "Copied" : "Copy diagnostics"}
      </button>
      {snapshot.device ? (
        <p className="mt-1.5 break-all text-cyan-400/40">{snapshot.device.slice(0, 100)}</p>
      ) : null}
      {snapshot.view ? (
        <div className="mt-1.5 border-t border-cyan-400/20 pt-1.5">
          <p className="text-cyan-400/70">view geometry</p>
          <p>
            css {snapshot.view.cssW}×{snapshot.view.cssH} · buf {snapshot.view.bufW}×
            {snapshot.view.bufH}
          </p>
          <p>
            inner {snapshot.view.innerW}×{snapshot.view.innerH} · vv {snapshot.view.vvW}×
            {snapshot.view.vvH}@{snapshot.view.vvScale} · dpr {snapshot.view.dpr}
          </p>
          <p>
            cam {snapshot.view.camAspect.toFixed(3)} fov{snapshot.view.camFov} · ren{" "}
            {snapshot.view.renW}×{snapshot.view.renH}@{snapshot.view.renPr}
          </p>
        </div>
      ) : null}
    </div>
  );
}
