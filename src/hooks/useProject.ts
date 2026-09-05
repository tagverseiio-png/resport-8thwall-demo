import { getProject } from "@/projects";
import type { ProjectConfig } from "@/models/Project";

export function useProject(slug?: string): ProjectConfig {
  return getProject(slug);
}
