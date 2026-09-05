import type { ProjectConfig } from "@/models/Project";
import { ResortMark } from "./Brand";

export function ProjectInfo({ project }: { project: ProjectConfig }) {
  return (
    <div>
      <p className="text-sm leading-relaxed text-muted-foreground">{project.intro}</p>
      <dl className="mt-5 grid grid-cols-2 gap-3">
        {project.stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card/60 p-3">
            <dt className="text-[0.62rem] tracking-widest text-muted-foreground uppercase">
              {stat.label}
            </dt>
            <dd className="mt-1 font-display text-2xl">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 rounded-2xl border border-border bg-card/60 p-4">
        <p className="text-[0.62rem] tracking-widest text-muted-foreground uppercase">Location</p>
        <p className="mt-1 text-base">{project.location}</p>
        <p className="mt-3 text-[0.62rem] tracking-widest text-muted-foreground uppercase">
          Developer
        </p>
        <p className="mt-1 text-base">{project.developer}</p>
      </div>
      <div className="mt-5 flex justify-center">
        <ResortMark />
      </div>
      <p className="mt-4 text-center text-[0.65rem] leading-relaxed text-muted-foreground">
        AR powered by the 8th Wall XR Engine · Copyright © 2026 Niantic Spatial, Inc.
        <br />
        <a
          className="underline"
          href="https://github.com/8thwall/engine/blob/main/LICENSE"
          target="_blank"
          rel="noreferrer"
        >
          Engine license
        </a>
        {" · "}
        <a className="underline" href="/THIRD-PARTY-NOTICES.txt" target="_blank" rel="noreferrer">
          Third-party notices
        </a>
      </p>
    </div>
  );
}
