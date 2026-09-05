import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GalleryItem } from "@/models/Project";

export function Gallery({ items }: { items: GalleryItem[] }) {
  const [index, setIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const item = items[index];
  if (!item) return null;

  const step = (delta: number) => setIndex((prev) => (prev + delta + items.length) % items.length);

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-2xl border border-border bg-card"
        onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)}
        onTouchEnd={(event) => {
          if (touchStart === null) return;
          const end = event.changedTouches[0];
          if (!end) return;
          const delta = end.clientX - touchStart;
          if (Math.abs(delta) > 40) step(delta < 0 ? 1 : -1);
          setTouchStart(null);
        }}
      >
        <img
          src={item.src}
          alt={item.title}
          loading="lazy"
          width={1280}
          height={853}
          className="aspect-[4/3] w-full object-cover"
        />
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous image"
          className="glass-panel absolute top-1/2 left-2 -translate-y-1/2 rounded-full p-2"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next image"
          className="glass-panel absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-2"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-base font-medium">{item.title}</p>
          {item.caption ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{item.caption}</p>
          ) : null}
        </div>
        <p className="shrink-0 text-xs tracking-widest text-muted-foreground">
          {index + 1}/{items.length}
        </p>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto">
        {items.map((thumb, thumbIndex) => (
          <button
            key={thumb.id}
            type="button"
            onClick={() => setIndex(thumbIndex)}
            aria-label={`Show ${thumb.title}`}
            className={`size-16 shrink-0 overflow-hidden rounded-xl border ${
              thumbIndex === index ? "border-primary" : "border-border opacity-60"
            }`}
          >
            <img
              src={thumb.src}
              alt=""
              loading="lazy"
              width={1280}
              height={853}
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
