import { createFileRoute } from "@tanstack/react-router";
import { ARViewer } from "@/pages/ARViewer";
import { defaultProjectSlug, getProject } from "@/projects";

const project = getProject(defaultProjectSlug);

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: `${project.name} — AR property viewer by ${project.developer}` },
      {
        name: "description",
        content: `${project.tagline}. Place ${project.name} in your own space and explore floor plans, amenities and views in augmented reality.`,
      },
      { property: "og:title", content: `${project.name} in augmented reality` },
      {
        property: "og:description",
        content: `Explore ${project.name}, ${project.location}, at true scale from your phone browser.`,
      },
    ],
  }),
  component: Home,
});

function Home() {
  return <ARViewer projectSlug={defaultProjectSlug} />;
}
