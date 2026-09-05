/** Screen-space confirmation shown right after the anchor is created. */
export function PlacementIndicator({ label = "Model placed" }: { label?: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 z-20 flex justify-center">
      <span className="glass-panel animate-rise-in rounded-full px-5 py-2.5 text-sm tracking-wide text-success">
        {label}
      </span>
    </div>
  );
}
