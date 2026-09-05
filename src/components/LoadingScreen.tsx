type LoadingScreenProps = {
  title: string;
  subtitle?: string;
  /** 0..1, or undefined for an indeterminate shimmer. */
  progress?: number;
  variant?: "full" | "overlay";
};

export function LoadingScreen({ title, subtitle, progress, variant = "full" }: LoadingScreenProps) {
  const pct =
    progress === undefined ? undefined : Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <div
      className={
        variant === "full"
          ? "fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-8"
          : "pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center px-6 pb-10"
      }
    >
      <div
        className={
          variant === "overlay"
            ? "glass-panel w-full max-w-sm rounded-2xl p-5"
            : "w-full max-w-sm text-center"
        }
      >
        <p className="font-display text-xl">{title}</p>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="gold-surface h-full rounded-full transition-[width] duration-300"
            style={{ width: pct === undefined ? "40%" : `${pct}%` }}
          />
        </div>
        {pct !== undefined ? (
          <p className="mt-2 text-xs tracking-widest text-muted-foreground uppercase">{pct}%</p>
        ) : null}
      </div>
    </div>
  );
}
