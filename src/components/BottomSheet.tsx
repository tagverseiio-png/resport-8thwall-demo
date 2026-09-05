import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

type BottomSheetProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Overlay panel used for floor plans, amenities, gallery, info and contact.
 * It never unmounts the AR canvas, so the session and anchor survive.
 */
export function BottomSheet({ open, title, subtitle, onClose, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-overlay"
      />
      <section
        role="dialog"
        aria-label={title}
        className="glass-panel animate-rise-in relative max-h-[82vh] overflow-y-auto rounded-t-3xl px-5 pt-4 safe-bottom"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl leading-tight">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="pb-4">{children}</div>
      </section>
    </div>
  );
}
