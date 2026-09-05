import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ARViewer } from "@/pages/ARViewer";

const searchSchema = z.object({ project: z.string().optional() });

export const Route = createFileRoute("/ar/")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Aurelia Resort WebAR demo — walk around your future getaway" },
      {
        name: "description",
        content:
          "Scan, place and explore the Aurelia demo resort at true scale in augmented reality, straight from your phone browser.",
      },
      { property: "og:title", content: "Aurelia Resort WebAR demo viewer" },
      {
        property: "og:description",
        content:
          "Place the Aurelia demo resort in your own space and explore it in AR — no app install.",
      },
    ],
  }),
  component: ARIndexRoute,
});

function ARIndexRoute() {
  const { project } = Route.useSearch();
  return <ARViewer {...(project ? { projectSlug: project } : {})} />;
}
