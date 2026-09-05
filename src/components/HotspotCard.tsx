import { ArrowUpRight, RotateCcw, X } from "lucide-react";
import { HOTSPOT_TYPE_LABEL, type HotspotData } from "@/models/Hotspot";

type HotspotCardProps = {
  hotspot: HotspotData;
  /** Rendered scene state label when a hotspot swapped the GLB. */
  sceneLabel?: string | null;
  /** Back to the default resort scene (anchor untouched). Null when N/A. */
  onBackToResort?: (() => void) | null;
  onClose: () => void;
};

export function HotspotCard({ hotspot, sceneLabel, onBackToResort, onClose }: HotspotCardProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-4">
      <article className="glass-panel animate-rise-in pointer-events-auto w-full max-w-sm rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[0.62rem] tracking-[0.2em] text-primary uppercase">
              {hotspot.label}
              {hotspot.type ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground normal-case">
                  {HOTSPOT_TYPE_LABEL[hotspot.type]}
                </span>
              ) : null}
            </p>
            <h3 className="mt-1 font-display text-xl">{hotspot.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close hotspot"
            className="rounded-full border border-border p-1.5 text-muted-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{hotspot.description}</p>
        {sceneLabel ? (
          <p className="mt-2 text-xs text-primary">
            Now viewing: {sceneLabel} — same spot, same anchor.
          </p>
        ) : null}
        {onBackToResort ? (
          <button
            type="button"
            onClick={onBackToResort}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground"
          >
            <RotateCcw className="size-3.5" />
            Back to resort
          </button>
        ) : null}
        {hotspot.moreUrl ? (
          <a
            href={hotspot.moreUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary"
          >
            View more
            <ArrowUpRight className="size-3.5" />
          </a>
        ) : null}
      </article>
    </div>
  );
}
