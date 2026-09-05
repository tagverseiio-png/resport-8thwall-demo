import { Smartphone } from "lucide-react";

type ARInstructionsProps = {
  onContinue: () => void;
};

/** Screen 03 — tilt/move guidance shown over the live camera feed. */
export function ARInstructions({ onContinue }: ARInstructionsProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center px-8 text-center">
      <div className="animate-tilt-phone text-primary">
        <Smartphone className="size-16" strokeWidth={1.2} />
      </div>
      <h2 className="mt-8 font-display text-3xl">Move your phone slowly</h2>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
        Tilt your phone to scan your surroundings and find a suitable surface.
      </p>
      <button
        type="button"
        onClick={onContinue}
        className="glass-panel pointer-events-auto mt-9 rounded-full px-8 py-3.5 text-sm font-semibold tracking-[0.14em] uppercase"
      >
        I'm ready
      </button>
    </div>
  );
}
