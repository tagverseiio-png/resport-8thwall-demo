import { AlertTriangle, RotateCcw } from "lucide-react";
import type { ARError } from "@/ar/types";
import { ResortMark } from "./Brand";

type ErrorScreenProps = {
  error: ARError;
  onRetry: () => void;
  onExit?: () => void;
  /** Escape hatch shown under the primary action (e.g. assisted placement). */
  secondaryAction?: { label: string; onClick: () => void } | null;
};

export function ErrorScreen({ error, onRetry, onExit, secondaryAction = null }: ErrorScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-7 text-center">
      <div className="glass-panel animate-rise-in w-full max-w-sm rounded-3xl p-7">
        <span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
          <AlertTriangle className="size-5" />
        </span>
        <h1 className="font-display text-2xl leading-snug">{error.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{error.message}</p>
        {error.detail ? (
          <p className="mt-3 rounded-xl border border-border bg-card/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {error.detail}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onRetry}
          className="gold-surface mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold tracking-wide"
        >
          <RotateCcw className="size-4" />
          {error.actionLabel}
        </button>
        {secondaryAction ? (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            className="mt-3 w-full rounded-full border border-primary/50 px-6 py-3 text-sm font-medium text-primary"
          >
            {secondaryAction.label}
          </button>
        ) : null}
        {onExit ? (
          <button
            type="button"
            onClick={onExit}
            className="mt-3 w-full rounded-full border border-border px-6 py-3 text-sm text-muted-foreground"
          >
            Back to project
          </button>
        ) : null}
      </div>
      <ResortMark className="mt-8" />
    </div>
  );
}
