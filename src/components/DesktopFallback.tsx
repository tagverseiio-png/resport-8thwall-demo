import { useEffect, useState } from "react";
import type { ProjectConfig } from "@/models/Project";
import { ResortMark } from "./Brand";

/** Desktop visitors get the project pitch plus a QR code to continue on mobile. */
export function DesktopFallback({
  project,
  onContinueAnyway,
}: {
  project: ProjectConfig;
  onContinueAnyway: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const url = typeof window !== "undefined" ? window.location.href : project.contact.shareUrl;

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then(async (mod) => {
      const data = await mod.toDataURL(url, {
        width: 480,
        margin: 1,
        color: { dark: "#1a1712", light: "#f6f1e7" },
      });
      if (!cancelled) setQr(data);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <main className="relative min-h-screen">
      <img
        src={project.heroImage}
        alt={`${project.name} at dusk`}
        width={1088}
        height={1920}
        className="absolute inset-0 size-full object-cover"
      />
      <div className="cinematic-veil absolute inset-0" />
      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-10 px-8 py-16 md:flex-row md:items-center">
        <section className="flex-1">
          <ResortMark />
          <h1 className="mt-6 font-display text-5xl leading-[1.05]">{project.tagline}</h1>
          <p className="mt-4 text-lg">{project.name}</p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            {project.intro}
          </p>
          <p className="mt-8 max-w-md rounded-2xl border border-glass-border bg-glass p-5 text-sm">
            Open this experience on your mobile phone to use AR. Scan the code with your phone
            camera.
          </p>
          <button
            type="button"
            onClick={onContinueAnyway}
            className="mt-4 rounded-full border border-border px-6 py-3 text-sm text-muted-foreground"
          >
            Preview on desktop instead
          </button>
        </section>
        <figure className="glass-panel flex flex-col items-center gap-4 rounded-3xl p-6">
          {qr ? (
            <img
              src={qr}
              alt="QR code to open the AR experience on a phone"
              className="size-56 rounded-xl"
            />
          ) : (
            <div className="size-56 animate-pulse rounded-xl bg-secondary" />
          )}
          <figcaption className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
            Scan to experience in AR
          </figcaption>
        </figure>
      </div>
    </main>
  );
}
