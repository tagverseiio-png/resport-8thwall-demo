import { ArrowRight, Box, MapPin, ScanLine } from "lucide-react";
import type { ARMode } from "@/ar/types";
import type { ProjectConfig } from "@/models/Project";
import { ResortMark } from "./Brand";

type IntroScreenProps = {
  project: ProjectConfig;
  /** Resolved AR capability, or null while detection is still running. */
  capability: ARMode | null;
  onStart: () => void;
};

/** Copy per real capability. Nothing here promises AR on a device that lacks it. */
const COPY: Record<ARMode, { cta: string; note: string }> = {
  eighthwall: {
    cta: "Start AR",
    note: "Place {name} on your table or floor and walk around it.",
  },
  preview: {
    cta: "Explore in 3D",
    note: "This device cannot run the AR engine, so here is the full 3D model to explore.",
  },
};

export function IntroScreen({ project, capability, onStart }: IntroScreenProps) {
  const copy = COPY[capability ?? "preview"];
  const buttonClass =
    "gold-surface mt-8 flex w-full items-center justify-center gap-3 rounded-full px-7 py-4 text-sm font-semibold tracking-[0.16em] uppercase";
  return (
    <main className="relative min-h-screen overflow-hidden">
      {project.heroVideo ? (
        <video
          className="absolute inset-0 size-full object-cover"
          src={project.heroVideo}
          poster={project.heroImage}
          autoPlay
          muted
          loop
          playsInline
        />
      ) : (
        <img
          src={project.heroImage}
          alt={`${project.name} at dusk`}
          width={1088}
          height={1920}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      <div className="cinematic-veil absolute inset-0" />

      <div className="relative flex min-h-screen flex-col justify-between px-6 safe-top safe-bottom">
        <header className="flex items-center justify-between">
          <ResortMark />
          <span className="rounded-full border border-glass-border px-3 py-1 text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">
            WebAR
          </span>
        </header>

        <section className="animate-rise-in max-w-md">
          <p className="flex items-center gap-2 text-xs tracking-[0.22em] text-primary uppercase">
            <MapPin className="size-3.5" />
            {project.location}
          </p>
          <h1 className="mt-3 font-display text-5xl leading-[1.05]">{project.tagline}</h1>
          <p className="mt-4 text-lg text-foreground/90">{project.name}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{project.intro}</p>

          <dl className="mt-6 grid grid-cols-4 gap-3">
            {project.stats.map((stat) => (
              <div key={stat.label}>
                <dt className="text-[0.62rem] tracking-widest text-muted-foreground uppercase">
                  {stat.label}
                </dt>
                <dd className="mt-1 font-display text-xl">{stat.value}</dd>
              </div>
            ))}
          </dl>

          <button
            type="button"
            onClick={onStart}
            disabled={capability === null}
            className={`${buttonClass} disabled:opacity-60`}
          >
            {capability === "eighthwall" ? (
              <ScanLine className="size-4" />
            ) : (
              <Box className="size-4" />
            )}
            {capability === null ? "Checking your device" : copy.cta}
            <ArrowRight className="size-4" />
          </button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {copy.note.replace("{name}", project.name)}
          </p>
        </section>
      </div>
    </main>
  );
}
