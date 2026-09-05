import type { ProjectConfig } from "@/models/Project";
import { projectA } from "./project-a";
import { aureliaResort } from "./aurelia-resort";

export const projects: Record<string, ProjectConfig> = {
  [aureliaResort.slug]: aureliaResort,
  [projectA.slug]: projectA,
};

export const defaultProjectSlug = aureliaResort.slug;

export function getProject(slug?: string): ProjectConfig {
  if (!slug) return projects[defaultProjectSlug] as ProjectConfig;
  return projects[slug] ?? (projects[defaultProjectSlug] as ProjectConfig);
}
