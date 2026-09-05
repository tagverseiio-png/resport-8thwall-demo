export function ResortMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-[0.7rem] tracking-[0.28em] text-muted-foreground uppercase ${className}`}
    >
      <span aria-hidden className="gold-surface inline-block size-1.5 rotate-45 rounded-[1px]" />
      Aurelia
      <span className="rounded-full border border-border px-1.5 py-px text-[0.55rem] tracking-[0.2em]">
        Demo
      </span>
    </span>
  );
}
